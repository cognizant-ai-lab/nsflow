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
            "agent_session": GrpcServiceAgentSession(host="localhost", port=30011, agent_name=agent_name),
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
    loop = asyncio.get_running_loop()
    
    try:
        # Run generator function inside a thread
        response_generator = await loop.run_in_executor(None, agent_session.streaming_chat, chat_request)

        last_response = None  # Store last response to ensure it's sent
        async def ensure_final_broadcast():
            """Ensures final messages are sent before disconnecting."""
            if last_response and client_id in active_chat_connections:
                try:
                    await active_chat_connections[client_id].send_text(json.dumps({"message": last_response}))
                    await log_event(f"Final response sent: {last_response}", "FastAPI")
                except WebSocketDisconnect:
                    active_chat_connections.pop(client_id, None)

        for response_chunk in response_generator:
            chat_response = response_chunk.get("response", "")
            if chat_response:
                last_response = chat_response  # Save latest response
                if client_id in active_chat_connections:
                    try:
                        await active_chat_connections[client_id].send_text(json.dumps({"message": chat_response}))
                        await log_event(f"Streaming response sent: {chat_response}", "FastAPI")
                    except WebSocketDisconnect:
                        active_chat_connections.pop(client_id, None)

        # Ensure the last message gets broadcasted before WebSocket closes
        await ensure_final_broadcast()

        # Save session ID if it was initialized
        if not user_sessions[client_id]["session_id"]:
            user_sessions[client_id]["session_id"] = response_chunk.get("session_id")

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

# Background Task to Fetch Logs and Send Updates
async def background_response_handler(client_id: str):
    """Handles responses from the agent session."""
    if client_id not in user_sessions:
        logging.warning(f"No session found for {client_id}")
        return

    agent_session = user_sessions[client_id]["agent_session"]
    session_id = user_sessions[client_id]["session_id"]

    last_logs_length = 0
    response_sent = False

    while True:
        logs_request = {"session_id": session_id}
        logs_response = await asyncio.to_thread(agent_session.logs, logs_request)
        logs = logs_response.get("logs", [])
        chat_response = logs_response.get("chat_response")

        new_logs = logs[last_logs_length:]
        last_logs_length = len(logs)

        if new_logs:
            for log in new_logs:
                await log_event(log, "Neuro-SAN")

        if chat_response and not response_sent:
            last_response = chat_response.rsplit("assistant: ", 1)[-1]
            if client_id in active_chat_connections:
                try:
                    await active_chat_connections[client_id].send_text(json.dumps({"message": last_response}))
                    response_sent = True
                except WebSocketDisconnect:
                    active_chat_connections.pop(client_id, None)

        if response_sent:
            break

        await asyncio.sleep(1)

async def broadcast_log(log_entry):
    """Broadcast logs to all connected clients."""
    logging.info(f"Broadcasting log: {log_entry}")
    for websocket in active_log_connections:
        try:
            await websocket.send_text(json.dumps(log_entry))
        except WebSocketDisconnect:
            active_log_connections.remove(websocket)

@router.get("/connectivity/{agent_name}")
async def get_agent_connectivity(agent_name: str):
    """Fetch agent connectivity details using Neuro-SAN's `connectivity` method."""
    try:
        agent_session = GrpcServiceAgentSession(host="localhost", port=30011, agent_name=agent_name)
        connectivity_response = agent_session.connectivity({})
        return {"connectivity": connectivity_response.get("connectivity_info", [])}
    except Exception as e:
        logging.error(f"Error fetching connectivity for agent {agent_name}: {str(e)}")
        return {"error": str(e)}

@router.get("/logs-stream")
async def stream_logs(request: Request):
    """HTTP/2 SSE (Server-Sent-Event) endpoint for streaming logs."""
    async def event_generator():
        last_sent_index = len(log_buffer)
        while not await request.is_disconnected():
            if last_sent_index < len(log_buffer):
                new_logs = log_buffer[last_sent_index:]
                for log in new_logs:
                    yield f"data: {json.dumps(log)}\n\n"
                last_sent_index = len(log_buffer)
            await asyncio.sleep(1)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
