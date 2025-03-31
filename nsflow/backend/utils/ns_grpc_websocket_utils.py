
import json
import logging
from typing import Dict, List, Any

from fastapi import WebSocket, WebSocketDisconnect
from google.protobuf.json_format import MessageToDict

from neuro_san.service.agent_server import DEFAULT_FORWARDED_REQUEST_METADATA
from neuro_san.internals.messages.chat_message_type import ChatMessageType
from nsflow.backend.utils.websocket_logs_registry import LogsRegistry
from nsflow.backend.utils.ns_grpc_service_utils import NsGrpcServiceUtils

# Logging setup
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")


# pylint: disable=too-many-instance-attributes
class NsGrpcWebsocketUtils(NsGrpcServiceUtils):
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
        super().__init__(
            agent_name=agent_name,
            forwarded_request_metadata=" ".join(forwarded_request_metadata)
            )
        self.agent_name = agent_name
        self.websocket = websocket
        self.active_chat_connections: Dict[str, WebSocket] = {}
        self.chat_context: Dict[str, Any] = {}

        self.logs_manager = LogsRegistry.register(agent_name)

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

                    await self.stream_chat_to_websocket(websocket, client_id, chat_request)

        except WebSocketDisconnect:
            await self.logs_manager.log_event(f"WebSocket chat client disconnected: {client_id}", "FastAPI")
            self.active_chat_connections.pop(client_id, None)

    # pylint: disable=too-many-locals
    async def stream_chat_to_websocket(self, websocket: WebSocket,
                                       client_id: str,
                                       request_data: dict):
        """
        Streams gRPC chat responses to the client via WebSocket.
        :param websocket: The active WebSocket connection.
        :param client_id: Unique ID of the client.
        :param grpc_session: The gRPC session to use.
        :param request_data: ChatRequest dictionary to send.
        """
        try:
            result_generator = await self.stream_chat(
                agent_name=self.agent_name,
                chat_request=request_data,
                request=self.websocket
                )

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
