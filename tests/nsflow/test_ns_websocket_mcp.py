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


REDACT = nw.NsWebsocketUtils.redact_sly_data_for_surface
MERGE = nw.NsWebsocketUtils._merge_user_sly_data


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


def test_get_urls_ignores_tool_refs_without_schema(monkeypatch):
    # MCP servers a network merely references (dict `url` or a bare string in a
    # `tools` list) but does NOT declare in its sly_data_schema need no auth, so
    # they are not collected - only the schema is the auth contract.
    config = {"tools": [
        {"name": "a", "url": "https://no-auth.example.com/mcp"},
        {"name": "b", "tools": ["https://also-no-auth.example.com/mcp", "helper"]},
    ]}
    _patch_network(monkeypatch, config=config)
    assert _utils().get_network_mcp_urls() == set()


def _schema_tool(url):
    """A front-man tool declaring an http_headers sly_data_schema for `url`."""
    return {
        "name": "front",
        "function": {
            "sly_data_schema": {
                "type": "object",
                "properties": {
                    "http_headers": {
                        "type": "object",
                        "properties": {url: {"type": "object"}},
                    }
                },
            }
        },
    }


def test_get_urls_from_sly_data_schema(monkeypatch):
    # The schema's http_headers properties keys are collected as MCP URLs.
    config = {"tools": [_schema_tool("https://api.githubcopilot.com/mcp")]}
    _patch_network(monkeypatch, config=config)
    assert _utils().get_network_mcp_urls() == {"https://api.githubcopilot.com/mcp"}


def test_get_urls_only_from_schema_not_tool_refs(monkeypatch):
    # Only the schema-declared URL is collected; a separate MCP url merely
    # referenced by a tool (and absent from the schema) is not.
    schema = _schema_tool("https://api.githubcopilot.com/mcp")
    config = {"tools": [schema, {"name": "getter", "url": "https://other.example.com/mcp"}]}
    _patch_network(monkeypatch, config=config)
    assert _utils().get_network_mcp_urls() == {"https://api.githubcopilot.com/mcp"}


def test_get_urls_tolerates_partial_schema(monkeypatch):
    # A malformed/partial sly_data_schema is skipped, not raised on.
    config = {"tools": [
        {"name": "a", "function": {"sly_data_schema": "not-a-dict"}},
        {"name": "b", "function": {"sly_data_schema": {"properties": {"http_headers": 5}}}},
        {"name": "c", "function": {}},
    ]}
    _patch_network(monkeypatch, config=config)
    assert _utils().get_network_mcp_urls() == set()


def test_get_urls_schema_key_with_preserved_hocon_quotes(monkeypatch):
    # neuro-san's HOCON restorer preserves the surrounding quotes a URL key must
    # carry, so the parsed key is '"https://.../mcp"'. It must still be collected.
    config = {"tools": [_schema_tool('"https://api.githubcopilot.com/mcp"')]}
    _patch_network(monkeypatch, config=config)
    assert _utils().get_network_mcp_urls() == {"https://api.githubcopilot.com/mcp"}


def test_get_urls_ignores_schema_required_array(monkeypatch):
    # Discovery collects the http_headers property keys, NOT URLs that only
    # appear in a sibling JSON-schema `required` array.
    tool = _schema_tool("https://declared.example.com/mcp")
    tool["function"]["sly_data_schema"]["properties"]["http_headers"]["required"] = [
        "https://only-in-required.example.com/mcp",
    ]
    _patch_network(monkeypatch, config={"tools": [tool]})
    assert _utils().get_network_mcp_urls() == {"https://declared.example.com/mcp"}


def test_get_urls_remote_or_missing_network_returns_none(monkeypatch):
    # get_agent_network raising (invalid/remote/unreadable) -> None (caller fallback).
    _patch_network(monkeypatch, raise_exc=FileNotFoundError("not local"))
    assert _utils().get_network_mcp_urls() is None


# --------------------------- missing_mcp_connections --------------------------- #

def _patch_connections(monkeypatch, urls):
    monkeypatch.setattr(
        nw.FileTokenStorage, "list_connections",
        MagicMock(return_value=[{"server_url": u} for u in urls]),
    )


