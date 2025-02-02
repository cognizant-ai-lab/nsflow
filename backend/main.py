from pyhocon import ConfigFactory
from pathlib import Path

REGISTRY_DIR = Path("../registries")

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json
import asyncio
import logging
from typing import Dict, List

from neuro_san.session.service_agent_session import ServiceAgentSession

logging.basicConfig(level=logging.INFO)

app = FastAPI()

# Enable CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Adjust as needed
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store active WebSocket connections
active_chat_connections: Dict[str, WebSocket] = {}
active_log_connections: List[WebSocket] = []
user_sessions: Dict[str, Dict] = {}

# ✅ WebSocket Route for Chat Communication
@app.websocket("/ws/chat")
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

            if user_input:
                logging.info(f"Received chat message from {client_id}: {user_input}")

                # Send user input to the agent session
                chat_request = {"session_id": user_sessions[client_id]["session_id"], "user_input": user_input}
                chat_response = await asyncio.to_thread(agent_session.chat, chat_request)

                # Save session ID if it was initialized
                if not user_sessions[client_id]["session_id"]:
                    user_sessions[client_id]["session_id"] = chat_response.get("session_id")

                # Start background log polling
                asyncio.create_task(background_response_handler(client_id))

    except WebSocketDisconnect:
        logging.info(f"Chat client {client_id} disconnected.")
        active_chat_connections.pop(client_id, None)
        user_sessions.pop(client_id, None)


# ✅ WebSocket Route for Log Streaming
@app.websocket("/ws/logs")
async def websocket_logs(websocket: WebSocket):
    await websocket.accept()
    active_log_connections.append(websocket)
    logging.info("Logs client connected.")

    try:
        while True:
            await asyncio.sleep(1)  # Prevents CPU overuse
    except WebSocketDisconnect:
        active_log_connections.remove(websocket)
        logging.info("Logs client disconnected.")


# ✅ Background Task to Fetch Logs and Send Updates
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

        # Extract new logs only
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

        # Check if assistant response is available
        if chat_response and not response_sent:
            last_response = chat_response.rsplit("assistant: ", 1)[-1]
            if client_id in active_chat_connections:
                try:
                    await active_chat_connections[client_id].send_text(json.dumps({"message": last_response}))
                    response_sent = True
                except WebSocketDisconnect:
                    active_chat_connections.pop(client_id, None)

        # Stop polling once response is sent
        if response_sent:
            break

        await asyncio.sleep(1)

# Hocon parsing stuff
def get_manifest_path():
    return REGISTRY_DIR / "manifest.hocon"

def list_available_networks():
    manifest_path = get_manifest_path()

    if not manifest_path.exists():
        return {"networks": []}

    config = ConfigFactory.parse_file(str(manifest_path))
    networks = [Path(file).stem.replace('"', "").strip() for file, enabled in config.items() if enabled is True]

    return {"networks": networks}

@app.get("/networks/")
def get_networks():
    return list_available_networks()

def parse_agent_network(file_path: Path):
    """Parses HOCON and extracts agents hierarchy & edges correctly."""
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"HOCON file '{file_path.name}' not found.")

    config = ConfigFactory.parse_file(str(file_path))

    nodes = []
    edges = []
    agent_details = {}
    node_lookup = {}

    tools = config.get("tools", [])

    # 🔹 **Step 1: Collect All Agents First**
    for tool in tools:
        agent_id = tool.get("name", "unknown_agent")
        node_lookup[agent_id] = tool  # Store the agent for lookup

    # 🔹 **Step 2: Identify the Front-Man (Root Agent)**
    front_man = None
    for tool in tools:
        if isinstance(tool.get("function"), dict) and "parameters" not in tool["function"]:
            front_man = tool
            break
        if not tool.get("command"):
            front_man = tool
            break

    if not front_man:
        raise HTTPException(status_code=400, detail="No front-man agent found in network.")

    # 🔹 **Step 3: Recursively Process Agents**
    def process_agent(agent, depth=0):
        agent_id = agent.get("name", "unknown_agent")

        # Add node with depth info
        nodes.append({
            "id": agent_id,
            "type": "agent",
            "data": {
                "label": agent_id,
                "depth": depth,
            },
            "position": {"x": 100, "y": 100},  # Placeholder
        })

        # Store details
        agent_details[agent_id] = {
            "instructions": agent.get("instructions", "No instructions"),
            "command": agent.get("command", "No command"),
            "class": agent.get("class", "No class"),
            "function": agent.get("function"),
        }

        # 🔹 Process child agents
        for child_id in agent.get("tools", []):
            if child_id in node_lookup:
                # Add edge
                edges.append({
                    "id": f"{agent_id}-{child_id}",
                    "source": agent_id,
                    "target": child_id,
                    "animated": True,
                })

                # Recursively process child
                process_agent(node_lookup[child_id], depth + 1)
            else:
                print(f"Warning: {agent_id} references missing child '{child_id}'!")

    # Start recursion from front-man
    process_agent(front_man)

    return {"nodes": nodes, "edges": edges, "agent_details": agent_details}

@app.get("/network/{network_name}")
def get_agent_network(network_name: str):
    file_path = REGISTRY_DIR / f"{network_name}.hocon"
    return parse_agent_network(file_path)
