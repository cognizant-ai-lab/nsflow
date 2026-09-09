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
neuro-san-shaped routes for per-agent operations (neuro-san's AgentService).

These mirror neuro-san's own HTTP contract so the frontend speaks one vocabulary
whether it is pointed at nsflow or at a neuro-san server, without a neuro-san API
layer living in the browser.

They are deliberately thin passthroughs. neuro-san's payloads are returned as-is,
with no Pydantic models mirroring its schemas: those schemas are generated on
neuro-san's side, so hand-copying them here would only create drift, and the
frontend already gets real types from ui-common's generated client. Passing the
payload straight through also means a field added by a future neuro-san release
reaches the client instead of being silently dropped.

TWO THINGS TO KNOW BEFORE EDITING THIS FILE
-------------------------------------------
1. ``{agent_name:path}`` is GREEDY on purpose. Generated networks are named
   "<subdir>/<name>" (e.g. "generated/coffee_shop"), so a single-segment converter
   would 404 every generated network.

2. This router MUST be registered last (see ``nsflow/backend/api/router.py``).
   ``/api/v1/{agent_name:path}/connectivity`` occupies the same position as
   existing routes whose first segment is a literal, such as
   ``/api/v1/connectivity/{network_name}``. First-registered wins in Starlette, so
   registering last is what keeps every existing consumer working.
   ``tests/nsflow/test_neuro_san_facade.py`` asserts both properties.
"""

import json
import logging
from typing import Any
from typing import AsyncIterator
from typing import Dict

from fastapi import APIRouter
from fastapi import HTTPException
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.responses import StreamingResponse

from nsflow.backend.utils.agentutils.ns_agent_client import NsAgentClient

router = APIRouter(prefix="/api/v1")


async def _ndjson_lines(client: NsAgentClient, chat_request: Dict[str, Any]) -> AsyncIterator[bytes]:
    """
    Serialise each neuro-san chat response as its own newline-terminated line.

    Errors are logged and end the stream rather than raising: response headers have
    already been sent by the time the first chunk is produced, so there is no status
    code left to change. A client disconnect cancels this generator, which stops the
    iteration at its next await.

    :param client: The client for the agent network being streamed.
    :param chat_request: The neuro-san ChatRequest to send.
    :return: An async iterator of newline-delimited JSON lines.
    """
    try:
        async for chunk in client.streaming_chat(chat_request):
            yield (json.dumps(chunk) + "\n").encode("utf-8")
    except Exception as exc:  # pylint: disable=broad-except  # must not escape mid-stream
        logging.exception("streaming_chat failed for %s: %s", client.agent_name, exc)


@router.get(
    "/{agent_name:path}/connectivity",
    summary="Get an agent network's connectivity, in neuro-san's own shape.",
    responses={
        200: {"description": "neuro-san's ConnectivityResponse verbatim: {'connectivity_info': [...]}"},
        502: {"description": "The neuro-san server could not be reached or failed"},
    },
)
async def get_connectivity(agent_name: str) -> JSONResponse:
    """
    Mirror of neuro-san's ``AgentService_Connectivity``.

    Returns the raw ``connectivity_info`` list. For React Flow nodes and edges, use
    nsflow's own ``/api/v1/connectivity/{network_name}`` instead.

    :param agent_name: The agent network. May contain slashes.
    :return: neuro-san's connectivity payload, unmodified.
    """
    try:
        result: Dict[str, Any] = NsAgentClient(agent_name).connectivity()
    except Exception as exc:
        logging.exception("Failed to get connectivity for %s: %s", agent_name, exc)
        raise HTTPException(status_code=502, detail=f"Failed to get connectivity for '{agent_name}'") from exc

    return JSONResponse(content=result)


@router.get(
    "/{agent_name:path}/function",
    summary="Get an agent network's function description, in neuro-san's own shape.",
    responses={
        200: {"description": "neuro-san's FunctionResponse verbatim: {'function': {...}}"},
        502: {"description": "The neuro-san server could not be reached or failed"},
    },
)
async def get_function(agent_name: str) -> JSONResponse:
    """
    Mirror of neuro-san's ``AgentService_Function``.

    :param agent_name: The agent network. May contain slashes.
    :return: neuro-san's function payload, unmodified.
    """
    try:
        result: Dict[str, Any] = NsAgentClient(agent_name).function()
    except Exception as exc:
        logging.exception("Failed to get function for %s: %s", agent_name, exc)
        raise HTTPException(status_code=502, detail=f"Failed to get function for '{agent_name}'") from exc

    return JSONResponse(content=result)


@router.post(
    "/{agent_name:path}/streaming_chat",
    summary="Stream a chat turn with an agent network, in neuro-san's own shape.",
    responses={
        200: {
            "description": (
                "Newline-delimited JSON. Each line is one neuro-san chat response, "
                "shaped {'response': {...}}, emitted as it arrives."
            )
        },
        422: {"description": "The request body was not valid JSON"},
        502: {"description": "The neuro-san server could not be reached or failed"},
    },
)
async def streaming_chat(agent_name: str, request: Request) -> StreamingResponse:
    """
    Mirror of neuro-san's ``AgentService_StreamingChat``.

    The body is a neuro-san ChatRequest and is forwarded as-is, except that
    ``sly_data`` goes through the same redaction-sentinel merge and MCP token
    injection the WebSocket chat path applies, so this route cannot be used to get
    around them.

    Responses stream out as newline-delimited JSON, one neuro-san chat response per
    line, which is what ui-common's chunk parser expects.

    nsflow's WebSocket endpoints remain the richer path: they also multiplex
    progress, logs and sly_data onto separate sockets. This route exists so the HTTP
    surface matches neuro-san's contract.

    :param agent_name: The agent network. May contain slashes.
    :param request: The incoming request, whose JSON body is the ChatRequest.
    :return: A newline-delimited JSON stream of neuro-san chat responses.
    """
    try:
        chat_request: Dict[str, Any] = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Request body must be valid JSON") from exc

    if not isinstance(chat_request, dict):
        raise HTTPException(status_code=422, detail="Request body must be a JSON object")

    # Mirrors what a neuro-san server sends for this operation. It carries no
    # meaning for nsflow itself (our own consumer reads the body as text and splits
    # lines), but a client written against neuro-san should not be able to tell the
    # difference. Not asserted in tests: it is neuro-san's value, not ours to pin.
    return StreamingResponse(
        _ndjson_lines(NsAgentClient(agent_name), chat_request), media_type="application/json-lines"
    )
