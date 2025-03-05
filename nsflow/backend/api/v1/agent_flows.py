from pathlib import Path
import logging
from fastapi import APIRouter, HTTPException
from pyhocon import ConfigFactory

logging.basicConfig(level=logging.INFO)

router = APIRouter(prefix="/api/v1")

# Define the registries directory
REGISTRY_DIR = Path.cwd() / "registries"


def get_manifest_path():
    """
    Get the manifest.hocon path
    """
    return REGISTRY_DIR / "manifest.hocon"


def list_available_networks():
    """Lists available networks from the manifest file."""
    manifest_path = get_manifest_path()
    if not manifest_path.exists():
        return {"networks": []}

    config = ConfigFactory.parse_file(str(manifest_path))
    networks = [
        Path(file).stem.replace('"', "").strip()
        for file, enabled in config.items()
        if enabled is True
    ]

    return {"networks": networks}


@router.get("/networks/")
def get_networks():
    """Returns a list of available agent networks."""
    return list_available_networks()


def parse_agent_network(file_path: Path):
    """Parses an agent network from a HOCON configuration file."""
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

    def process_agent(agent, parent=None, depth=0):
        """Recursively processes each agent in the network, capturing hierarchy details."""
        agent_id = agent.get("name", "unknown_agent")

        child_nodes = []
        dropdown_tools = []

        for tool_name in agent.get("tools", []):
            if tool_name in node_lookup:
                child_agent = node_lookup[tool_name]
                if child_agent.get("class", "No class") == "No class":
                    child_nodes.append(tool_name)
                else:
                    dropdown_tools.append(tool_name)

        nodes.append({
            "id": agent_id,
            "type": "agent",
            "data": {
                "label": agent_id,
                "depth": depth,
                "parent": parent,
                "children": child_nodes,
                "dropdown_tools": dropdown_tools
            },
            "position": {"x": 100, "y": 100},
        })

        agent_details[agent_id] = {
            "instructions": agent.get("instructions", "No instructions"),
            "command": agent.get("command", "No command"),
            "class": agent.get("class", "No class"),
            "function": agent.get("function"),
            "dropdown_tools": dropdown_tools
        }

        for child_id in child_nodes:
            edges.append({
                "id": f"{agent_id}-{child_id}",
                "source": agent_id,
                "target": child_id,
                "animated": True,
            })
            process_agent(node_lookup[child_id], parent=agent_id, depth=depth + 1)

    process_agent(front_man)

    return {"nodes": nodes, "edges": edges, "agent_details": agent_details}


@router.get("/network/{network_name}")
def get_agent_network(network_name: str):
    """Retrieves the network structure for a given agent network."""
    file_path = REGISTRY_DIR / f"{network_name}.hocon"
    logging.info("file_path: %s", file_path)
    return parse_agent_network(file_path)
