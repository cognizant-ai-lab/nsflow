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
Tests for the MCP OAuth token-injection path in NsWebsocketUtils:

  * ``_normalize_mcp_url`` - URL canonicalization used only for matching.
  * ``get_network_mcp_urls`` - discovering the MCP URLs a network references.
  * ``inject_mcp_auth_headers`` - merging fresh Bearer tokens into sly_data,
    matching connections to referenced URLs by their normalized form.

The class' real ``__init__`` needs an active config registry and a live
WebSocket, so instances are built with ``__new__`` and only the few attributes
these methods touch are set. External dependencies (token storage, the OAuth
manager, the network loader) are patched.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock

import nsflow.backend.utils.agentutils.ns_websocket_utils as nw

NORM = nw.NsWebsocketUtils._normalize_mcp_url


def _utils(agent_name="net"):
    """Build a NsWebsocketUtils without running its heavy constructor."""
    inst = nw.NsWebsocketUtils.__new__(nw.NsWebsocketUtils)
    inst.agent_name = agent_name
    return inst


# --------------------------- _normalize_mcp_url --------------------------- #

def test_normalize_trailing_slash():
    assert NORM("https://api.example.com/mcp/") == NORM("https://api.example.com/mcp")


def test_normalize_host_case():
    assert NORM("https://API.Example.COM/mcp") == NORM("https://api.example.com/mcp")


def test_normalize_strips_default_https_port():
    assert NORM("https://api.example.com:443/mcp") == NORM("https://api.example.com/mcp")


def test_normalize_strips_default_http_port():
    assert NORM("http://api.example.com:80/mcp") == NORM("http://api.example.com/mcp")


def test_normalize_preserves_nondefault_port():
    # :8443 genuinely identifies a different endpoint and must not be folded away.
    assert NORM("https://api.example.com:8443/mcp") != NORM("https://api.example.com/mcp")


def test_normalize_different_host_differs():
    assert NORM("https://a.example.com/mcp") != NORM("https://b.example.com/mcp")


def test_normalize_preserves_query():
    assert NORM("https://api.example.com/mcp?v=1") != NORM("https://api.example.com/mcp")


def test_normalize_bad_input_falls_back_to_stripped_original():
    # A non-URL string should simply normalize to itself (exact-string behavior).
    assert NORM("  not a url  ") == "not a url"


# --------------------------- get_network_mcp_urls --------------------------- #

def _patch_network(monkeypatch, *, config=None, raise_exc=None, network_none=False):
    fake_anu = MagicMock()
    if raise_exc is not None:
        fake_anu.return_value.get_agent_network.side_effect = raise_exc
    elif network_none:
        fake_anu.return_value.get_agent_network.return_value = None
    else:
        net = MagicMock()
        net.get_config.return_value = config
        fake_anu.return_value.get_agent_network.return_value = net
    monkeypatch.setattr(nw, "AgentNetworkUtils", fake_anu)


def test_get_urls_dict_reference_tool(monkeypatch):
    config = {"tools": [{"name": "front", "url": "https://api.example.com/mcp"}]}
    _patch_network(monkeypatch, config=config)
    assert _utils().get_network_mcp_urls() == {"https://api.example.com/mcp"}


def test_get_urls_string_reference_tool(monkeypatch):
    # A bare http(s) string in a tools list is an MCP server reference.
    config = {"tools": [{"name": "front", "tools": ["https://api.example.com/mcp", "helper"]}]}
    _patch_network(monkeypatch, config=config)
    assert _utils().get_network_mcp_urls() == {"https://api.example.com/mcp"}


def test_get_urls_ignores_agent_name_refs(monkeypatch):
    # Non-URL tool references (agent names) are not collected.
    config = {"tools": [{"name": "front", "tools": ["helper_a", "helper_b"]}]}
    _patch_network(monkeypatch, config=config)
    assert _utils().get_network_mcp_urls() == set()


def test_get_urls_multiple(monkeypatch):
    config = {"tools": [
        {"name": "a", "url": "https://one.example.com/mcp"},
        {"name": "b", "tools": ["https://two.example.com/mcp"]},
    ]}
    _patch_network(monkeypatch, config=config)
    assert _utils().get_network_mcp_urls() == {
        "https://one.example.com/mcp", "https://two.example.com/mcp",
    }


def test_get_urls_remote_or_missing_network_returns_none(monkeypatch):
    # get_agent_network raising (invalid/remote/unreadable) -> None (caller fallback).
    _patch_network(monkeypatch, raise_exc=FileNotFoundError("not local"))
    assert _utils().get_network_mcp_urls() is None


def test_get_urls_network_none_returns_none(monkeypatch):
    _patch_network(monkeypatch, network_none=True)
    assert _utils().get_network_mcp_urls() is None


# --------------------------- inject_mcp_auth_headers --------------------------- #

