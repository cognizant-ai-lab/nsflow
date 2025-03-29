# ns_grpc_service_api.py

import os
import json
import asyncio
import logging
from typing import Dict, List, Any, Generator

from dotenv import load_dotenv
from fastapi import WebSocket, WebSocketDisconnect
from google.protobuf.json_format import Parse, MessageToDict
# pylint: disable=no-name-in-module
from neuro_san.api.grpc.agent_pb2 import ChatRequest
from neuro_san.service.agent_server import DEFAULT_FORWARDED_REQUEST_METADATA
from neuro_san.interfaces.async_agent_session import AsyncAgentSession
from neuro_san.internals.messages.chat_message_type import ChatMessageType
from neuro_san.session.async_grpc_service_agent_session import AsyncGrpcServiceAgentSession
from nsflow.backend.utils.websocket_logs_registry import get_logs_manager

# Logging setup
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

user_sessions_lock = asyncio.Lock()
user_sessions: Dict[str, Dict[str, Any]] = {}


# pylint: disable=too-many-instance-attributes
class NsGrpcServiceApi:
    """
    Encapsulates gRPC session management and WebSocket interactions for a NeuroSAN agent.
    Manages:
    - WebSocket message handling
    - gRPC streaming communication
    - Live logging and internal chat broadcasting via WebSocketLogsManager
    """

    LOG_BUFFER_SIZE = 100

    def __init__(self, agent_name: str,
                 websocket: WebSocket,
                 forwarded_request_metadata: List[str] = DEFAULT_FORWARDED_REQUEST_METADATA):
        """
        Initialize the gRPC service API wrapper.
        :param agent_name: Name of the NeuroSAN agent(Network) to connect to.
        :param websocket: The WebSocket connection instance.
        :param forwarded_request_metadata: List of metadata keys to extract from incoming headers.
        """
        self.root_dir = os.getcwd()
        self.load_env_variables()
        self.server_host = os.getenv("NS_SERVER_HOST", "localhost")
        self.server_port = int(os.getenv("NS_SERVER_PORT", "30015"))
        self.forwarded_request_metadata = forwarded_request_metadata.split(" ")
        self.agent_name = agent_name
        self.websocket = websocket
        self.active_chat_connections: Dict[str, WebSocket] = {}
        self.chat_context: Dict[str, Any] = {}

        self.logs_manager = get_logs_manager(self.agent_name)

    def get_metadata(self) -> Dict[str, Any]:
        """
        Extract forwarded metadata from the WebSocket headers.
        :return: Dictionary containing metadata extracted from headers.
        """
        headers: Dict[str, Any] = self.websocket.headers
        metadata: Dict[str, Any] = {}
        for item_name in self.forwarded_request_metadata:
            if item_name in headers.keys():
                metadata[item_name] = headers[item_name]
        return metadata

    def get_agent_grpc_session(self, metadata: Dict[str, Any]) -> AsyncAgentSession:
        """
        Build gRPC session to communicate with the NeuroSAN agent.
        :param metadata: Dictionary of metadata to forward to gRPC.
        :return: An instance of AsyncAgentSession for communication.
        """
        grpc_session: AsyncAgentSession = \
            AsyncGrpcServiceAgentSession(
                host=self.server_host,
                port=self.server_port,
                metadata=metadata,
                agent_name=self.agent_name)
        return grpc_session

    # Using Dan's implementation, need to refactor later
    def formulate_chat_request(self, user_input: str,
                               sly_data: Dict[str, Any] = None,
                               chat_context: Dict[str, Any] = None,
                               chat_filter: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Formulates a single chat request given the user_input
        :param user_input: The string to send
        :param sly_data: The sly_data dictionary to send
        :param chat_context: The chat context dictionary that allows the context of a
                    conitinuing conversation to be reconstructed on another server.
        :param chat_filter: The ChatFilter to apply to the request.
        :return: A dictionary representing the chat request to send
        """
        chat_request = {
            "user_message": {
                "type": ChatMessageType.HUMAN,
                "text": user_input
            }
        }

        if bool(chat_context):
            # Recall that non-empty dictionaries evaluate to True
            chat_request["chat_context"] = chat_context

        if sly_data is not None and len(sly_data.keys()) > 0:
            chat_request["sly_data"] = sly_data

        if chat_filter is not None and len(chat_filter.keys()) > 0:
            chat_request["chat_filter"] = chat_filter

        return chat_request

    async def handle_chat_websocket(self, websocket: WebSocket):
        """
        Main entry point for handling chat over WebSocket.
        :param websocket: The active WebSocket connection with a client.
        """
        websocket = self.websocket
        await websocket.accept()
        client_id = str(websocket.client)
        self.active_chat_connections[client_id] = websocket
        await self.logs_manager.log_event(f"Chat client {client_id} connected to agent: {self.agent_name}", "FastAPI")
        try:
            while True:
                websocket_data = await websocket.receive_text()
                message_data = json.loads(websocket_data)
                user_input = message_data.get("message", "")
                if user_input:
                    await self.logs_manager.log_event(f"WebSocket data: {user_input}", "FastAPI")
                    sly_data = message_data.get("sly_data", None)
                    chat_context = self.chat_context
                    chat_filter: Dict[str, Any] = {"chat_filter_type": "MAXIMAL"}
                    chat_request = self.formulate_chat_request(user_input,
                                                               sly_data,
                                                               chat_context,
                                                               chat_filter)

                    metadata: Dict[str, Any] = self.get_metadata()
                    grpc_session: AsyncAgentSession = self.get_agent_grpc_session(metadata)

                    await self.stream_chat_to_websocket(websocket, client_id, grpc_session, chat_request)

        except WebSocketDisconnect:
            await self.logs_manager.log_event(f"WebSocket chat client disconnected: {client_id}", "FastAPI")
            self.active_chat_connections.pop(client_id, None)

    # pylint: disable=too-many-locals
    async def stream_chat_to_websocket(self, websocket: WebSocket,
                                       client_id: str,
                                       grpc_session: AsyncAgentSession,
                                       request_data: dict):
        """
        Streams gRPC chat responses to the client via WebSocket.
        :param websocket: The active WebSocket connection.
        :param client_id: Unique ID of the client.
        :param grpc_session: The gRPC session to use.
        :param request_data: ChatRequest dictionary to send.
        """
        try:
            # Parse the incoming data into a protobuf ChatRequest
            grpc_request = Parse(json.dumps(request_data), ChatRequest())

            # Get the generator of generators
            result_generator: Generator[
                Generator[Any, None, None], None, None
            ] = grpc_session.streaming_chat(grpc_request)

            # initialize response with None
            final_response = None
            internal_chat = None
            otrace = None

            # Stream each message to the WebSocket
            async for sub_generator in result_generator:
                async for result_message in sub_generator:
                    result_dict: Dict[str, Any] = MessageToDict(result_message)
                    # Extract AI response & origin trace
                    if "response" in result_dict:
                        if result_dict["response"].get("type") == "AI":
                            final_response = result_dict["response"]["text"]
                        otrace = result_dict["response"].get("origin", [])
                        otrace = [i.get("tool") for i in otrace]
                    if result_dict["response"].get("type") in ["AGENT", "AGENT_TOOL_RESULT"]:
                        internal_chat = result_dict["response"].get("text", "")

                    otrace_str = json.dumps({"otrace": otrace})
                    internal_chat_str = {"otrace": otrace, "text": internal_chat}
                    await self.logs_manager.log_event(f"{otrace_str}", "NeuroSan")
                    await self.logs_manager.internal_chat_event(internal_chat_str)

            # send everything after result_dict is complete instead of sending along the process
            if final_response:
                try:
                    response_str = json.dumps({"message": {"type": "AI", "text": final_response}})
                    await websocket.send_text(response_str)
                    await self.logs_manager.log_event(f"Streaming response sent: {response_str}", "FastAPI")
                except WebSocketDisconnect:
                    self.active_chat_connections.pop(client_id, None)
                except RuntimeError as e:
                    logging.error("Error sending streaming response: %s", e)
                    self.active_chat_connections.pop(client_id, None)

            # Update chat_context for continuation of chat with an agent
            chat_context = self.get_chat_context(result_dict)
            self.set_chat_context(chat_context)

            # Do not close WebSocket here; allow continuous interaction
            await self.logs_manager.log_event(f"Streaming chat finished for client: {client_id}", "FastAPI")

        except Exception as exc:
            # You may want to send an error message back over the socket
            logging.error("Error in streaming chat: %s", exc)

    def get_chat_context(self, result_dict: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extracts the updated chat context from the gRPC result.
        :param result_dict: The gRPC response parsed to a dictionary.
        :return: The extracted chat_context dictionary or empty if not found.
        """
        response: Dict[str, Any] = result_dict.get("response", {})
        return response.get("chat_context", {})

    def set_chat_context(self, chat_context: Dict[str, Any]):
        """
        Stores the updated chat context for future requests.
        :param chat_context: Dictionary representing the current chat context.
        """
        self.chat_context = chat_context

    def load_env_variables(self):
        """
        Loads environment variables from a .env file in the current root directory.
        """
        env_path = os.path.join(self.root_dir, ".env")
        if os.path.exists(env_path):
            load_dotenv(env_path)
            logging.info("Loaded env vars from .env")
        else:
            logging.warning("No .env file found")
