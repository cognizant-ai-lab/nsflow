# Copyright © 2026 Cognizant Technology Solutions Corp, www.cognizant.com.
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
Tests for the neuro-san-shaped API facade.

The load-bearing test here is `test_route_priority_matrix`. The facade's
``/api/v1/{agent_name:path}/connectivity`` occupies the same position as existing
routes whose FIRST segment is a literal (``/api/v1/connectivity/{network_name}``
and friends), so route registration order is what keeps existing consumers
working. If anyone registers the facade earlier, or makes the converter
non-greedy, these tests fail loudly instead of the editor silently 404-ing.
"""

import json
from typing import Any
from typing import Dict
from typing import List

import pytest
from fastapi.testclient import TestClient

import nsflow.backend.utils.agentutils.ns_websocket_utils as nw
from nsflow.backend.api.router import router as nsflow_router
from nsflow.backend.api.v1.neuro_san import agent as facade_agent
from nsflow.backend.main import app
from nsflow.backend.utils.tools.ns_configs_registry import NsConfigsRegistry

client = TestClient(app)

# What a neuro-san `connectivity` call returns: a list of nodes, each naming its
# origin and the tools reachable from it. This is the shape the facade must pass
# through untouched.
FAKE_CONNECTIVITY: Dict[str, Any] = {
    "connectivity_info": [
        {"origin": "frontman", "tools": ["barista", "loyalty"]},
        {"origin": "barista", "tools": []},
        {"origin": "loyalty", "tools": ["rewards_db"]},
    ]
}

FAKE_FUNCTION: Dict[str, Any] = {
    "function": {
        "description": "Takes coffee orders",
        "parameters": {"type": "object", "properties": {}},
    }
}


# One turn of neuro-san's streaming chat: several {"response": {...}} dicts, which
# is what AgentSession.streaming_chat yields and what a neuro-san server sends.
FAKE_CHAT_CHUNKS = [
    {"response": {"type": "AGENT_PROGRESS", "text": "thinking"}},
    {"response": {"type": "AI", "text": "One coffee coming up"}},
]


class _FakeSession:
    """Stands in for a neuro-san AgentSession."""

    def __init__(self):
        self.streaming_chat_requests: List[Dict[str, Any]] = []

    def connectivity(self, _data: Dict[str, Any]) -> Dict[str, Any]:
        """Answer a connectivity call."""
        return FAKE_CONNECTIVITY

    def function(self, _data: Dict[str, Any]) -> Dict[str, Any]:
        """Answer a function call."""
        return FAKE_FUNCTION

    def streaming_chat(self, chat_request: Dict[str, Any]):
        """Record what was sent, then yield a turn's worth of responses."""
        self.streaming_chat_requests.append(chat_request)
        yield from FAKE_CHAT_CHUNKS


@pytest.fixture(autouse=True)
def _fake_neuro_san(monkeypatch):
    """
    Give every code path a working config and a session that answers locally, so
    these tests exercise nsflow's routing and shaping rather than a live server.
    """
    NsConfigsRegistry.set_current("http", "localhost", 8080)
    monkeypatch.setattr(nw.NsWebsocketUtils, "create_agent_session", lambda self: _FakeSession())


def test_facade_connectivity_returns_raw_neuro_san_shape():
    """The facade passes neuro-san's connectivity_info through untransformed."""
    response = client.get("/api/v1/my_net/connectivity")
    assert response.status_code == 200
    assert response.json() == FAKE_CONNECTIVITY


def test_facade_connectivity_supports_nested_agent_names():
    """
    Generated networks are named `<subdir>/<name>` (frontend toServedNetworkPath),
    so the path converter must be greedy or every generated network 404s.
    """
    response = client.get("/api/v1/generated/coffee_shop/connectivity")
    assert response.status_code == 200
    assert response.json() == FAKE_CONNECTIVITY


def test_facade_function_returns_raw_neuro_san_shape():
    """The facade passes neuro-san's function description through untransformed."""
    response = client.get("/api/v1/my_net/function")
    assert response.status_code == 200
    assert response.json() == FAKE_FUNCTION


def test_existing_connectivity_endpoint_still_returns_react_flow_shape():
    """
    The pre-existing endpoint transforms connectivity into React Flow nodes/edges.
    The facade must not have changed it: this is the regression guard for its
    current consumers (AgentFlow.tsx, useAgentFlowData.ts, and tests).
    """
    response = client.get("/api/v1/connectivity/my_net")
    assert response.status_code == 200
    body = response.json()
    assert "nodes" in body and "edges" in body
    assert "connectivity_info" not in body


@pytest.mark.parametrize(
    "path,expect_facade",
    [
        # facade wins: the second segment is the literal operation name
        ("/api/v1/my_net/connectivity", True),
        ("/api/v1/generated/coffee_shop/connectivity", True),
        # existing wins: the first segment is a literal nsflow route
        ("/api/v1/connectivity/my_net", False),
        ("/api/v1/connectivity/generated/coffee_shop", False),
        # ambiguous (a network actually named "connectivity"): existing must win,
        # because it was registered first and its consumers predate the facade
        ("/api/v1/connectivity/connectivity", False),
    ],
)
def test_route_priority_matrix(path, expect_facade):
    """
    `connectivity_info` in the body means the facade handled it; `nodes`/`edges`
    means the existing endpoint did.
    """
    response = client.get(path)
    assert response.status_code == 200, f"{path} returned {response.status_code}"
    body = response.json()
    if expect_facade:
        assert "connectivity_info" in body, f"{path} should have hit the facade, got {sorted(body)}"
    else:
        assert "nodes" in body, f"{path} should have hit the existing endpoint, got {sorted(body)}"


