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
# nsflow/backend/api/v1/fast_websocket.py

"""
This is the FastAPI endpoints for streaming_chat, logs, connectivity & function
For now, we have separate end-points for OpenAPI specs
"""

from fastapi import APIRouter, WebSocket

from nsflow.backend.trust.rai_service import RaiService
from nsflow.backend.utils.agentutils.ns_websocket_utils import NsWebsocketUtils
from nsflow.backend.utils.logutils.websocket_logs_registry import LogsRegistry

router = APIRouter(prefix="/api/v1/ws")


# If we want to use StreamingInputProcessor:
@router.websocket("/chat/{agent_name:path}/{session_id}")
async def websocket_chat(websocket: WebSocket, agent_name: str, session_id: str):
    """WebSocket route for streaming chat communication."""
    # Instantiate the service API class
    ns_api = NsWebsocketUtils(agent_name, websocket, session_id)
    await ns_api.handle_user_input()


@router.websocket("/internalchat/{agent_name:path}/{session_id}")
async def websocket_internal_chat(websocket: WebSocket, agent_name: str, session_id: str):
    """WebSocket route for internal chat communication."""
    manager = LogsRegistry.register(agent_name, session_id)
    await manager.handle_internal_chat_websocket(websocket)


@router.websocket("/logs/{agent_name:path}/{session_id}")
async def websocket_logs(websocket: WebSocket, agent_name: str, session_id: str):
    """WebSocket route for log streaming."""
    manager = LogsRegistry.register(agent_name, session_id)
    await manager.handle_log_websocket(websocket)


@router.websocket("/slydata/{agent_name:path}/{session_id}")
async def websocket_slydata(websocket: WebSocket, agent_name: str, session_id: str):
    """WebSocket route for sly_data streaming."""
    manager = LogsRegistry.register(agent_name, session_id)
    await manager.handle_sly_data_websocket(websocket)


@router.websocket("/progress/{agent_name:path}/{session_id}")
async def websocket_progress(websocket: WebSocket, agent_name: str, session_id: str):
    """WebSocket route for progress streaming."""
    manager = LogsRegistry.register(agent_name, session_id)
    await manager.handle_progress_websocket(websocket)


@router.websocket("/sustainability/{agent_name:path}/{session_id}")
async def websocket_sustainability(websocket: WebSocket, agent_name: str, session_id: str):
    """WebSocket endpoint for real-time sustainability metrics updates"""
    try:
        service = RaiService.get_instance()
        await service.handle_websocket(websocket, agent_name, session_id)
    except Exception as e:
        print(f"Sustainability WebSocket error for {agent_name}: {e}")
        try:
            await websocket.close()
        except Exception:
            pass  # Already closed
