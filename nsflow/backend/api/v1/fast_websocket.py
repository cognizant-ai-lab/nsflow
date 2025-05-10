
# Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
# All Rights Reserved.
# Issued under the Academic Public License.
#
# You can be released from the terms, and requirements of the Academic Public
# License by purchasing a commercial license.
# Purchase of a commercial license is mandatory for any use of the
# nsflow SDK Software in commercial settings.
#
# END COPYRIGHT
# nsflow/backend/api/v1/fast_websocket.py

"""
This is the FastAPI endpoints for streaming_chat, logs, connectivity & function
For now, we have separate end-points for OpenAPI specs
"""

from fastapi import APIRouter, WebSocket
# from nsflow.backend.utils.ns_grpc_websocket_utils import NsGrpcWebsocketUtils
from nsflow.backend.utils.ns_grpc_ws_utils import NsGrpcWsUtils
from nsflow.backend.utils.websocket_logs_registry import LogsRegistry

router = APIRouter(prefix="/api/v1/ws")


# @router.websocket("/chat/{agent_name}")
# async def websocket_chat(websocket: WebSocket, agent_name: str):
#     """WebSocket route for streaming chat communication."""
#     # Instantiate the service API class
#     ns_api = NsGrpcWebsocketUtils(agent_name, websocket)
#     await ns_api.handle_chat_websocket()


# If we want to use StreamingInputProcessor:
@router.websocket("/chat/{agent_name}")
async def websocket_chat(websocket: WebSocket, agent_name: str):
    """WebSocket route for streaming chat communication."""
    # Instantiate the service API class
    ns_api = NsGrpcWsUtils(agent_name, websocket)
    await ns_api.handle_user_input()


@router.websocket("/internalchat/{agent_name}")
async def websocket_internal_chat(websocket: WebSocket, agent_name: str):
    """WebSocket route for internal chat communication."""
    manager = LogsRegistry.register(agent_name)
    await manager.handle_internal_chat_websocket(websocket)


@router.websocket("/logs/{agent_name}")
async def websocket_logs(websocket: WebSocket, agent_name: str):
    """WebSocket route for log streaming."""
    manager = LogsRegistry.register(agent_name)
    await manager.handle_log_websocket(websocket)
