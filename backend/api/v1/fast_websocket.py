from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request
import json
import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, List
from neuro_san.session.grpc_service_agent_session import GrpcServiceAgentSession
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/api/v1/ws")

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
uvicorn_logger = logging.getLogger("uvicorn")

# Store WebSocket connections and user sessions
active_chat_connections: Dict[str, WebSocket] = {}
active_log_connections: List[WebSocket] = []
user_sessions: Dict[str, Dict] = {}
log_buffer: List[Dict] = []
LOG_BUFFER_SIZE = 100

SERVER_PORT = 30015

def get_timestamp():
    """Returns the current timestamp in ISO format."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

async def log_event(message: str, source: str = "FastAPI"):
    """Logs events and sends them to all connected clients."""
    log_entry = {"timestamp": get_timestamp(), "message": message, "source": source}
    logging.info(f"{source}: {message}")

    # Add log entry to buffer (for SSE)
    log_buffer.append(log_entry)
    if len(log_buffer) > LOG_BUFFER_SIZE:
        log_buffer.pop(0)

    # Broadcast to WebSocket clients
    await broadcast_log(log_entry)

async def broadcast_log(log_entry):
    """Broadcast logs to all connected clients."""
    logging.info(f"Broadcasting log: {log_entry}")
    for websocket in active_log_connections:
        try:
            await websocket.send_text(json.dumps(log_entry))
        except WebSocketDisconnect:
            active_log_connections.remove(websocket)

# WebSocket Route for Chat Communication
@router.websocket("/chat/{agent_name}")
async def websocket_chat(websocket: WebSocket, agent_name: str):
    await websocket.accept()
    client_id = str(websocket.client)
    active_chat_connections[client_id] = websocket
    await log_event(f"Chat client {client_id} connected to agent: {agent_name}", "FastAPI")

    # Initialize or reuse session
    if client_id not in user_sessions or user_sessions[client_id]["agent_name"] != agent_name:
        user_sessions[client_id] = {
            "agent_session": GrpcServiceAgentSession(host="localhost", port=SERVER_PORT, agent_name=agent_name),
            "session_id": None,
            "agent_name": agent_name
        }

    agent_session = user_sessions[client_id]["agent_session"]

    try:
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            user_input = message_data.get("message", "")
            sly_data = message_data.get("sly_data", None)

            if user_input:
                await log_event(f"User input: {user_input}", "FastAPI")

                chat_request = {"session_id": user_sessions[client_id]["session_id"], "user_input": user_input}
                if sly_data:
                    chat_request["sly_data"] = json.loads(sly_data)

                # Start streaming responses in a background task
                asyncio.create_task(handle_streaming_chat(agent_session, client_id, chat_request))

    except WebSocketDisconnect:
        await log_event(f"Chat client {client_id} disconnected.", "FastAPI")
        active_chat_connections.pop(client_id, None)
        user_sessions.pop(client_id, None)

async def handle_streaming_chat(agent_session, client_id, chat_request):
    """Handles streaming chat responses properly in an async function."""
    try:
        # Set up streaming generator
        loop = asyncio.get_running_loop()
        response_generator = await loop.run_in_executor(None, agent_session.streaming_chat, chat_request)
        final_response = None
        otrace = None

        # Stream responses
        for response_message in response_generator:
            if response_message is None:
                continue  # Skip if response is None

            response_dict = json.loads(json.dumps(response_message))  # Convert to JSON-compatible dict
            # Send all logs from NeuroSan
            # await log_event(f"{response_dict}", "NeuroSan")
            # Extract AI response from response_dict
            if "response" in response_dict:
                if response_dict["response"].get("type") == "AI":
                    final_response = response_dict["response"]["text"]
                if response_dict["response"].get("type") in ["AGENT", "AGENT_TOOL_RESULT"]:
                    otrace = response_dict["response"].get("origin",[])
                    otrace = [i.get("tool") for i in otrace]
            otrace_str = json.dumps({"otrace": otrace})
            await log_event(f"{otrace_str}", "NeuroSan")

        if final_response and client_id in active_chat_connections:
            try:
                response_str = json.dumps({"message": {"type": "AI", "text": final_response}})
                await active_chat_connections[client_id].send_text(response_str)
                await log_event(f"Streaming response sent: {response_str}", "FastAPI")
            except WebSocketDisconnect:
                active_chat_connections.pop(client_id, None)
            except RuntimeError as e:
                logging.error(f"Error sending streaming response: {e}")
                active_chat_connections.pop(client_id, None)

        # Do not close WebSocket here; allow continuous interaction
        await log_event(f"Streaming chat finished for client: {client_id}", "FastAPI")

    except Exception as e:
        logging.error(f"Error in streaming chat: {e}")

# WebSocket Route for Log Streaming
@router.websocket("/logs")
async def websocket_logs(websocket: WebSocket):
    await websocket.accept()
    active_log_connections.append(websocket)
    await log_event("New log client connected", "FastAPI")

    try:
        while True:
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        active_log_connections.remove(websocket)
        await log_event("Logs client disconnected", "FastAPI")

@router.get("/connectivity/{agent_name}")
async def get_agent_connectivity(agent_name: str):
    """Fetch agent connectivity details using NeuroSan's `connectivity` method."""
    try:
        agent_session = GrpcServiceAgentSession(host="localhost", port=SERVER_PORT, agent_name=agent_name)
        connectivity_response = agent_session.connectivity({})
        return {"connectivity": connectivity_response.get("connectivity_info", [])}
    except Exception as e:
        logging.error(f"Error fetching connectivity for agent {agent_name}: {str(e)}")
        return {"error": str(e)}

@router.get("/function/{agent_name}")
async def get_agent_connectivity(agent_name: str):
    """Fetch agent function details using NeuroSan's `function` method."""
    try:
        agent_session = GrpcServiceAgentSession(host="localhost", port=SERVER_PORT, agent_name=agent_name)
        function_response = agent_session.function({})
        return {"function": function_response.get("function", [])}
    except Exception as e:
        logging.error(f"Error fetching function for agent {agent_name}: {str(e)}")
        return {"error": str(e)}
