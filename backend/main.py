from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pyhocon import ConfigFactory
from pathlib import Path

app = FastAPI()

# 🔹 Enable CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

REGISTRY_DIR = Path("../registries")

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