def test_missing_mcp_connections_reports_unconnected(monkeypatch):
    # github required via schema + a connected tool url; only github is missing.
    config = {"tools": [
        _schema_tool("https://api.githubcopilot.com/mcp"),
        {"name": "x", "url": "https://connected.example.com/mcp"},
    ]}
    _patch_network(monkeypatch, config=config)
    _patch_connections(monkeypatch, ["https://connected.example.com/mcp"])
    assert nw.NsWebsocketUtils.missing_mcp_connections("net") == ["https://api.githubcopilot.com/mcp"]


def test_missing_mcp_connections_matches_normalized(monkeypatch):
    # A connection stored with a trailing slash still satisfies the requirement.
    config = {"tools": [_schema_tool("https://api.githubcopilot.com/mcp")]}
    _patch_network(monkeypatch, config=config)
    _patch_connections(monkeypatch, ["https://api.githubcopilot.com/mcp/"])
    assert nw.NsWebsocketUtils.missing_mcp_connections("net") == []


def test_missing_mcp_connections_none_when_network_unreadable(monkeypatch):
    _patch_network(monkeypatch, raise_exc=FileNotFoundError("remote"))
    assert nw.NsWebsocketUtils.missing_mcp_connections("net") is None


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


def test_inject_respects_lowercase_user_authorization(monkeypatch):
    """A user 'authorization' (any casing) wins; we don't override or duplicate it."""
    url = "https://api.example.com/mcp"
    inst, get_token = _patch_injection(monkeypatch, connections=[url], referenced=[url])
    sly = {"http_headers": {url: {"authorization": "Bearer user-token"}}}
    asyncio.run(inst.inject_mcp_auth_headers(sly))
    assert sly["http_headers"][url] == {"authorization": "Bearer user-token"}
    get_token.assert_not_awaited()


def test_inject_replaces_differently_cased_sentinel_without_duplicate(monkeypatch):
    """A redacted sentinel under odd casing is replaced and not left as a duplicate."""
    url = "https://api.example.com/mcp"
    inst, get_token = _patch_injection(monkeypatch, connections=[url], referenced=[url])
    sly = {"http_headers": {url: {"authorization": nw.REDACTED_VALUE}}}
    asyncio.run(inst.inject_mcp_auth_headers(sly))
    headers = sly["http_headers"][url]
    # Exactly one Authorization header, canonical casing, real token.
    assert headers == {"Authorization": "Bearer tok"}
    get_token.assert_awaited_once_with(url)


def test_inject_ignores_redaction_sentinel(monkeypatch):
    """A round-tripped redacted Authorization is replaced with a fresh token.

    The UI can echo back a previously surfaced (masked) sly_data. The sentinel
    must not be treated as a real user-supplied token and sent to the agent.
    """
    url = "https://api.example.com/mcp"
    inst, get_token = _patch_injection(monkeypatch, connections=[url], referenced=[url])
    sly = {"http_headers": {url: {"Authorization": nw.REDACTED_VALUE}}}
    asyncio.run(inst.inject_mcp_auth_headers(sly))
    assert sly["http_headers"][url]["Authorization"] == "Bearer tok"
    get_token.assert_awaited_once_with(url)


# --------------------------- redact_sly_data_for_surface --------------------------- #

def test_redact_masks_authorization():
    url = "https://api.example.com/mcp"
    sly = {"http_headers": {url: {"Authorization": "Bearer secret-tok", "X-Custom": "ok"}}}
    out = REDACT(sly)
    assert out["http_headers"][url]["Authorization"] == nw.REDACTED_VALUE
    # Non-sensitive headers are left intact.
    assert out["http_headers"][url]["X-Custom"] == "ok"


def test_redact_masks_other_credential_headers():
    url = "https://api.example.com/mcp"
    sly = {"http_headers": {url: {"Cookie": "s=1", "X-Api-Key": "k", "Accept": "application/json"}}}
    out = REDACT(sly)
    assert out["http_headers"][url]["Cookie"] == nw.REDACTED_VALUE
    assert out["http_headers"][url]["X-Api-Key"] == nw.REDACTED_VALUE
    assert out["http_headers"][url]["Accept"] == "application/json"


