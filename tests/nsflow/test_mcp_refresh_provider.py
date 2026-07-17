# Copyright © 2025 Cognizant Technology Solutions Corp, www.cognizant.com.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# END COPYRIGHT
"""
Tests for the silent (headless) MCP token refresh.

These drive ``SilentRefreshOAuthProvider`` through real httpx auth flows against
an ``httpx.MockTransport``, with tokens persisted in a temp-dir FileTokenStorage
- no network and no live MCP session. They pin the behavior the stock SDK
provider gets wrong for stored tokens: the refresh grant must fire proactively
(before the request) using the token endpoint captured at connect time, and a
failed refresh must leave the stored token untouched rather than falling into
interactive re-authentication.
"""

import asyncio
import json
import time

import httpx
import pytest
from mcp.shared.auth import OAuthClientMetadata
from mcp.shared.auth import OAuthToken

import nsflow.backend.utils.mcp.mcp_oauth_manager as om
from nsflow.backend.utils.mcp.mcp_refresh_provider import SilentRefreshOAuthProvider
from nsflow.backend.utils.mcp.mcp_token_storage import FileTokenStorage

SERVER_URL = "https://mcp.example.com/mcp"
TOKEN_ENDPOINT = "https://auth.example.com/oauth/token"


def _seed_store(
    tmp_path, *, refresh_token="refresh-1", expires_at=None, token_endpoint=TOKEN_ENDPOINT, needs_reauth=False
):
    """Write a tokens.json entry the way a completed connect flow would have."""
    tokens = {"access_token": "stale-token", "token_type": "Bearer"}
    if refresh_token:
        tokens["refresh_token"] = refresh_token
    entry = {
        "tokens": tokens,
        "client_info": {
            "client_id": "client-1",
            "redirect_uris": ["http://localhost:4173/api/v1/mcp/oauth/callback"],
            "token_endpoint_auth_method": "none",
        },
        "obtained_at": int(time.time()) - 7200,
        "expires_at": expires_at if expires_at is not None else int(time.time()) - 3600,
    }
    if token_endpoint:
        entry["token_endpoint"] = token_endpoint
    if needs_reauth:
        entry["needs_reauth"] = True
    (tmp_path / "tokens.json").write_text(json.dumps({SERVER_URL: entry}), encoding="utf-8")


def _read_store(tmp_path):
    return json.loads((tmp_path / "tokens.json").read_text(encoding="utf-8"))[SERVER_URL]


def _client_metadata():
    return OAuthClientMetadata(
        redirect_uris=None,
        grant_types=["authorization_code", "refresh_token"],
        token_endpoint_auth_method="none",
    )


def _provider(tmp_path, *, token_expiry_time, token_endpoint=TOKEN_ENDPOINT):
    return SilentRefreshOAuthProvider(
        server_url=SERVER_URL,
        client_metadata=_client_metadata(),
        storage=FileTokenStorage(SERVER_URL, storage_dir=tmp_path),
        token_expiry_time=token_expiry_time,
        token_endpoint=token_endpoint,
    )


def _request_through(provider, handler):
    """Send one GET to the server through the provider's auth flow via a mock transport."""

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await client.get(SERVER_URL, auth=provider)

    return asyncio.run(run())


def test_proactive_refresh_fires_before_request(tmp_path):
    """
    A stale stored token is refreshed via the stored token endpoint BEFORE the
    server request, and the new tokens (with a fresh expires_at) are persisted.
    The server never needs to answer 401 - the case the stock provider misses.
    """
    _seed_store(tmp_path)
    provider = _provider(tmp_path, token_expiry_time=time.time() - 10)

    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        if str(request.url) == TOKEN_ENDPOINT:
            body = dict(pair.split("=", 1) for pair in request.content.decode().split("&"))
            assert body["grant_type"] == "refresh_token"
            assert body["refresh_token"] == "refresh-1"
            assert body["client_id"] == "client-1"
            return httpx.Response(
                200,
                json={
                    "access_token": "fresh-token",
                    "token_type": "Bearer",
                    "expires_in": 3600,
                    "refresh_token": "refresh-2",
                },
            )
        # The actual server request must already carry the refreshed token.
        assert request.headers["Authorization"] == "Bearer fresh-token"
        return httpx.Response(200, json={})

    response = _request_through(provider, handler)

    assert response.status_code == 200
    assert calls[0] == TOKEN_ENDPOINT  # refresh grant went out first, proactively
    entry = _read_store(tmp_path)
    assert entry["tokens"]["access_token"] == "fresh-token"
    assert entry["tokens"]["refresh_token"] == "refresh-2"
    assert entry["expires_at"] > time.time()  # wall-clock expiry re-anchored
    assert entry["token_endpoint"] == TOKEN_ENDPOINT  # set_tokens preserved it


