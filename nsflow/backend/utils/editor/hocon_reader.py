# Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
# All Rights Reserved.
# Issued under the Academic Public License.
#
# You can be released from the terms, and requirements of the Academic Public
# License by purchasing a commercial license.
# Purchase of a commercial license is mandatory for any use of the
# nsflow SDK Software in commercial settings.
#
# END COPYRIGHT

"""
Independent HOCON reader for the editor system.
Removes dependency on AgentNetworkUtils to prevent conflicts.
"""

import os
import re
import logging
from typing import Dict, List, Any, Optional

from leaf_common.persistence.easy.easy_hocon_persistence import EasyHoconPersistence

logger = logging.getLogger(__name__)


class IndependentHoconReader:
    """
    Independent HOCON reader that doesn't depend on AgentNetworkUtils.
    Reads HOCON files directly for the editor system.
    """
    
    def __init__(self):
        self.registry_dir = self._get_registry_dir()
        self.manifest_file = os.path.join(self.registry_dir, "manifest.hocon")
    
    def _get_registry_dir(self) -> str:
        """Get the registry directory path using the same logic as AgentNetworkUtils"""
        agent_manifest_file = os.getenv("AGENT_MANIFEST_FILE")
        if not agent_manifest_file:
            # Use the same path calculation as in agent_network_utils.py lines 36-46
            # From nsflow/backend/utils/editor/ we need to go up 4 levels to reach nsflow project root
            this_dir = os.path.dirname(os.path.abspath(__file__))  # nsflow/backend/utils/editor
            root_dir = os.path.abspath(os.path.join(this_dir, "../../../.."))  # Go up 4 levels to nsflow root
            agent_manifest_file = os.path.join(root_dir, "registries", "manifest.hocon")
        
        registry_dir = os.path.dirname(agent_manifest_file)
        logger.debug(f"Registry directory: {registry_dir}")
        return registry_dir
    
    def list_available_networks(self) -> Dict[str, Any]:
        """List all available networks from the manifest file"""
        try:
            if not os.path.exists(self.manifest_file):
                return {"networks": []}
            
            # Use EasyHoconPersistence
            hocon = EasyHoconPersistence(full_ref=self.manifest_file, must_exist=True)
            config = hocon.restore()
            
            networks = [
                os.path.splitext(os.path.basename(file))[0].replace('"', "").strip()
                for file, enabled in config.items()
                if enabled is True
            ]
            
            return {"networks": networks}
            
        except Exception as e:
            logger.error(f"Failed to list available networks: {e}")
            return {"networks": []}
    
    def get_network_file_path(self, network_name: str) -> str:
        """
        Get the file path for a network HOCON file.
        Validates to prevent directory traversal.
        """
        # Sanitize input to strip any path-like behavior
        sanitized_name = os.path.basename(network_name)
        
        # Ensure only safe characters are used (alphanumeric, _, -)
        if not re.match(r'^[\w\-]+$', sanitized_name):
            raise ValueError("Invalid network name. Only alphanumeric, underscores, and hyphens are allowed.")
        
        # Build full path inside safe registry dir
        raw_path = os.path.join(self.registry_dir, f"{sanitized_name}.hocon")
        
        # Normalize and resolve to handle ../ or symlinks
        resolved_path = os.path.realpath(os.path.normpath(str(raw_path)))
        allowed_dir = os.path.realpath(str(self.registry_dir))
        
        # Ensure resolved path stays inside allowed dir
        if not resolved_path.startswith(allowed_dir + os.sep):
            raise ValueError("Access denied: Path is outside allowed directory")
        
        return resolved_path
    
    def read_network_config(self, network_name: str) -> Dict[str, Any]:
        """
        Read and parse a network HOCON configuration file.
        Returns the parsed configuration as a dictionary.
        """
        try:
            file_path = self.get_network_file_path(network_name)
            
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"Network file not found: {file_path}")
            
            # Use EasyHoconPersistence
            hocon = EasyHoconPersistence(full_ref=file_path, must_exist=True)
            config = hocon.restore()
            return dict(config)
            
        except Exception as e:
            logger.error(f"Failed to read network config for '{network_name}': {e}")
            raise
    
    def parse_agent_network_for_editor(self, network_name: str) -> Dict[str, Any]:
        """
        Parse agent network and return in the format expected by the editor.
        This replaces the functionality from AgentNetworkUtils.parse_agent_network().
        """
        try:
            config = self.read_network_config(network_name)
            
            nodes = []
            edges = []
            agent_details = {}
            node_lookup = {}
            
            tools = config.get("tools", [])
            
            # Ensure all tools have a "command" key for compatibility
            for tool in tools:
                if "command" not in tool:
                    tool["command"] = ""
            
            # Build lookup dictionary for agents
            for tool in tools:
                agent_id = tool.get("name", "unknown_agent")
                node_lookup[agent_id] = tool
            
            # Find the frontman (first tool without parent or explicitly marked)
            frontman_name = self._find_frontman(tools, node_lookup)
            frontman = node_lookup.get(frontman_name)
            
            if not frontman:
                raise ValueError("No frontman agent found in network")
            
            # Process the network starting from frontman
            self._process_agent_recursive(
                frontman, nodes, edges, agent_details, node_lookup
            )
            
            return {"nodes": nodes, "edges": edges, "agent_details": agent_details}
            
        except Exception as e:
            logger.error(f"Failed to parse agent network '{network_name}': {e}")
            raise
    
    def _find_frontman(self, tools: List[Dict], node_lookup: Dict[str, Dict]) -> Optional[str]:
        """Find the frontman agent (root of the network)"""
        # First, find all agents that are referenced as tools by others
        referenced_agents = set()
        for tool in tools:
            for child in tool.get("tools", []):
                if child in node_lookup:
                    referenced_agents.add(child)
        
        # Frontman is an agent that exists but is not referenced by others
        for tool in tools:
            agent_name = tool.get("name")
            if agent_name and agent_name not in referenced_agents:
                return agent_name
        
        # Fallback: return the first agent
        if tools:
            return tools[0].get("name")
        
        return None
    
    def _process_agent_recursive(self, agent: Dict, nodes: List, edges: List, 
                                agent_details: Dict, node_lookup: Dict, 
                                parent: Optional[str] = None, depth: int = 0):
        """Recursively process agents to build nodes and edges"""
        agent_id = agent.get("name", "unknown_agent")
        
        child_nodes = []
        dropdown_tools = []
        sub_networks = []
        
        # Process tools (children)
        for tool_name in agent.get("tools", []):
            if self._is_url_like(tool_name) or tool_name.startswith("/"):
                # External/sub-network tools
                sub_networks.append(tool_name.lstrip("/"))
            elif tool_name in node_lookup:
                child_agent = node_lookup[tool_name]
                if child_agent.get("class", "No class") == "No class":
                    child_nodes.append(tool_name)
                else:
                    dropdown_tools.append(tool_name)
        
        # Add the agent node
        nodes.append({
            "id": agent_id,
            "type": "agent",
            "data": {
                "label": agent_id,
                "depth": depth,
                "parent": parent,
                "children": child_nodes,
                "dropdown_tools": dropdown_tools,
                "sub_networks": sub_networks,
            },
            "position": {"x": 100, "y": 100},
        })
        
        # Store agent details
        agent_details[agent_id] = {
            "instructions": agent.get("instructions", "No instructions"),
            "command": agent.get("command", "No command"),
            "class": agent.get("class", "No class"),
            "function": agent.get("function"),
            "dropdown_tools": dropdown_tools,
            "sub_networks": sub_networks,
        }
        
        # Add edges and recursively process child nodes
        for child_id in child_nodes:
            edges.append({
                "id": f"{agent_id}-{child_id}",
                "source": agent_id,
                "target": child_id,
                "animated": True,
            })
            
            # Recursively process child
            self._process_agent_recursive(
                node_lookup[child_id], nodes, edges, agent_details, node_lookup,
                parent=agent_id, depth=depth + 1
            )
        
        # Process sub-network tools as separate green nodes
        for sub_network in sub_networks:
            nodes.append({
                "id": sub_network,
                "type": "sub-network",
                "data": {
                    "label": sub_network,
                    "depth": depth + 1,
                    "parent": agent_id,
                    "color": "green",
                },
                "position": {"x": 200, "y": 200},
            })
            
            # Connect sub-network tool to its parent agent
            edges.append({
                "id": f"{agent_id}-{sub_network}",
                "source": agent_id,
                "target": sub_network,
                "animated": True,
                "color": "green",
            })
    
    @staticmethod
    def _is_url_like(s: str) -> bool:
        """Simple check to see if a string is URL-like"""
        try:
            import urllib.parse
            result = urllib.parse.urlparse(s)
            return bool(result.netloc) or (result.path and '/' in result.path)
        except Exception:
            return False
    
    def get_agent_details(self, network_name: str, agent_name: str) -> Dict[str, Any]:
        """
        Get details for a specific agent in a network.
        """
        try:
            config = self.read_network_config(network_name)
            tools = config.get("tools", [])
            
            for tool in tools:
                if tool.get("name") == agent_name:
                    return dict(tool)
            
            raise ValueError(f"Agent '{agent_name}' not found in network '{network_name}'")
            
        except Exception as e:
            logger.error(f"Failed to get agent details: {e}")
            raise
