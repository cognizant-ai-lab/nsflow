# nsflow/backend/api/v1/fast_websocket.py

"""
This is the FastAPI endpoints for streaming_chat, logs, connectivity & function
For now, we have separate end-points for OpenAPI specs
"""

from fastapi import APIRouter, WebSocket
from nsflow.backend.utils.ns_grpc_service_utils import NsGrpcServiceUtils
from nsflow.backend.utils.websocket_logs_registry import get_logs_manager

router = APIRouter(prefix="/api/v1/ws")


@router.websocket("/chat/{agent_name}")
async def websocket_chat(websocket: WebSocket, agent_name: str):
    """WebSocket route for streaming chat communication."""
    # Instantiate the service API class
    ns_api = NsGrpcServiceUtils(agent_name, websocket)
    await ns_api.handle_chat_websocket(websocket)


@router.websocket("/internalchat/{agent_name}")
async def websocket_internal_chat(websocket: WebSocket, agent_name: str):
    """WebSocket route for internal chat communication."""
    manager = get_logs_manager(agent_name)
    await manager.handle_internal_chat_websocket(websocket)


@router.websocket("/logs/{agent_name}")
async def websocket_logs(websocket: WebSocket, agent_name: str):
    """WebSocket route for log streaming."""
    manager = get_logs_manager(agent_name)
    await manager.handle_log_websocket(websocket)
