
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

import json
import logging
import threading
from typing import Dict, Any

from fastapi import WebSocket, WebSocketDisconnect

from neuro_san.client.streaming_input_processor import StreamingInputProcessor
from nsflow.backend.utils.websocket_logs_registry import LogsRegistry
from nsflow.backend.utils.ns_grpc_base_utils import NsGrpcBaseUtils

# Logging setup
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# Initialize a lock
user_sessions_lock = threading.Lock()
user_sessions = {}


# pylint: disable=too-many-instance-attributes
class NsGrpcWsUtils:
    """
    Encapsulates gRPC session management and WebSocket interactions for a NeuroSAN agent.
    Manages:
    - WebSocket message handling
    - gRPC streaming communication
    - Live logging and internal chat broadcasting via WebSocketLogsManager
    """

    LOG_BUFFER_SIZE = 100

    def __init__(self, agent_name: str,
                 websocket: WebSocket):
        """
        Initialize the gRPC service API wrapper.
        :param agent_name: Name of the NeuroSAN agent(Network) to connect to.
        :param websocket: The WebSocket connection instance.
        :param forwarded_request_metadata: List of metadata keys to extract from incoming headers.
        """

        self.agent_name = agent_name
        self.websocket = websocket
        self.active_chat_connections: Dict[str, WebSocket] = {}
        self.chat_context: Dict[str, Any] = {}
        self.thinking_file = '/tmp/agent_thinking.txt'
        self.thinking_dir = '/tmp'

        self.base_utils = NsGrpcBaseUtils(agent_name=agent_name)

        self.logs_manager = LogsRegistry.register(agent_name)

    # pylint: disable=too-many-function-args
    async def handle_user_input(self):
        """
        Handle incoming WebSocket messages and process them using the gRPC session."""
        websocket = self.websocket
        await websocket.accept()
        sid = str(websocket.client)
        self.active_chat_connections[sid] = websocket
        try:
            while True:
                websocket_data = await websocket.receive_text()
                message_data = json.loads(websocket_data)
                user_input = message_data.get("message", "")
                sly_data = message_data.get("sly_data", None)

                # Retrieve or initialize user-specific data
                # with user_sessions_lock:
                user_session = user_sessions.get(sid)
                if not user_session or len(user_session) < 1:
                    # No session found: create a new one
                    user_session = await self.create_user_session(sid)
                    user_sessions[sid] = user_session

                input_processor = user_session['input_processor']
                state = user_session['state']
                # Update user input in state
                state["user_input"] = user_input
                state["sly_data"] = sly_data

                print("========== Processing user message ==========")
                # Update the state
                state = input_processor.process_once(state)
                user_session['state'] = state
                last_chat_response = state.get("last_chat_response")

                # Start a background task and pass necessary data
                if last_chat_response:
                    try:
                        response_str = json.dumps({"message": {"type": "AI", "text": last_chat_response}})
                        await websocket.send_text(response_str)
                    except WebSocketDisconnect:
                        self.active_chat_connections.pop(sid, None)
                    except RuntimeError as e:
                        logging.error("Error sending streaming response: %s", e)
                        self.active_chat_connections.pop(sid, None)

        except WebSocketDisconnect:
            await self.logs_manager.log_event(f"WebSocket chat client disconnected: {sid}", "FastAPI")
            self.active_chat_connections.pop(sid, None)

    async def create_user_session(self):
        """method to create a user session with the given WebSocket connection."""
        metadata = self.base_utils.get_metadata(self.websocket)
        agent_session = self.base_utils.get_regular_agent_grpc_session(metadata=metadata)
        input_processor = StreamingInputProcessor(default_input="",
                                                  thinking_file=self.thinking_file,
                                                  session=agent_session,
                                                  thinking_dir=self.thinking_dir)
        # Add a processor to handle agent logs
        # and to highlight the agents that respond in the agent network diagram
        # agent_log_processor = AgentLogProcessor(socketio, sid)
        # input_processor.processor.add_processor(agent_log_processor)

        # Note: If nothing is specified the server assumes the chat_filter_type
        #       should be "MINIMAL", however for this client which is aimed at
        #       developers, we specifically want a default MAXIMAL client to
        #       show all the bells and whistles of the output that a typical
        #       end user will not care about and not appreciate the extra
        #       data charges on their cell phone.
        chat_filter: Dict[str, Any] = {
            "chat_filter_type": "MAXIMAL"
        }
        state: Dict[str, Any] = {
            "last_chat_response": None,
            "num_input": 0,
            "chat_filter": chat_filter,
        }
        user_session = {
            'input_processor': input_processor,
            'state': state
        }
        return user_session
