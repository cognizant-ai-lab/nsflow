import json
import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, List, Any
from fastapi import WebSocket, WebSocketDisconnect
from neuro_san.session.grpc_service_agent_session import GrpcServiceAgentSession

# Logging setup
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")


class NsGrpcServiceApi:
    """Encapsulates gRPC session management & WebSocket interactions."""

    SERVER_PORT = 30015
    LOG_BUFFER_SIZE = 100

    def __init__(self):
        self.active_chat_connections: Dict[str, WebSocket] = {}
        self.active_internal_chat_connections: List[WebSocket] = []
        self.active_log_connections: List[WebSocket] = []
        self.user_sessions: Dict[str, Dict] = {}
        self.log_buffer: List[Dict] = []

    def get_timestamp(self):
        """Returns the current timestamp in ISO format."""
        return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    async def log_event(self, message: str, source: str = "FastAPI"):
        """Logs events & sends them to WebSocket clients."""
        log_entry = {"timestamp": self.get_timestamp(), "message": message, "source": source}
        logging.info("%s: %s", source, message)

        # Maintain log buffer for SSE (Server-Sent Events)
        self.log_buffer.append(log_entry)
        if len(self.log_buffer) > self.LOG_BUFFER_SIZE:
            self.log_buffer.pop(0)

        # Broadcast logs to WebSocket clients
        await self.broadcast_log(log_entry)

    async def broadcast_log(self, log_entry):
        """Broadcasts logs to all connected WebSocket clients."""
        for websocket in self.active_log_connections:
            try:
                await websocket.send_text(json.dumps(log_entry))
            except WebSocketDisconnect:
                self.active_log_connections.remove(websocket)

    async def handle_chat_websocket(self, websocket: WebSocket, agent_name: str):
        """Handles WebSocket chat communication without session_id."""
        await websocket.accept()
        client_id = str(websocket.client)
        self.active_chat_connections[client_id] = websocket
        await self.log_event(f"Chat client {client_id} connected to agent: {agent_name}", "FastAPI")

        # Initialize agent session without session_id
        agent_session = GrpcServiceAgentSession(host="localhost", port=self.SERVER_PORT, agent_name=agent_name)

        try:
            while True:
                data = await websocket.receive_text()
                message_data = json.loads(data)
                user_input = message_data.get("message", "")
                sly_data = message_data.get("sly_data", None)

                if user_input:
                    await self.log_event(f"User input: {user_input}", "FastAPI")
                    chat_request = {"user_input": user_input}
                    if sly_data:
                        chat_request["sly_data"] = json.loads(sly_data)

                    # Start streaming responses
                    asyncio.create_task(self.handle_streaming_chat(agent_session, client_id, chat_request))

        except WebSocketDisconnect:
            await self.log_event(f"Chat client {client_id} disconnected.", "FastAPI")
            self.active_chat_connections.pop(client_id, None)

    async def internal_chat_event(self, message: Dict[str, Any]):
        """Logs events & sends them to WebSocket clients."""
        internal_chat_entry = {"message": message}

        # Broadcast logs to WebSocket clients
        await self.broadcast_internal_chat(internal_chat_entry)

    async def broadcast_internal_chat(self, internal_chat_entry):
        for websocket in self.active_internal_chat_connections:
            try:
                await websocket.send_text(json.dumps(internal_chat_entry))
            except WebSocketDisconnect:
                self.active_internal_chat_connections.remove(websocket)

    async def handle_internal_chat_websocket(self, websocket: WebSocket, agent_name: str):
        """Handles WebSocket chat communication without session_id."""
        await websocket.accept()
        self.active_internal_chat_connections.append(websocket)
        await self.internal_chat_event(f"New internal chat client connected to: {agent_name}")

        try:
            while True:
                await asyncio.sleep(1)
        except WebSocketDisconnect:
            self.active_internal_chat_connections.remove(websocket)
            await self.internal_chat_event(f"Internal chat client disconnected from: {agent_name}")

    async def handle_streaming_chat(self, agent_session, client_id, chat_request):
        """Handles streaming chat responses asynchronously."""
        try:
            loop = asyncio.get_running_loop()
            response_generator = await loop.run_in_executor(None, agent_session.streaming_chat, chat_request)
            final_response = None
            internal_chat = None
            otrace = None

            # Stream responses
            for response_message in response_generator:
                if response_message is None:
                    continue

                response_dict = json.loads(json.dumps(response_message))

                # Extract AI response & origin trace
                if "response" in response_dict:
                    if response_dict["response"].get("type") == "AI":
                        final_response = response_dict["response"]["text"]
                    if response_dict["response"].get("type") in ["AGENT", "AGENT_TOOL_RESULT"]:
                        otrace = response_dict["response"].get("origin", [])
                        otrace = [i.get("tool") for i in otrace]
                        internal_chat = response_dict["response"].get("text", "")

                otrace_str = json.dumps({"otrace": otrace})
                internal_chat_str = {"otrace": otrace, "text": internal_chat}
                await self.log_event(f"{otrace_str}", "NeuroSan")
                await self.internal_chat_event(internal_chat_str)

            if final_response and client_id in self.active_chat_connections:
                try:
                    response_str = json.dumps({"message": {"type": "AI", "text": final_response}})
                    await self.active_chat_connections[client_id].send_text(response_str)
                    await self.log_event(f"Streaming response sent: {response_str}", "FastAPI")
                except WebSocketDisconnect:
                    self.active_chat_connections.pop(client_id, None)
                except RuntimeError as e:
                    logging.error("Error sending streaming response: %s", e)
                    self.active_chat_connections.pop(client_id, None)

            # Do not close WebSocket here; allow continuous interaction
            await self.log_event(f"Streaming chat finished for client: {client_id}", "FastAPI")

        except Exception as e:
            logging.error("Error in streaming chat: %s", e)

    async def handle_log_websocket(self, websocket: WebSocket):
        """Handles WebSocket log streaming."""
        await websocket.accept()
        self.active_log_connections.append(websocket)
        await self.log_event("New log client connected", "FastAPI")

        try:
            while True:
                await asyncio.sleep(2)
        except WebSocketDisconnect:
            self.active_log_connections.remove(websocket)
            await self.log_event("Logs client disconnected", "FastAPI")
