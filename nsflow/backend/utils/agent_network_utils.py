import os
from pathlib import Path
import logging
from dataclasses import dataclass
from typing import Dict, List, Optional
from fastapi import HTTPException
from pyhocon import ConfigFactory

logging.basicConfig(level=logging.INFO)

# Define the registries directory
ROOT_DIR = os.getcwd()
REGISTRY_DIR = os.path.join(ROOT_DIR, "registries")
CODED_TOOLS_DIR = os.path.join(ROOT_DIR, "coded_tools")


@dataclass
class AgentData:
    """Dataclass to encapsulate agent processing parameters."""
    agent: Dict
    nodes: List[Dict]
    edges: List[Dict]
    agent_details: Dict
    node_lookup: Dict
    parent: Optional[str] = None
    depth: int = 0


class AgentNetworkUtils:
    """Encapsulates utility methods for agent network operations."""

    def __init__(self):
        self.registry_dir = REGISTRY_DIR

    def get_manifest_path(self):
        """Returns the manifest.hocon path."""
        return Path(self.registry_dir) / "manifest.hocon"

    def list_available_networks(self):
        """Lists available networks from the manifest file."""
        manifest_path = self.get_manifest_path()
        if not manifest_path.exists():
            return {"networks": []}

        config = ConfigFactory.parse_file(str(manifest_path))
        networks = [
            Path(file).stem.replace('"', "").strip()
            for file, enabled in config.items()
            if enabled is True
        ]

        return {"networks": networks}

    @staticmethod
    def load_hocon_config(file_path: Path):
        """Load a HOCON file from the given directory and parse it."""

        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(status_code=404, detail="Config file not found")

        try:
            config = ConfigFactory.parse_file(str(file_path))
            return config
        except Exception as e:
            raise HTTPException(status_code=500, detail=f'Error parsing HOCON: {str(e)}') from e

    def parse_agent_network(self, file_path: Path):
        """Parses an agent network from a HOCON configuration file."""
        config = self.load_hocon_config(file_path)

        nodes = []
        edges = []
        agent_details = {}
        node_lookup = {}

        tools = config.get("tools", [])

        # Ensure all tools have a "command" key
        for tool in tools:
            if "command" not in tool:
                tool["command"] = ""

        # Build lookup dictionary for agents
        for tool in tools:
            agent_id = tool.get("name", "unknown_agent")
            node_lookup[agent_id] = tool

        front_man = self.find_front_man(tools)

        if not front_man:
            raise HTTPException(status_code=400, detail="No front-man agent found in network.")

        agent_data = AgentData(front_man, nodes, edges, agent_details, node_lookup)
        self.process_agent(agent_data)

        return {"nodes": nodes, "edges": edges, "agent_details": agent_details}

    def find_front_man(self, tools):
        """Finds the front-man agent from the tools list."""
        for tool in tools:
            if isinstance(tool.get("function"), dict) and "parameters" not in tool["function"]:
                return tool
            # check for 'command' key
            if not tool.get("command", None):
                return tool
        return None

    def process_agent(self, data: AgentData):
        """Recursively processes each agent in the network, capturing hierarchy details."""
        agent_id = data.agent.get("name", "unknown_agent")

        child_nodes = []
        dropdown_tools = []

        for tool_name in data.agent.get("tools", []):
            if tool_name in data.node_lookup:
                child_agent = data.node_lookup[tool_name]
                if child_agent.get("class", "No class") == "No class":
                    child_nodes.append(tool_name)
                else:
                    dropdown_tools.append(tool_name)

        data.nodes.append({
            "id": agent_id,
            "type": "agent",
            "data": {
                "label": agent_id,
                "depth": data.depth,
                "parent": data.parent,
                "children": child_nodes,
                "dropdown_tools": dropdown_tools
            },
            "position": {"x": 100, "y": 100},
        })

        data.agent_details[agent_id] = {
            "instructions": data.agent.get("instructions", "No instructions"),
            "command": data.agent.get("command", "No command"),
            "class": data.agent.get("class", "No class"),
            "function": data.agent.get("function"),
            "dropdown_tools": dropdown_tools
        }

        for child_id in child_nodes:
            data.edges.append({
                "id": f"{agent_id}-{child_id}",
                "source": agent_id,
                "target": child_id,
                "animated": True,
            })

            child_agent_data = AgentData(
                agent=data.node_lookup[child_id],
                nodes=data.nodes,
                edges=data.edges,
                agent_details=data.agent_details,
                node_lookup=data.node_lookup,
                parent=agent_id,
                depth=data.depth + 1
            )
            self.process_agent(child_agent_data)

    def extract_connectivity_info(self, file_path: Path):
        """Extracts connectivity details from an HOCON network configuration file."""
        logging.info("utils file_path: %s", file_path)
        if not file_path.exists():
            raise HTTPException(status_code=404, detail=f"HOCON file '{file_path.name}' not found.")

        config = ConfigFactory.parse_file(str(file_path))
        tools = config.get("tools", [])

        connectivity = []
        processed_tools = set()

        for tool in tools:
            tool_name = tool.get("name", "unknown_tool")

            if tool_name in processed_tools:
                continue

            entry = {"origin": tool_name}

            if "tools" in tool and tool["tools"]:
                entry["tools"] = tool["tools"]

            if "class" in tool:
                entry["origin"] = tool["class"]

            connectivity.append(entry)
            processed_tools.add(tool_name)

        return {"connectivity": connectivity}