def test_refresh_without_rotation_keeps_stored_refresh_token(tmp_path):
    """
    Providers like Salesforce omit the refresh token from a refresh response,
    meaning "keep using the existing one" (RFC 6749 section 6). The stored
    refresh token must survive the overwrite, or the next refresh would find
    null and force a reconnect.
    """
    _seed_store(tmp_path)
    provider = _provider(tmp_path, token_expiry_time=time.time() - 10)

    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == TOKEN_ENDPOINT:
            # No refresh_token in the response - the non-rotating style.
            return httpx.Response(
                200, json={"access_token": "fresh-token", "token_type": "Bearer", "expires_in": 3600}
            )
        return httpx.Response(200, json={})

    response = _request_through(provider, handler)

    assert response.status_code == 200
    entry = _read_store(tmp_path)
    assert entry["tokens"]["access_token"] == "fresh-token"
    assert entry["tokens"]["refresh_token"] == "refresh-1"  # preserved, not nulled
    assert entry["expires_at"] > time.time()

    # A second refresh cycle must still be possible with the preserved token.
    provider2 = _provider(tmp_path, token_expiry_time=time.time() - 10)
    response2 = _request_through(provider2, handler)
    assert response2.status_code == 200
    assert _read_store(tmp_path)["tokens"]["refresh_token"] == "refresh-1"


def test_valid_token_is_not_refreshed(tmp_path):
    """A token whose restored expiry is still in the future is used as-is."""
    future = time.time() + 3600
    _seed_store(tmp_path, expires_at=int(future))
    provider = _provider(tmp_path, token_expiry_time=future)

    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        assert request.headers["Authorization"] == "Bearer stale-token"
        return httpx.Response(200, json={})

    response = _request_through(provider, handler)

    assert response.status_code == 200
    assert calls == [SERVER_URL]  # no refresh-grant request was made


def test_failed_refresh_never_goes_interactive_and_keeps_stored_token(tmp_path):
    """
    When the refresh grant is rejected (e.g. invalid_grant after revocation) and
    the server 401s, the provider must raise instead of opening a browser - and
    the stored (stale) tokens must survive so the UI can prompt a reconnect.
    """
    _seed_store(tmp_path)
    provider = _provider(tmp_path, token_expiry_time=time.time() - 10)

    authorize_hits = []

    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == TOKEN_ENDPOINT:
            return httpx.Response(400, json={"error": "invalid_grant"})
        if "authorize" in str(request.url):
            authorize_hits.append(str(request.url))  # pragma: no cover - must not happen
        if str(request.url) == SERVER_URL:
            return httpx.Response(401)
        # Discovery lookups (.well-known/...) find nothing.
        return httpx.Response(404)

    with pytest.raises(Exception):
        _request_through(provider, handler)

    assert not authorize_hits  # interactive authorization was never attempted
    entry = _read_store(tmp_path)
    assert entry["tokens"]["access_token"] == "stale-token"  # store untouched
    assert entry["tokens"]["refresh_token"] == "refresh-1"


def test_silent_refresh_wires_stored_expiry_and_endpoint(tmp_path, monkeypatch):
    """
    get_fresh_token's silent refresh hands the provider the persisted expiry
    (minus the refresh margin) and the token endpoint captured at connect time.
    """
    monkeypatch.setenv("NSFLOW_MCP_STORAGE_DIR", str(tmp_path))
    expires_at = int(time.time()) - 3600
    _seed_store(tmp_path, expires_at=expires_at)

    captured = {}

    class _CaptureProvider:  # pylint: disable=too-few-public-methods  # minimal test stand-in
        def __init__(self, **kwargs):
            captured.update(kwargs)

    def _no_probe(**_kwargs):
        raise RuntimeError("probe stopped by test")

    monkeypatch.setattr(om, "SilentRefreshOAuthProvider", _CaptureProvider)
    monkeypatch.setattr(om, "streamablehttp_client", _no_probe)

    # Still expired after the (stopped) refresh -> nothing injectable.
    assert asyncio.run(om.mcp_oauth_manager.get_fresh_token(SERVER_URL)) is None

    assert captured["server_url"] == SERVER_URL
    assert captured["token_endpoint"] == TOKEN_ENDPOINT
    assert captured["token_expiry_time"] == expires_at - om.TOKEN_REFRESH_MARGIN_SECONDS
    # The failed refresh is persisted so the UI can prompt a reconnect.
    assert _read_store(tmp_path).get("needs_reauth") is True