def test_redact_does_not_mutate_original():
    url = "https://api.example.com/mcp"
    sly = {"http_headers": {url: {"Authorization": "Bearer secret-tok"}}, "other": 1}
    out = REDACT(sly)
    # Original still holds the live token (it stays in the backend request path).
    assert sly["http_headers"][url]["Authorization"] == "Bearer secret-tok"
    assert out is not sly
    assert out["other"] == 1


def test_redact_leaves_non_header_sly_data_unchanged():
    sly = {"user_id": "u1", "config": {"k": "v"}}
    out = REDACT(sly)
    assert out == sly


def test_redact_handles_missing_or_bad_http_headers():
    # No http_headers key -> returned unchanged.
    assert REDACT({"user_id": "u1"}) == {"user_id": "u1"}
    # A non-dict (malformed) http_headers could itself be/contain a secret, so the
    # whole value is masked rather than surfaced verbatim.
    assert REDACT({"http_headers": "oops"}) == {"http_headers": nw.REDACTED_VALUE}
    # Non-dict sly_data is returned as-is.
    assert REDACT("not-a-dict") == "not-a-dict"


def test_redact_tolerates_non_string_header_key():
    """A non-string header key must not raise (.lower()); its value is left as-is."""
    url = "https://api.example.com/mcp"
    sly = {"http_headers": {url: {1: "weird", "Authorization": "Bearer secret"}}}
    out = REDACT(sly)
    assert out["http_headers"][url][1] == "weird"
    assert out["http_headers"][url]["Authorization"] == nw.REDACTED_VALUE


# --------------------------- _merge_user_sly_data --------------------------- #

def test_merge_redacted_sentinel_does_not_clobber_real_secret():
    """A round-tripped ***redacted*** must not overwrite the retained real value."""
    url = "https://api.example.com/mcp"
    state = {"http_headers": {url: {"Authorization": "Bearer real", "Cookie": "s=1"}}}
    incoming = {"http_headers": {url: {"Authorization": nw.REDACTED_VALUE, "Cookie": nw.REDACTED_VALUE}}}
    MERGE(state, incoming)
    assert state["http_headers"][url]["Authorization"] == "Bearer real"
    assert state["http_headers"][url]["Cookie"] == "s=1"


def test_merge_real_user_value_overwrites():
    """A genuine (non-sentinel) user value still updates the stored header."""
    url = "https://api.example.com/mcp"
    state = {"http_headers": {url: {"Authorization": "Bearer old"}}}
    incoming = {"http_headers": {url: {"Authorization": "Bearer new"}}}
    MERGE(state, incoming)
    assert state["http_headers"][url]["Authorization"] == "Bearer new"


def test_merge_sentinel_not_added_when_no_existing_value():
    """A redacted sentinel for a header with no stored value is dropped, not added."""
    url = "https://api.example.com/mcp"
    state = {"http_headers": {url: {}}}
    incoming = {"http_headers": {url: {"Authorization": nw.REDACTED_VALUE}}}
    MERGE(state, incoming)
    assert "Authorization" not in state["http_headers"][url]


def test_merge_preserves_headers_for_other_urls():
    """Deep-merge: incoming headers for one URL don't wipe another URL's headers."""
    a, b = "https://a/mcp", "https://b/mcp"
    state = {"http_headers": {a: {"Authorization": "Bearer a"}}}
    incoming = {"http_headers": {b: {"X-Custom": "v"}}}
    MERGE(state, incoming)
    assert state["http_headers"][a]["Authorization"] == "Bearer a"
    assert state["http_headers"][b]["X-Custom"] == "v"


def test_merge_non_http_headers_keys_replace_as_before():
    """Non-http_headers keys keep plain shallow-replace semantics."""
    state = {"user_id": "old", "http_headers": {}}
    MERGE(state, {"user_id": "new", "extra": 1})
    assert state["user_id"] == "new"
    assert state["extra"] == 1


def test_merge_ignores_non_dict_incoming():
    state = {"user_id": "u1"}
    MERGE(state, "not-a-dict")
    assert state == {"user_id": "u1"}
