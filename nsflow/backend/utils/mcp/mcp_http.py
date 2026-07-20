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
httpx-level helpers for the MCP OAuth flow.

Split out of ``mcp_oauth_manager`` so that module stays focused on flow
orchestration: this one owns how the underlying httpx client is built and, for
auth-optional servers, how a synthetic ``401`` challenge is injected so the
SDK's 401-driven OAuth flow can start. Depends only on httpx and the MCP SDK
(never on ``mcp_oauth_manager``), so it is import-cycle-free.
"""

import asyncio
from typing import Optional
from urllib.parse import urlsplit

import httpx

# create_mcp_http_client currently lives in the private mcp.shared._httpx_utils
# (that is where the SDK's own client modules import it from as of mcp 1.27.x).
# Prefer a public path if a future SDK promotes it (underscore -> public is a
# common deprecation path), and fall back to the private module for current and
# older versions.
try:
    from mcp.shared.httpx_utils import create_mcp_http_client  # type: ignore
except ImportError:  # pragma: no cover - exercised only on older/newer SDK layouts
    from mcp.shared._httpx_utils import create_mcp_http_client

# RFC 9728 well-known URL builder. The SDK uses this to locate a server's
# protected-resource metadata after a 401 challenge; we reuse it to probe for
# that metadata on servers that never send the challenge (see
# _discover_protected_resource_metadata). Local fallback in case a future SDK
# moves the helper.
try:
    from mcp.client.auth.utils import build_protected_resource_metadata_discovery_urls
except ImportError:  # pragma: no cover - exercised only on older/newer SDK layouts

    def build_protected_resource_metadata_discovery_urls(www_auth_url, server_url):
        """Fallback RFC 9728 discovery URL builder: path-inserted, then root."""
        del www_auth_url  # only used by the SDK's 401-challenge path
        parsed = urlsplit(server_url)
        base = f"{parsed.scheme}://{parsed.netloc}"
        urls = []
        if parsed.path and parsed.path != "/":
            urls.append(f"{base}/.well-known/oauth-protected-resource{parsed.path}")
        urls.append(f"{base}/.well-known/oauth-protected-resource")
        return urls


async def _force_json_accept_on_oauth_requests(request: httpx.Request) -> None:
    """
    httpx request hook: force ``Accept: application/json`` on OAuth token/refresh
    requests. Some authorization servers (notably GitHub's
    ``…/login/oauth/access_token``) return a form-encoded body unless the client
    explicitly asks for JSON, which then fails the SDK's JSON token parsing.

    These OAuth requests are form-encoded (``application/x-www-form-urlencoded``),
    which uniquely distinguishes them from MCP streamable-HTTP JSON-RPC POSTs
    (``application/json``, which must keep their ``application/json,
    text/event-stream`` Accept header), so this never touches MCP traffic.
    """
    content_type = request.headers.get("content-type", "")
    if content_type.startswith("application/x-www-form-urlencoded"):
        request.headers["Accept"] = "application/json"


def _mcp_http_client_factory(headers=None, timeout=None, auth=None, **kwargs) -> httpx.AsyncClient:
    """
    MCP http client factory that adds the OAuth Accept-JSON request hook.

    Accepts and forwards any extra keyword arguments so the factory stays
    compatible if a future MCP SDK passes additional parameters to
    ``httpx_client_factory`` (a common forward-compat pattern). Forwarding rather
    than dropping them means new client settings (proxy, TLS verify, etc.) still
    reach the underlying client - and since we wrap the SDK's own
    ``create_mcp_http_client``, anything it passes is something it accepts.
    """
    client = create_mcp_http_client(headers=headers, timeout=timeout, auth=auth, **kwargs)
    client.event_hooks.setdefault("request", []).append(_force_json_accept_on_oauth_requests)
    return client


class _SyntheticChallengeTransport(httpx.AsyncBaseTransport):
    """
    Transport wrapper that answers the FIRST request with a synthetic
    ``401 Unauthorized`` whose ``WWW-Authenticate`` challenge points at the
    server's RFC 9728 protected-resource metadata; every later request passes
    through to the real transport.

    Auth-optional MCP servers (e.g. Google Maps, Hugging Face) answer an
    unauthenticated ``initialize`` with 200 and only reject tool calls - so the
    SDK's ``OAuthClientProvider``, which starts its OAuth flow exclusively from
    a 401 response, never authorizes. When such a server still publishes
    protected-resource metadata, this shim fakes the missing trigger; from that
    401 onward the stock SDK flow runs unmodified (metadata fetch, client
    registration, authorization, token exchange) over the wrapped transport.
    """

    def __init__(self, inner: httpx.AsyncBaseTransport, resource_metadata_url: str, fired: Optional[list] = None):
        self._inner = inner
        self._resource_metadata_url = resource_metadata_url
        # One-shot gate. When one client wraps several transports (its default
        # plus one per proxy mount), they must share the gate so exactly one
        # request across the whole client is challenged. A single-element list is
        # a tiny shared mutable cell; a fresh one => standalone (one wrapper).
        self._fired = fired if fired is not None else [False]

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        # No await between the read and the set, so this is atomic under asyncio:
        # concurrent requests (e.g. the POST and the GET SSE stream) can't both
        # see False, and exactly one 401 is emitted.
        if not self._fired[0]:
            self._fired[0] = True
            challenge = f'Bearer resource_metadata="{self._resource_metadata_url}"'
            return httpx.Response(401, headers={"WWW-Authenticate": challenge}, request=request)
        return await self._inner.handle_async_request(request)

    async def aclose(self) -> None:
        await self._inner.aclose()


def _challenge_http_client_factory(resource_metadata_url: str):
    """
    Build an ``httpx_client_factory`` whose clients 401 the first request with
    a synthetic challenge pointing at ``resource_metadata_url`` (see
    ``_SyntheticChallengeTransport``).
    """

    def _factory(headers=None, timeout=None, auth=None, **kwargs) -> httpx.AsyncClient:
        client = _mcp_http_client_factory(headers=headers, timeout=timeout, auth=auth, **kwargs)
        # create_mcp_http_client exposes no transport parameter, so wrap the
        # built client's transports. httpx routes via _mounts (env-proxy
        # transports) BEFORE falling back to _transport, so wrapping only
        # _transport would miss every request behind an HTTPS/ALL proxy - wrap
        # the default AND each mount, sharing one gate so still only one 401
        # fires whichever transport httpx picks. _transport/_mounts are stable
        # across httpx releases.
        fired: list = [False]

        def _wrap(transport):
            if transport is None:  # a None mount means "use the default transport"
                return None
            return _SyntheticChallengeTransport(transport, resource_metadata_url, fired)

        client._transport = _wrap(client._transport)  # pylint: disable=protected-access
        client._mounts = {  # pylint: disable=protected-access
            pattern: _wrap(transport)
            for pattern, transport in client._mounts.items()  # pylint: disable=protected-access
        }
        return client

    return _factory


async def _discover_protected_resource_metadata(server_url: str) -> Optional[str]:
    """
    Return the URL of the server's RFC 9728 protected-resource metadata, or
    None if it publishes none.

    Probes the same well-known locations the SDK derives from a 401 challenge
    (path-inserted form first, then root). Used for auth-optional servers that
    never send that challenge: a published metadata document with an
    ``authorization_servers`` list is the signal that the server does take
    OAuth, and its URL seeds the synthetic challenge.
    """
    urls = build_protected_resource_metadata_discovery_urls(None, server_url)

    async def _usable(client, url):
        """Return url if it serves PRM naming an authorization server, else None."""
        try:
            response = await client.get(url, timeout=10)
        except httpx.HTTPError:
            return None
        if response.status_code != 200:
            return None
        try:
            data = response.json()
        except ValueError:
            return None
        return url if isinstance(data, dict) and data.get("authorization_servers") else None

    async with _mcp_http_client_factory() as client:
        # Probe the well-known forms concurrently (worst case one timeout, not
        # their sum), but keep RFC 9728 preference order: the path-inserted form
        # wins over root when both resolve.
        results = await asyncio.gather(*(_usable(client, url) for url in urls))
    return next((url for url in results if url), None)
