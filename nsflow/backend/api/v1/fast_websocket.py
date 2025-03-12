# nsflow/backend/api/v1/fast_websocket.py

"""
This is the FastAPI endpoints for streaming_chat, logs, connectivity & function
"""

from fastapi import APIRouter, WebSocket
from neuro_san.session.grpc_service_agent_session import GrpcServiceAgentSession
from nsflow.backend.utils.ns_grpc_service import NsGrpcServiceApi

# pylint: disable=broad-exception-caught
router = APIRouter(prefix="/api/v1/ws")

# Instantiate the service API class
ns_api = NsGrpcServiceApi()


@router.websocket("/chat/{agent_name}")
async def websocket_chat(websocket: WebSocket, agent_name: str):
    """WebSocket route for chat communication."""
    await ns_api.handle_chat_websocket(websocket, agent_name)


@router.websocket("/internalchat/{agent_name}")
async def websocket_chat(websocket: WebSocket, agent_name: str):
    """WebSocket route for internal chat communication."""
    await ns_api.handle_internal_chat_websocket(websocket, agent_name)


@router.websocket("/logs")
async def websocket_logs(websocket: WebSocket):
    """WebSocket route for log streaming."""
    await ns_api.handle_log_websocket(websocket)


@router.get("/connectivity/{agent_name}")
async def get_agent_connectivity(agent_name: str):
    """Fetch agent connectivity details."""
    try:
        agent_session = GrpcServiceAgentSession(host="localhost", port=ns_api.SERVER_PORT, agent_name=agent_name)
        connectivity_response = agent_session.connectivity({})
        return {"connectivity": connectivity_response.get("connectivity_info", [])}
    except Exception as e:
        return {"error": str(e)}


@router.get("/function/{agent_name}")
async def get_agent_function(agent_name: str):
    """Fetch agent function details."""
    try:
        agent_session = GrpcServiceAgentSession(host="localhost", port=ns_api.SERVER_PORT, agent_name=agent_name)
        function_response = agent_session.function({})
        return {"function": function_response.get("function", [])}
    except Exception as e:
        return {"error": str(e)}
