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
Typed client for neuro-san's per-agent operations.

This is the backend counterpart to ui-common's ``controller/agent/Agent.ts``: the
one place that knows how to talk to a neuro-san agent, so the routes in
``nsflow/backend/api/v1/neuro_san/`` stay thin.

It delegates session construction to :class:`NsWebsocketUtils`, which already owns
reading the active :class:`NsConfig` and building an ``AgentSession`` via
``AgentSessionFactory``. Reusing it keeps one implementation of that logic rather
than a second copy that could drift on host/port/connection handling. The
websocket argument is ``None`` because these are plain request/response calls; the
existing ``/api/v1/connectivity/{network_name}`` endpoint already uses it this way.
"""

from typing import Any
from typing import AsyncIterator
from typing import Dict
from typing import Optional

from nsflow.backend.utils.agentutils.async_streaming_input_processor import AsyncStreamingInputProcessor
from nsflow.backend.utils.agentutils.ns_websocket_utils import NsWebsocketUtils


class NsAgentClient:
    """Request/response calls against a single neuro-san agent network."""

    def __init__(self, agent_name: str):
        """
        :param agent_name: The agent network to talk to. May contain slashes, since
                           generated networks are named "<subdir>/<name>".
        """
        self.agent_name = agent_name

    def _session(self) -> Any:
        """
        Build a neuro-san session for this agent.

        Constructed per call rather than cached: ``NsWebsocketUtils`` reads the
        active config at construction time, so a fresh instance picks up a
        ``/set_ns_config`` change instead of pinning the first host it saw.
        """
        return NsWebsocketUtils(self.agent_name, None).session

    def connectivity(self) -> Dict[str, Any]:
        """
        Return the agent network's connectivity exactly as neuro-san reports it.

        No transformation: the caller gets ``{"connectivity_info": [...]}``. nsflow's
        React Flow shaping lives in ``NsNetworkUtils`` and stays behind the older
        ``/api/v1/connectivity/{network_name}`` endpoint.
        """
        return self._session().connectivity({})

    def function(self) -> Dict[str, Any]:
        """Return the agent network's function description as neuro-san reports it."""
        return self._session().function({})

    async def streaming_chat(self, chat_request: Dict[str, Any]) -> AsyncIterator[Dict[str, Any]]:
        """
        Stream a chat turn, yielding neuro-san's chat responses as they arrive.

        Each yielded item is one ``{"response": {...}}`` dict, exactly as
        ``AgentSession.streaming_chat`` produces it and exactly what a neuro-san
        server sends on the wire, so callers can serialise them straight to
        newline-delimited JSON.

        Before dispatch this applies the same two steps the WebSocket chat path
        applies, so the HTTP route is not a way around them:

        1. The client's ``sly_data`` is merged through
           ``_merge_user_sly_data``, which strips ``***redacted***`` sentinels. The
           UI round-trips the last streamed sly_data, which the backend surfaces
           with credentials masked, so a plain copy would forward those literal
           redaction strings to the agent.
        2. ``inject_mcp_auth_headers`` adds Authorization headers for the
           OAuth-connected MCP servers this network declares it needs, so the agent
           can reach them without the user pasting a token.

        Unlike the WebSocket path this is stateless: there is no per-session state
        carried between turns, so tokens are injected fresh on every request and
        conversation continuity is the caller's job via ``chat_context`` (which is
        how neuro-san's own HTTP endpoint behaves too).

        :param chat_request: A neuro-san ChatRequest. Passed through untouched
                             apart from the ``sly_data`` handling above.
        :return: An async iterator of neuro-san chat response dicts.
        """
        utils = NsWebsocketUtils(self.agent_name, None)

        incoming: Optional[Dict[str, Any]] = chat_request.get("sly_data")
        sly_data: Dict[str, Any] = {}
        # Reaching for the WebSocket path's own merge rather than copying its
        # redaction-sentinel rules, which would be a second implementation to keep
        # in step. Static and side-effect free, so there is no session coupling.
        # pylint: disable-next=protected-access
        utils._merge_user_sly_data(sly_data, incoming)
        await utils.inject_mcp_auth_headers(sly_data)

        outgoing: Dict[str, Any] = {**chat_request, "sly_data": sly_data}

        responses = utils.session.streaming_chat(outgoing)
        async for chunk in AsyncStreamingInputProcessor.async_wrap_iter(responses):
            yield chunk
