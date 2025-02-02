from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
import asyncio
import logging
from typing import Dict, List
from neuro_san.session.service_agent_session import ServiceAgentSession

router = APIRouter(prefix="/api/v1/ws")

logging.basicConfig(level=logging.INFO)

# Store active WebSocket connections
active_chat_connections: Dict[str, WebSocket] = {}
active_log_connections: List[WebSocket] = []
user_sessions: Dict[str, Dict] = {}

# WebSocket Route for Chat Communication
@router.websocket("/chat")
async def websocket_chat(websocket: WebSocket):
    await websocket.accept()
    client_id = str(websocket.client)
    active_chat_connections[client_id] = websocket
    logging.info(f"Chat client {client_id} connected.")

    # Initialize or reuse session
    if client_id not in user_sessions:
        user_sessions[client_id] = {
            "agent_session": ServiceAgentSession(host="localhost", port=30011, agent_name="telco_network_support"),
            "session_id": None
        }

    agent_session = user_sessions[client_id]["agent_session"]

    try:
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            user_input = message_data.get("message", "")
            sly_data = message_data.get("sly_data", None)

            if user_input:
                logging.info(f"Received chat message from {client_id}: {user_input}")

                chat_request = {
                    "session_id": user_sessions[client_id]["session_id"],
                    "user_input": user_input
                }
                if sly_data:
                    chat_request["sly_data"] = json.loads(sly_data)

                chat_response = await asyncio.to_thread(agent_session.chat, chat_request)

                # Save session ID if it was initialized
                if not user_sessions[client_id]["session_id"]:
                    user_sessions[client_id]["session_id"] = chat_response.get("session_id")

                asyncio.create_task(background_response_handler(client_id))

    except WebSocketDisconnect:
        logging.info(f"Chat client {client_id} disconnected.")
        active_chat_connections.pop(client_id, None)
        user_sessions.pop(client_id, None)


# WebSocket Route for Log Streaming
@router.websocket("/logs")
async def websocket_logs(websocket: WebSocket):
    await websocket.accept()
    active_log_connections.append(websocket)
    logging.info("Logs client connected.")

    try:
        while True:
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        active_log_connections.remove(websocket)
        logging.info("Logs client disconnected.")


# Background Task to Fetch Logs and Send Updates
async def background_response_handler(client_id: str):
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
            logging.info(f"New logs received: {new_logs}")
            for log in new_logs:
                for websocket in active_log_connections:
                    try:
                        await websocket.send_text(json.dumps({"log": log}))
                    except WebSocketDisconnect:
                        active_log_connections.remove(websocket)

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
