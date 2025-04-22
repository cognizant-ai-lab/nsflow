
# Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
# All Rights Reserved.
# Issued under the Academic Public License.
#
# You can be released from the terms, and requirements of the Academic Public
# License by purchasing a commercial license.
# Purchase of a commercial license is mandatory for any use of the
# ENN-release SDK Software in commercial settings.
#
# END COPYRIGHT
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
FIXTURES_DIR = os.path.join(ROOT_DIR, "tests", "fixtures")
TEST_NETWORK = os.path.join(FIXTURES_DIR, "test_network.hocon")


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
        self.fixtures_dir = FIXTURES_DIR

    def get_manifest_path(self):
        """Returns the manifest.hocon path."""
        return Path(self.registry_dir) / "manifest.hocon"

    def get_test_manifest_path(self):
        """Returns the manifest.hocon path."""
        return Path(self.fixtures_dir) / "manifest.hocon"

    def get_network_file_path(self, network_name: str) -> Path:
        """Returns the correct path for a given network name, ensuring it is confined to a safe directory."""
        base_dir = self.fixtures_dir if network_name == "test_network" else self.registry_dir
        file_path = Path(base_dir) / f"{network_name}.hocon"
        # Normalize and validate the path
        resolved_path = file_path.resolve(strict=False)
        if not resolved_path.is_relative_to(Path(base_dir).resolve(strict=True)):
            raise HTTPException(
                status_code=403,
                detail="Access to this file is not allowed"
            )
        return resolved_path

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
    def load_hocon_config(file_path: Path, base_dir: Path=ROOT_DIR):
        """
        Load a HOCON file from the given directory and parse it safely.
        
        :param file_path: Path to the config file.
        :param base_dir: Base directory to confine access.
        """
        try:
            # Resolve the absolute path and normalize it
            resolved_path = file_path.resolve(strict=False)
            # Ensure base_dir is provided and validate the path
            base_dir = base_dir.resolve(strict=True)
            if not resolved_path.is_relative_to(base_dir):
                raise HTTPException(
                    status_code=403,
                    detail="Access to this file is not allowed"
                )
            
            if not resolved_path.exists() or not resolved_path.is_file():
                raise HTTPException(status_code=404, detail="Config file not found")

            config = ConfigFactory.parse_file(str(resolved_path))
            return config

        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error parsing HOCON: {str(e)}") from e


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

        front_man = self.find_front_man(file_path)

        if not front_man:
            raise HTTPException(status_code=400, detail="No front-man agent found in network.")

        agent_data = AgentData(front_man, nodes, edges, agent_details, node_lookup)
        self.process_agent(agent_data)

        return {"nodes": nodes, "edges": edges, "agent_details": agent_details}

    def find_front_man(self, file_path: Path):
        """Finds the front-man agent from the tools list.
        1. First, check if an agent has a function **without parameters**.
        2. If all agents have parameters, **fallback to the first agent** in the HOCON file.
        """
        front_men: List[str] = []
        config = self.load_hocon_config(file_path)
        tools = config.get("tools", [])

        # Ensure all tools have a "command" key
        for tool in tools:
            if "command" not in tool:
                tool["command"] = ""

        # Try to find an agent with a function **without parameters**
        for tool in tools:
            if isinstance(tool.get("function"), dict) and "parameters" not in tool["function"]:
                front_men.append(tool)

        # If no such agent is found, fallback to the **first agent in HOCON**
        if tools:
            front_men.append(tools[0])

        if len(front_men) == 0:
            raise ValueError("No front-man found. "
                             "One entry's function must not have any parameters defined to be the front man")

        front_man = front_men[0]
        return front_man

    def process_agent(self, data: AgentData):
        """Recursively processes each agent in the network, capturing hierarchy details."""
        agent_id = data.agent.get("name", "unknown_agent")

        child_nodes = []
        dropdown_tools = []
        sub_networks = []  # Track sub-network tools

        for tool_name in data.agent.get("tools", []):
            if tool_name.startswith("/"):  # Identify sub-network tools
                sub_networks.append(tool_name.lstrip("/"))  # Remove leading `/`
            elif tool_name in data.node_lookup:
                child_agent = data.node_lookup[tool_name]
                if child_agent.get("class", "No class") == "No class":
                    child_nodes.append(tool_name)
                else:
                    dropdown_tools.append(tool_name)

        # Add the agent node
        data.nodes.append({
            "id": agent_id,
            "type": "agent",
            "data": {
                "label": agent_id,
                "depth": data.depth,
                "parent": data.parent,
                "children": child_nodes,
                "dropdown_tools": dropdown_tools,
                "sub_networks": sub_networks,  # Store sub-networks separately
            },
            "position": {"x": 100, "y": 100},
        })

        data.agent_details[agent_id] = {
            "instructions": data.agent.get("instructions", "No instructions"),
            "command": data.agent.get("command", "No command"),
            "class": data.agent.get("class", "No class"),
            "function": data.agent.get("function"),
            "dropdown_tools": dropdown_tools,
            "sub_networks": sub_networks,  # Add sub-network info
        }

        # Add edges and recursively process normal child nodes
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

        # Process sub-network tools as separate green nodes
        for sub_network in sub_networks:
            data.nodes.append({
                "id": sub_network,
                "type": "sub-network",  # Differentiate node type
                "data": {
                    "label": sub_network,
                    "depth": data.depth + 1,
                    "parent": agent_id,
                    "color": "green",  # Mark sub-network nodes as green
                },
                "position": {"x": 200, "y": 200},
            })

            # Connect sub-network tool to its parent agent
            data.edges.append({
                "id": f"{agent_id}-{sub_network}",
                "source": agent_id,
                "target": sub_network,
                "animated": True,
                "color": "green",  # Mark sub-network edges as green
            })

    def extract_connectivity_info(self, file_path: Path):
        """Extracts connectivity details from an HOCON network configuration file."""
        logging.info("utils file_path: %s", file_path)

        config = self.load_hocon_config(file_path)
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

    def extract_coded_tool_class(self, file_path: Path):
        """Extract all the coded tool classes in a list"""
        config = self.load_hocon_config(file_path)
        tools = config.get("tools", [])
        coded_tool_classes: List[str] = []
        for tool in tools:
            class_name = tool.get("class", None)
            if class_name:
                coded_tool_classes.append(class_name)
        return coded_tool_classes
