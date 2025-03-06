import json
import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, List
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
        """Handles WebSocket chat communication."""
        await websocket.accept()
        client_id = str(websocket.client)
        self.active_chat_connections[client_id] = websocket
        await self.log_event(f"Chat client {client_id} connected to agent: {agent_name}", "FastAPI")

        # Initialize session if not already available
        if client_id not in self.user_sessions or self.user_sessions[client_id]["agent_name"] != agent_name:
            self.user_sessions[client_id] = {
                "agent_session": GrpcServiceAgentSession(
                    host="localhost", port=self.SERVER_PORT, agent_name=agent_name),
                "session_id": None,
                "agent_name": agent_name
            }

        agent_session = self.user_sessions[client_id]["agent_session"]

        try:
            while True:
                data = await websocket.receive_text()
                message_data = json.loads(data)
                user_input = message_data.get("message", "")
                sly_data = message_data.get("sly_data", None)

                if user_input:
                    await self.log_event(f"User input: {user_input}", "FastAPI")
                    chat_request = {"session_id": self.user_sessions[client_id]["session_id"], "user_input": user_input}
                    if sly_data:
                        chat_request["sly_data"] = json.loads(sly_data)

                    # Start streaming responses
                    asyncio.create_task(self.handle_streaming_chat(agent_session, client_id, chat_request))

        except WebSocketDisconnect:
            await self.log_event(f"Chat client {client_id} disconnected.", "FastAPI")
            self.active_chat_connections.pop(client_id, None)
            self.user_sessions.pop(client_id, None)

    async def handle_streaming_chat(self, agent_session, client_id, chat_request):
        """Handles streaming chat responses asynchronously."""
        try:
            loop = asyncio.get_running_loop()
            response_generator = await loop.run_in_executor(None, agent_session.streaming_chat, chat_request)
            final_response = None
            otrace = None

            # Stream responses
            for response_message in response_generator:
                if response_message is None:
                    continue

                response_dict = json.loads(json.dumps(response_message))  # Convert to JSON-compatible dict
                # Send all logs from NeuroSan
                # await self.log_event(f"{response_dict}", "NeuroSan")
                # Extract AI response from response_dict

                # Extract AI response & origin trace
                if "response" in response_dict:
                    if response_dict["response"].get("type") == "AI":
                        final_response = response_dict["response"]["text"]
                    if response_dict["response"].get("type") in ["AGENT", "AGENT_TOOL_RESULT"]:
                        otrace = response_dict["response"].get("origin", [])
                        otrace = [i.get("tool") for i in otrace]

                otrace_str = json.dumps({"otrace": otrace})
                await self.log_event(f"{otrace_str}", "NeuroSan")

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
                await asyncio.sleep(1)
        except WebSocketDisconnect:
            self.active_log_connections.remove(websocket)
            await self.log_event("Logs client disconnected", "FastAPI")