def test_facade_is_the_last_registered_router():
    """
    Guards the ordering invariant directly, so a reordering fails here with a clear
    message rather than as a confusing 404 in one of the cases above.

    Asserted against the aggregate router's own route list, which is in
    registration order. (Not app.openapi()["paths"] -- that dict is not ordered by
    registration, so it cannot answer this question.)
    """
    included = [r for r in nsflow_router.routes if type(r).__name__ == "_IncludedRouter"]
    assert included, "expected the aggregate router to be built from included routers"

    last_router = included[-1].original_router
    assert last_router is facade_agent.router, (
        "the neuro-san facade must be the LAST router registered in "
        "nsflow/backend/api/router.py, otherwise its greedy "
        "/api/v1/{agent_name:path}/... routes shadow existing endpoints"
    )


def test_facade_exposes_exactly_the_expected_paths():
    """A new facade route is a deliberate act; this pins the current surface."""
    paths = sorted(r.path for r in facade_agent.router.routes)
    assert paths == [
        "/api/v1/{agent_name:path}/connectivity",
        "/api/v1/{agent_name:path}/function",
        "/api/v1/{agent_name:path}/streaming_chat",
    ]


def test_streaming_chat_emits_newline_delimited_json():
    """
    Each line is one neuro-san chat response verbatim, which is the shape
    ui-common's chatMessageFromChunk parses (JSON.parse(line).response).
    """
    response = client.post("/api/v1/my_net/streaming_chat", json={"user_message": {"text": "a coffee please"}})
    assert response.status_code == 200

    lines = [line for line in response.text.split("\n") if line.strip()]
    assert [json.loads(line) for line in lines] == FAKE_CHAT_CHUNKS


def test_streaming_chat_supports_nested_agent_names():
    """Generated networks are nested paths, so streaming_chat needs the greedy converter too."""
    response = client.post("/api/v1/generated/coffee_shop/streaming_chat", json={"user_message": {"text": "hi"}})
    assert response.status_code == 200
    assert json.loads(response.text.split("\n")[0]) == FAKE_CHAT_CHUNKS[0]


def test_streaming_chat_passes_the_request_through_untouched(monkeypatch):
    """Everything except sly_data reaches neuro-san exactly as the client sent it."""
    captured = _FakeSession()
    monkeypatch.setattr(nw.NsWebsocketUtils, "create_agent_session", lambda self: captured)

    sent = {
        "user_message": {"text": "a coffee please"},
        "chat_filter": {"chat_filter_type": "MAXIMAL"},
        "chat_context": {"some": "context"},
    }
    client.post("/api/v1/my_net/streaming_chat", json=sent)

    assert len(captured.streaming_chat_requests) == 1
    forwarded = captured.streaming_chat_requests[0]
    assert forwarded["user_message"] == sent["user_message"]
    assert forwarded["chat_filter"] == sent["chat_filter"]
    assert forwarded["chat_context"] == sent["chat_context"]


def test_streaming_chat_strips_redaction_sentinels_from_sly_data(monkeypatch):
    """
    The UI round-trips the last streamed sly_data, which the backend surfaces with
    credentials masked. Those literal "***redacted***" values must never be
    forwarded to the agent as if they were real secrets.
    """
    captured = _FakeSession()
    monkeypatch.setattr(nw.NsWebsocketUtils, "create_agent_session", lambda self: captured)

    client.post(
        "/api/v1/my_net/streaming_chat",
        json={
            "user_message": {"text": "hi"},
            "sly_data": {
                "agent_network_name": "coffee_shop",
                "http_headers": {"https://mcp.example.com": {"Authorization": nw.REDACTED_VALUE}},
            },
        },
    )

    forwarded_sly_data = captured.streaming_chat_requests[0]["sly_data"]
    # Non-credential keys pass through
    assert forwarded_sly_data["agent_network_name"] == "coffee_shop"
    # The redaction sentinel does not
    headers = forwarded_sly_data.get("http_headers", {}).get("https://mcp.example.com", {})
    assert headers.get("Authorization") != nw.REDACTED_VALUE


def test_streaming_chat_injects_mcp_auth_headers(monkeypatch):
    """
    The HTTP route must not be a way around the MCP token injection the WebSocket
    path performs, or it becomes an auth bypass.
    """
    captured = _FakeSession()
    monkeypatch.setattr(nw.NsWebsocketUtils, "create_agent_session", lambda self: captured)

    injected = []

    async def _fake_inject(_self, sly_data):
        injected.append(sly_data)
        sly_data["http_headers"] = {"https://mcp.example.com": {"Authorization": "Bearer real-token"}}

    monkeypatch.setattr(nw.NsWebsocketUtils, "inject_mcp_auth_headers", _fake_inject)

    client.post("/api/v1/my_net/streaming_chat", json={"user_message": {"text": "hi"}})

    assert injected, "inject_mcp_auth_headers was never called for the HTTP chat route"
    forwarded = captured.streaming_chat_requests[0]["sly_data"]
    assert forwarded["http_headers"]["https://mcp.example.com"]["Authorization"] == "Bearer real-token"
