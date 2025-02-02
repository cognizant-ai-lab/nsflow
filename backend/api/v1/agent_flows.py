from fastapi import APIRouter, HTTPException
from pyhocon import ConfigFactory
from pathlib import Path

router = APIRouter(prefix="/api/v1")

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

@router.get("/networks/")
def get_networks():
    return list_available_networks()

def parse_agent_network(file_path: Path):
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"HOCON file '{file_path.name}' not found.")

    config = ConfigFactory.parse_file(str(file_path))

    nodes = []
    edges = []
    agent_details = {}
    node_lookup = {}

    tools = config.get("tools", [])

    for tool in tools:
        agent_id = tool.get("name", "unknown_agent")
        node_lookup[agent_id] = tool

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

    def process_agent(agent, depth=0):
        agent_id = agent.get("name", "unknown_agent")

        nodes.append({
            "id": agent_id,
            "type": "agent",
            "data": {
                "label": agent_id,
                "depth": depth,
            },
            "position": {"x": 100, "y": 100},  
        })

        agent_details[agent_id] = {
            "instructions": agent.get("instructions", "No instructions"),
            "command": agent.get("command", "No command"),
            "class": agent.get("class", "No class"),
            "function": agent.get("function"),
        }

        for child_id in agent.get("tools", []):
            if child_id in node_lookup:
                edges.append({
                    "id": f"{agent_id}-{child_id}",
                    "source": agent_id,
                    "target": child_id,
                    "animated": True,
                })
                process_agent(node_lookup[child_id], depth + 1)

    process_agent(front_man)

    return {"nodes": nodes, "edges": edges, "agent_details": agent_details}

@router.get("/network/{network_name}")
def get_agent_network(network_name: str):
    file_path = REGISTRY_DIR / f"{network_name}.hocon"
    return parse_agent_network(file_path)