def test_needs_reauth_entry_listed_but_not_connected(tmp_path):
    """
    A marked entry gates like a disconnected server (has_connection False, so
    /start allows re-auth and the network gate prompts) but is still listed -
    flagged - so the Connectors panel can show "Reconnect required" instead of
    the connection silently vanishing.
    """
    _seed_store(tmp_path, needs_reauth=True)  # expired, refresh token present, marker set
    assert FileTokenStorage.has_connection(SERVER_URL, storage_dir=tmp_path) is False
    conns = FileTokenStorage.list_connections(storage_dir=tmp_path)
    assert [c["server_url"] for c in conns] == [SERVER_URL]
    assert conns[0]["needs_reauth"] is True

    # Without the marker, the same expired-but-refreshable entry counts as
    # connected (the refresh is presumed to work until it fails).
    _seed_store(tmp_path, needs_reauth=False)
    assert FileTokenStorage.has_connection(SERVER_URL, storage_dir=tmp_path) is True
    assert FileTokenStorage.list_connections(storage_dir=tmp_path)[0]["needs_reauth"] is False


def test_successful_refresh_clears_needs_reauth(tmp_path):
    """
    The marker self-heals: a refresh that succeeds (e.g. the earlier failure was
    a transient network error) writes fresh tokens, which clears needs_reauth.
    """
    _seed_store(tmp_path, needs_reauth=True)
    provider = _provider(tmp_path, token_expiry_time=time.time() - 10)

    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == TOKEN_ENDPOINT:
            return httpx.Response(
                200, json={"access_token": "fresh-token", "token_type": "Bearer", "expires_in": 3600}
            )
        return httpx.Response(200, json={})

    response = _request_through(provider, handler)

    assert response.status_code == 200
    entry = _read_store(tmp_path)
    assert entry["tokens"]["access_token"] == "fresh-token"
    assert "needs_reauth" not in entry
    assert FileTokenStorage.has_connection(SERVER_URL, storage_dir=tmp_path) is True


def test_set_needs_reauth_does_not_create_stub_entries(tmp_path):
    """Marking a server with no stored tokens is a no-op, not a stub entry."""
    _seed_store(tmp_path)
    other = FileTokenStorage("https://other.example.com/mcp", storage_dir=tmp_path)
    asyncio.run(other.set_needs_reauth())
    blob = json.loads((tmp_path / "tokens.json").read_text(encoding="utf-8"))
    assert "https://other.example.com/mcp" not in blob


def test_set_tokens_stores_explicit_empty_refresh_token(tmp_path):
    """
    Only an omitted/None refresh_token means "keep using the existing one"
    (RFC 6749 section 6). An explicit empty string is a server clearing the
    token and must be stored as sent, not swapped for the previous value.
    """
    _seed_store(tmp_path, token_endpoint=None)
    storage = FileTokenStorage(SERVER_URL, storage_dir=tmp_path)

    asyncio.run(storage.set_tokens(OAuthToken(access_token="fresh-token", refresh_token="")))

    assert _read_store(tmp_path)["tokens"]["refresh_token"] == ""


def test_set_token_endpoint_persists_and_merges(tmp_path):
    """set_token_endpoint adds to an existing entry without clobbering tokens."""
    _seed_store(tmp_path, token_endpoint=None)
    storage = FileTokenStorage(SERVER_URL, storage_dir=tmp_path)

    asyncio.run(storage.set_token_endpoint(TOKEN_ENDPOINT))

    entry = _read_store(tmp_path)
    assert entry["token_endpoint"] == TOKEN_ENDPOINT
    assert entry["tokens"]["access_token"] == "stale-token"
    assert storage.get_metadata()["token_endpoint"] == TOKEN_ENDPOINT
