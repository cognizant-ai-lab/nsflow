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
Endpoint tests for the MCP OAuth connector API (/api/v1/mcp/oauth/*).

These exercise the request/state-machine behavior of the endpoints with the
OAuth manager and token storage mocked, so no network calls or on-disk token
files are involved.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

import nsflow.backend.api.v1.mcp_oauth_endpoints as ep
from nsflow.backend.main import app

client = TestClient(app)

START_URL = "/api/v1/mcp/oauth/start"
CALLBACK_URL = "/api/v1/mcp/oauth/callback"
CONNECTIONS_URL = "/api/v1/mcp/oauth/connections"


def _flow(**overrides):
    """Build a stand-in for a PendingFlow with the attributes the endpoints read."""
    base = {
        "flow_id": "flow-1",
        "server_url": "https://mcp.example.com/mcp",
        "authorization_url": "https://auth.example.com/authorize?state=abc",
        "status": "awaiting_user",
        "error": None,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


# --------------------------- /start --------------------------- #

def test_start_requires_server_url():
    """A blank server_url is rejected before any flow is started."""
    response = client.post(START_URL, json={"server_url": "  "})
    assert response.status_code == 400


def test_start_already_connected(monkeypatch):
    """If a usable token already exists, /start short-circuits without a new flow."""
    monkeypatch.setattr(ep.FileTokenStorage, "has_connection", MagicMock(return_value=True))
    response = client.post(START_URL, json={"server_url": "https://mcp.example.com/mcp"})
    assert response.status_code == 200
    assert response.json()["already_connected"] is True


def test_start_success(monkeypatch):
    """A started flow returns its flow_id and authorization URL."""
    monkeypatch.setattr(ep.FileTokenStorage, "has_connection", MagicMock(return_value=False))
    monkeypatch.setattr(ep.mcp_oauth_manager, "start_flow", AsyncMock(return_value=_flow()))
    response = client.post(START_URL, json={"server_url": "https://mcp.example.com/mcp"})
    assert response.status_code == 200
    data = response.json()
    assert data["flow_id"] == "flow-1"
    parsed = urlparse(data["authorization_url"])
    assert parsed.scheme == "https"
    assert parsed.hostname == "auth.example.com"


def test_start_flow_error_returns_502(monkeypatch):
    """A flow that errors out (no authorization URL) surfaces as a 502 with its reason."""
    monkeypatch.setattr(ep.FileTokenStorage, "has_connection", MagicMock(return_value=False))
    monkeypatch.setattr(
        ep.mcp_oauth_manager,
        "start_flow",
        AsyncMock(return_value=_flow(status="error", authorization_url=None, error="registration failed")),
    )
    response = client.post(START_URL, json={"server_url": "https://mcp.example.com/mcp"})
    assert response.status_code == 502
    assert "registration failed" in response.json()["detail"]


def test_start_timeout_returns_504(monkeypatch):
    """A timeout building the authorization URL surfaces as a 504."""
    monkeypatch.setattr(ep.FileTokenStorage, "has_connection", MagicMock(return_value=False))
    monkeypatch.setattr(ep.mcp_oauth_manager, "start_flow", AsyncMock(side_effect=TimeoutError("too slow")))
    response = client.post(START_URL, json={"server_url": "https://mcp.example.com/mcp"})
    assert response.status_code == 504


def test_start_unexpected_error_returns_502(monkeypatch):
    """An unexpected failure (e.g. disk write / SDK error) maps to a clean 502."""
    monkeypatch.setattr(ep.FileTokenStorage, "has_connection", MagicMock(return_value=False))
    monkeypatch.setattr(
        ep.mcp_oauth_manager, "start_flow", AsyncMock(side_effect=OSError("disk full"))
    )
    response = client.post(START_URL, json={"server_url": "https://mcp.example.com/mcp"})
    assert response.status_code == 502
    assert "disk full" in response.json()["detail"]


# --------------------------- /callback --------------------------- #

def test_callback_missing_state():
    """A callback without a state parameter is rejected."""
    response = client.get(CALLBACK_URL)
    assert response.status_code == 400
    assert "Missing state" in response.text


def test_callback_unknown_state(monkeypatch):
    """An unknown/expired state (no matching pending flow) is rejected (CSRF guard)."""
    monkeypatch.setattr(ep.mcp_oauth_manager, "resolve_callback", MagicMock(return_value=None))
    response = client.get(CALLBACK_URL, params={"state": "nope", "code": "c"})
    assert response.status_code == 400
    assert "Unknown or expired" in response.text


def test_callback_missing_code_is_treated_as_error(monkeypatch):
    """A callback with neither code nor error resolves the flow as an error, not success."""
    resolve = MagicMock(return_value=_flow(status="error"))
    monkeypatch.setattr(ep.mcp_oauth_manager, "resolve_callback", resolve)
    response = client.get(CALLBACK_URL, params={"state": "abc"})
    assert response.status_code == 400
    # The flow must be resolved with a synthesized error and a None code so the
    # background task unblocks cleanly instead of exchanging code=None.
    kwargs = resolve.call_args.kwargs
    assert kwargs["code"] is None
    assert kwargs["error"]


def test_callback_provider_error(monkeypatch):
    """An explicit provider error is reported back to the popup."""
    monkeypatch.setattr(ep.mcp_oauth_manager, "resolve_callback", MagicMock(return_value=_flow(status="error")))
    response = client.get(
        CALLBACK_URL,
        params={"state": "abc", "error": "access_denied", "error_description": "user said no"},
    )
    assert response.status_code == 400
    assert "access_denied" in response.text


def test_callback_success(monkeypatch):
    """A completed flow with a stored token reports success."""
    monkeypatch.setattr(ep.mcp_oauth_manager, "resolve_callback", MagicMock(return_value=_flow(status="completed")))
    monkeypatch.setattr(ep.mcp_oauth_manager, "wait_for_completion", AsyncMock(return_value=None))
    monkeypatch.setattr(ep.FileTokenStorage, "has_connection", MagicMock(return_value=True))
    response = client.get(CALLBACK_URL, params={"state": "abc", "code": "the-code"})
    assert response.status_code == 200
    assert "Connected" in response.text


def test_callback_token_present_but_status_not_completed_is_success(monkeypatch):
    """A persisted token is the source of truth even if flow.status lags.

    wait_for_completion() can time out and return before the background task
    records "completed", while the token exchange already stored a token. The
    callback must report success based on has_connection(), not flow.status.
    """
    flow = _flow(status="awaiting_user")  # status never advanced to "completed"
    monkeypatch.setattr(ep.mcp_oauth_manager, "resolve_callback", MagicMock(return_value=flow))
    monkeypatch.setattr(ep.mcp_oauth_manager, "wait_for_completion", AsyncMock(return_value=None))
    monkeypatch.setattr(ep.FileTokenStorage, "has_connection", MagicMock(return_value=True))
    response = client.get(CALLBACK_URL, params={"state": "abc", "code": "the-code"})
    assert response.status_code == 200
    assert "Connected" in response.text
    # flow.status is reconciled so /status polling agrees.
    assert flow.status == "completed"


def test_callback_completed_without_token_is_error(monkeypatch):
    """If the token never persisted, the callback reports failure (not optimistic success)."""
    monkeypatch.setattr(
        ep.mcp_oauth_manager,
        "resolve_callback",
        MagicMock(return_value=_flow(status="error", error="token exchange failed")),
    )
    monkeypatch.setattr(ep.mcp_oauth_manager, "wait_for_completion", AsyncMock(return_value=None))
    monkeypatch.setattr(ep.FileTokenStorage, "has_connection", MagicMock(return_value=False))
    response = client.get(CALLBACK_URL, params={"state": "abc", "code": "the-code"})
    assert response.status_code == 400
    assert "token exchange failed" in response.text


def test_callback_escapes_reflected_user_input(monkeypatch):
    """User-controlled values are HTML-escaped, not reflected raw (XSS guard)."""
    monkeypatch.setattr(ep.mcp_oauth_manager, "resolve_callback", MagicMock(return_value=_flow(status="error")))
    response = client.get(
        CALLBACK_URL,
        params={"state": "abc", "error_description": "</script><b>boom</b>"},
    )
    assert response.status_code == 400
    assert "</script><b>boom</b>" not in response.text
    assert "&lt;/script&gt;" in response.text


# --------------------------- /status --------------------------- #

def test_status_unknown_flow(monkeypatch):
    """Polling an unknown flow id is a 404."""
    monkeypatch.setattr(ep.mcp_oauth_manager, "get_flow", MagicMock(return_value=None))
    response = client.get("/api/v1/mcp/oauth/status/does-not-exist")
    assert response.status_code == 404


def test_status_known_flow(monkeypatch):
    """Polling a known flow returns its status."""
    monkeypatch.setattr(ep.mcp_oauth_manager, "get_flow", MagicMock(return_value=_flow(status="completed")))
    response = client.get("/api/v1/mcp/oauth/status/flow-1")
    assert response.status_code == 200
    assert response.json()["status"] == "completed"


# --------------------- /connections & /redirect_uri --------------------- #

def test_list_connections(monkeypatch):
    """Connections are listed as returned by storage (non-secret metadata)."""
    conns = [{
        "server_url": "https://mcp.example.com/mcp",
        "obtained_at": 1,
        "expires_at": None,
        "has_refresh_token": False,
    }]
    monkeypatch.setattr(ep.FileTokenStorage, "list_connections", MagicMock(return_value=conns))
    response = client.get(CONNECTIONS_URL)
    assert response.status_code == 200
    assert response.json()["connections"] == conns


def test_delete_connection(monkeypatch):
    """Deleting a connection reports whether it was removed."""
    monkeypatch.setattr(ep.FileTokenStorage, "remove", AsyncMock(return_value=True))
    response = client.delete(CONNECTIONS_URL, params={"server_url": "https://mcp.example.com/mcp"})
    assert response.status_code == 200
    assert response.json()["removed"] is True


def test_delete_connection_blank_server_url(monkeypatch):
    """A whitespace-only server_url is rejected, not treated as remove("")."""
    remove = AsyncMock(return_value=False)
    monkeypatch.setattr(ep.FileTokenStorage, "remove", remove)
    response = client.delete(CONNECTIONS_URL, params={"server_url": "   "})
    assert response.status_code == 400
    remove.assert_not_awaited()


def test_required_reports_missing(monkeypatch):
    """/required surfaces the unconnected MCP URLs a network needs."""
    import nsflow.backend.utils.agentutils.ns_websocket_utils as nw
    monkeypatch.setattr(
        nw.NsWebsocketUtils, "missing_mcp_connections",
        MagicMock(return_value=["https://api.githubcopilot.com/mcp"]),
    )
    response = client.get("/api/v1/mcp/oauth/required/my_net")
    assert response.status_code == 200
    body = response.json()
    assert body["network"] == "my_net"
    assert body["missing"] == ["https://api.githubcopilot.com/mcp"]


def test_required_none_reports_empty(monkeypatch):
    """A non-locally-readable network (None) reports nothing missing, not an error."""
    import nsflow.backend.utils.agentutils.ns_websocket_utils as nw
    monkeypatch.setattr(nw.NsWebsocketUtils, "missing_mcp_connections", MagicMock(return_value=None))
    response = client.get("/api/v1/mcp/oauth/required/remote_net")
    assert response.status_code == 200
    assert response.json()["missing"] == []


def test_redirect_uri(monkeypatch):
    """The redirect URI endpoint returns the manager's computed callback URL."""
    uri = "http://127.0.0.1:8005/api/v1/mcp/oauth/callback"
    monkeypatch.setattr(ep.mcp_oauth_manager, "compute_redirect_uri", MagicMock(return_value=uri))
    response = client.get("/api/v1/mcp/oauth/redirect_uri")
    assert response.status_code == 200
    assert response.json()["redirect_uri"] == uri


# --------------------- _normalize_authorization_url --------------------- #

def test_normalize_auth_url_fixes_double_question_mark():
    """An authorization_endpoint that already had a query (e.g. Microsoft's
    ?prompt=select_account) must not produce a second '?'; later '?' -> '&'."""
    from nsflow.backend.utils.mcp.mcp_oauth_manager import MCPOAuthManager
    bad = (
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
        "?prompt=select_account?response_type=code&client_id=abc&state=xyz"
    )
    fixed = MCPOAuthManager._normalize_authorization_url(bad)
    assert fixed.count("?") == 1
    q = parse_qs(urlparse(fixed).query)
    assert q["prompt"] == ["select_account"]
    assert q["response_type"] == ["code"]
    assert q["state"] == ["xyz"]


def test_normalize_auth_url_leaves_normal_url_untouched():
    """A normal authorization URL (single query separator) is returned as-is."""
    from nsflow.backend.utils.mcp.mcp_oauth_manager import MCPOAuthManager
    normal = "https://idp.example.com/authorize?response_type=code&client_id=abc&state=xyz"
    assert MCPOAuthManager._normalize_authorization_url(normal) == normal