def _patch_injection(monkeypatch, *, connections, referenced, token="Bearer tok"):
    """Patch storage list, the network's referenced URLs, and the token fetch."""
    monkeypatch.setattr(
        nw.FileTokenStorage, "list_connections",
        MagicMock(return_value=[{"server_url": u} for u in connections]),
    )
    get_token = AsyncMock(return_value=token)
    monkeypatch.setattr(nw.mcp_oauth_manager, "get_fresh_token", get_token)
    inst = _utils()
    inst.get_network_mcp_urls = lambda: (None if referenced is None else set(referenced))
    return inst, get_token


def test_inject_exact_match(monkeypatch):
    url = "https://api.example.com/mcp"
    inst, get_token = _patch_injection(monkeypatch, connections=[url], referenced=[url])
    sly = {}
    asyncio.run(inst.inject_mcp_auth_headers(sly))
    assert sly["http_headers"][url] == {"Authorization": "Bearer tok"}
    get_token.assert_awaited_once_with(url)


def test_inject_trailing_slash_mismatch(monkeypatch):
    stored = "https://api.example.com/mcp"
    referenced = "https://api.example.com/mcp/"  # network uses the trailing-slash form
    inst, get_token = _patch_injection(monkeypatch, connections=[stored], referenced=[referenced])
    sly = {}
    asyncio.run(inst.inject_mcp_auth_headers(sly))
    # Header is keyed by the URL the NETWORK references (what the adapter looks up)...
    assert referenced in sly["http_headers"]
    assert stored not in sly["http_headers"]
    # ...but the token is fetched using the STORED connection URL.
    get_token.assert_awaited_once_with(stored)


def test_inject_no_match_does_nothing(monkeypatch):
    inst, get_token = _patch_injection(
        monkeypatch,
        connections=["https://connected.example.com/mcp"],
        referenced=["https://other.example.com/mcp"],
    )
    sly = {}
    asyncio.run(inst.inject_mcp_auth_headers(sly))
    assert sly == {}
    get_token.assert_not_awaited()


def test_inject_fallback_injects_all_connections(monkeypatch):
    # referenced is None (HOCON not locally readable) -> inject every connection.
    conns = ["https://a.example.com/mcp", "https://b.example.com/mcp"]
    inst, get_token = _patch_injection(monkeypatch, connections=conns, referenced=None)
    sly = {}
    asyncio.run(inst.inject_mcp_auth_headers(sly))
    assert set(sly["http_headers"]) == set(conns)


def test_inject_preserves_user_authorization(monkeypatch):
    url = "https://api.example.com/mcp"
    inst, get_token = _patch_injection(monkeypatch, connections=[url], referenced=[url])
    sly = {"http_headers": {url: {"Authorization": "Bearer user-token"}}}
    asyncio.run(inst.inject_mcp_auth_headers(sly))
    # User-supplied Authorization wins; we never fetch/overwrite.
    assert sly["http_headers"][url]["Authorization"] == "Bearer user-token"
    get_token.assert_not_awaited()


def test_inject_no_token_available_skips(monkeypatch):
    url = "https://api.example.com/mcp"
    inst, _ = _patch_injection(monkeypatch, connections=[url], referenced=[url], token=None)
    sly = {}
    asyncio.run(inst.inject_mcp_auth_headers(sly))
    # get_fresh_token returned None (expired/needs re-auth) -> nothing injected.
    assert sly.get("http_headers", {}) == {}


def test_inject_coerces_non_dict_http_headers(monkeypatch):
    url = "https://api.example.com/mcp"
    inst, _ = _patch_injection(monkeypatch, connections=[url], referenced=[url])
    sly = {"http_headers": "oops-not-a-dict"}
    asyncio.run(inst.inject_mcp_auth_headers(sly))
    assert isinstance(sly["http_headers"], dict)
    assert sly["http_headers"][url] == {"Authorization": "Bearer tok"}


def test_inject_no_connections_returns_early(monkeypatch):
    inst, get_token = _patch_injection(monkeypatch, connections=[], referenced=["https://x/mcp"])
    sly = {}
    asyncio.run(inst.inject_mcp_auth_headers(sly))
    assert sly == {}
    get_token.assert_not_awaited()


def test_inject_preserves_other_existing_headers(monkeypatch):
    url = "https://api.example.com/mcp"
    inst, _ = _patch_injection(monkeypatch, connections=[url], referenced=[url])
    # An unrelated header dict already on this URL should be merged, not clobbered.
    sly = {"http_headers": {url: {"X-Custom": "keep-me"}}}
    asyncio.run(inst.inject_mcp_auth_headers(sly))
    assert sly["http_headers"][url]["X-Custom"] == "keep-me"
    assert sly["http_headers"][url]["Authorization"] == "Bearer tok"
