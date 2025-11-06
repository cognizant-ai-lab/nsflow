
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

import asyncio
import json
import os
import logging
import tempfile
from typing import Dict, Any
import uuid

from fastapi import WebSocket, WebSocketDisconnect

from neuro_san.client.agent_session_factory import AgentSessionFactory

from nsflow.backend.utils.agentutils.async_streaming_input_processor import AsyncStreamingInputProcessor

from nsflow.backend.utils.logutils.websocket_logs_registry import LogsRegistry
from nsflow.backend.utils.tools.ns_configs_registry import NsConfigsRegistry
from nsflow.backend.utils.agentutils.agent_log_processor import AgentLogProcessor

# Logging setup
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# Initialize a lock
user_sessions_lock = asyncio.Lock()
user_sessions = {}

# Global storage for latest sly_data by network name and session
# Key format: "agent_name:session_id"
latest_sly_data_storage: Dict[str, Any] = {}


# pylint: disable=too-many-instance-attributes
class NsWebsocketUtils:
    """
    Encapsulates session management and WebSocket interactions for a NeuroSAN agent.
    Manages:
    - WebSocket message handling
    - Agent streaming communication
    - Live logging and internal chat broadcasting via WebSocketLogsManager
    """

    LOG_BUFFER_SIZE = 100
    DEFAULT_INPUT: str = ""
    DEFAULT_PROMPT: str = "Please enter your response ('quit' to terminate):\n"

    def __init__(self, agent_name: str,
                 websocket: WebSocket,
                 session_id: str = None):
        """
        Initialize the Agent service API wrapper.
        :param agent_name: Name of the NeuroSAN agent(Network) to connect to.
        :param websocket: The WebSocket connection instance.
        :param session_id: Unique session identifier for this user connection.
                          If not provided, a new one will be generated.
        """
        try:
            config = NsConfigsRegistry.get_current()
        except RuntimeError as e:
            raise RuntimeError("No active NsConfigStore. \
                               Please set it via /set_config before using endpoints.") from e

        self.server_host = config.host
        self.server_port = config.port
        self.connection = config.connection_type

        self.agent_name = agent_name
        self.session_id = session_id or str(uuid.uuid4().hex[:12])
        self.use_direct = False
        self.websocket = websocket
        self.active_chat_connections: Dict[str, WebSocket] = {}
        self.chat_context: Dict[str, Any] = {}
        # Set up the thinking file and directory from environment variables or defaults
        if "THINKING_FILE" not in os.environ:
            logging.warning("THINKING_FILE environment variable is not set. Using default temporary file.")
        self.thinking_file = os.getenv("THINKING_FILE", tempfile.gettempdir() + "/agent_thinking.txt")
        self.thinking_dir = os.getenv("THINKING_DIR", None)
        logging.info("Using thinking file: %s", self.thinking_file)
        logging.info("Using thinking dir: %s", self.thinking_dir)

        self.logs_manager = LogsRegistry.register(agent_name, self.session_id)
        self.session = self.create_agent_session()

    # pylint: disable=too-many-function-args
    async def handle_user_input(self):
        """
        Handle incoming WebSocket messages and process them using the agent session."""
        websocket = self.websocket
        await websocket.accept()
        # Obtain session_id from the frontend
        # sid = str(self.agent_name) + ":" + str(websocket.client.host) + \
        #     ":" + str(websocket.client.port) + ":" + str(uuid.uuid4().hex[:12])

        self.active_chat_connections[self.session_id] = websocket
        await self.logs_manager.log_event(f"Chat client {self.session_id} connected to agent: {self.agent_name}", "nsflow")

        async with user_sessions_lock:
            if self.session_id not in user_sessions:
                user_sessions[self.session_id] = await self.create_user_session(self.session_id)
            user_session = user_sessions[self.session_id]

        try:
            while True:
                websocket_data = await websocket.receive_text()
                message_data = json.loads(websocket_data)
                user_input = message_data.get("message", "")
                sly_data = message_data.get("sly_data", {})

                input_processor = user_session['input_processor']
                state = user_session['state']
                # Update user input in state
                state["user_input"] = user_input
                # Update sly_data in state based on user input
                state["sly_data"].update(sly_data)

                # Update the state
                state = await input_processor.async_process_once(state)
                user_session['state'] = state
                last_chat_response = state.get("last_chat_response")

                # Start a background task and pass necessary data
                if last_chat_response:
                    # try:
                    response_str = json.dumps({"message": {"type": "AI", "text": last_chat_response}})
                    sly_data_str = {"text": state["sly_data"]}
                    await websocket.send_text(response_str)
                    await self.logs_manager.log_event(f"Streaming response sent: {response_str}", "nsflow")
                    await self.logs_manager.sly_data_event(sly_data_str)

                # Store the latest sly_data for this network and session
                if state.get("sly_data") is not None:
                    storage_key = f"{self.agent_name}:{self.session_id}"
                    latest_sly_data_storage[storage_key] = state["sly_data"]
                    # logging.info("Updated latest sly_data for network %s session %s", self.agent_name, self.session_id)

                await self.logs_manager.log_event(f"Streaming chat finished for client: {self.session_id}", "nsflow")

        except WebSocketDisconnect:
            await self.logs_manager.log_event(f"WebSocket chat client disconnected: {self.session_id}", "nsflow")
        except Exception as e:
            logging.error("Unexpected error in WebSocket handler for %s: %s", self.session_id, e)
            await self.logs_manager.log_event(f"Error in session {self.session_id}: {e}", "nsflow")
        finally:
            # clean up
            self.active_chat_connections.pop(self.session_id, None)
            async with user_sessions_lock:
                user_sessions.pop(self.session_id, None)

    async def create_user_session(self, sid: str) -> Dict[str, Any]:
        """method to create a user session with the given WebSocket connection."""

        # Agent session gets created in init
        chat_filter: Dict[str, Any] = {"chat_filter_type": "MAXIMAL"}
        state: Dict[str, Any] = {
            "last_chat_response": None,
            "num_input": 0,
            "chat_filter": chat_filter,
            "sly_data": {},
        }

        input_processor = AsyncStreamingInputProcessor(default_input="",
                                                  thinking_file=self.thinking_file,
                                                  session=self.session,
                                                  thinking_dir=self.thinking_dir)
        # Add a processor to handle agent logs
        # and to highlight the agents that respond in the agent network diagram
        agent_log_processor = AgentLogProcessor(self.agent_name, self.session_id)
        input_processor.processor.add_processor(agent_log_processor)

        # Note: If nothing is specified the server assumes the chat_filter_type
        #       should be "MINIMAL", however for this client which is aimed at
        #       developers, we specifically want a default MAXIMAL client to
        #       show all the bells and whistles of the output that a typical
        #       end user will not care about and not appreciate the extra
        #       data charges on their cell phone.

        user_session = {
            "input_processor": input_processor,
            "state": state,
            "sid": sid
        }
        return user_session

    def create_agent_session(self):
        """Open a session with the factory"""
         # Open a session with the factory
        factory: AgentSessionFactory = self.get_agent_session_factory()
        metadata: Dict[str, str] = {"user_id": os.environ.get("USER")}
        session = factory.create_session(self.connection, self.agent_name,
                                              self.server_host, self.server_port, self.use_direct,
                                              metadata)
        logging.info("Created agent session for agent: %s", str(session.get_request_path(self.connection)))
        return session

    def get_connectivity(self):
        """Simple method to get connectivity details"""
        data: Dict[str, Any] = {}
        return self.session.connectivity(data)

    def get_agent_session_factory(self) -> AgentSessionFactory:
        """
        This allows subclasses to add different kinds of connections.

        :return: An AgentSessionFactory instance that will allow creation of the
                 session with the agent network.
        """
        return AgentSessionFactory()

    @classmethod
    def get_latest_sly_data(cls, network_name: str, session_id: str = None) -> dict:
        """
        Retrieve the latest sly_data for a given network and session.

        Args:
            network_name: The name of the network to get sly_data for
            session_id: The session identifier. If None, tries to get any data for the network

        Returns:
            dict: The latest sly_data for the network:session, or empty dict if none available
        """
        if session_id:
            storage_key = f"{network_name}:{session_id}"
            return latest_sly_data_storage.get(storage_key, {})
        # Fallback: try to find any session data for this network (backward compatibility)
        return latest_sly_data_storage.get(network_name, {})
