
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
from dataclasses import dataclass
from typing import List, Dict, Any, Tuple


@dataclass
class AgentData:
    """Dataclass to encapsulate intermediate agent processing results."""
    nodes: List[Dict]
    edges: List[Dict]


class NsGrpcNetworkUtils:
    """
    Utility class to handle network-related operations for Neuro-San agents.
    This includes building nodes and edges for visualization.
    """
    @staticmethod
    def build_nodes_and_edges(connectivity_response: Dict[str, List[Dict[str, Any]]]) -> Dict[str, List[Dict]]:
        """
        Build nodes and edges for the agent network based on connectivity information.
        :param connectivity_response: The response from the gRPC connectivity call.
        :return: A dictionary containing nodes and edges for the network.
        """
        # Initialize data structures
        origin_to_tools: Dict[str, List[str]] = {}
        all_nodes: set = set()
        parent_map: Dict[str, str] = {}
        depth_map: Dict[str, int] = {}
        edges: List[Dict] = []
        nodes: List[Dict] = []

        # Step 1: Map each origin to its tools
        for entry in connectivity_response.get("connectivity_info", []):
            origin = entry["origin"]
            tools = entry.get("tools", [])
            origin_to_tools[origin] = tools
            all_nodes.add(origin)
            all_nodes.update(tools)
            for tool in tools:
                parent_map[tool] = origin

        # Step 2: Assign depth to each node
        stack: List[Tuple[str, int]] = [(node, 0) for node in all_nodes if node not in parent_map]
        while stack:
            current_node, current_depth = stack.pop()
            if current_node not in depth_map or depth_map[current_node] < current_depth:
                depth_map[current_node] = current_depth
                for child in origin_to_tools.get(current_node, []):
                    stack.append((child, current_depth + 1))

        # Step 3: Build node dicts
        for node in all_nodes:
            children = origin_to_tools.get(node, [])
            nodes.append({
                "id": node,
                "type": "agent",
                "data": {
                    "label": node,
                    "depth": depth_map.get(node, 0),
                    "parent": parent_map.get(node),
                    "children": children,
                    "dropdown_tools": [],
                    "sub_networks": []
                },
                "position": {
                    "x": 100,
                    "y": 100
                }
            })

        # Step 4: Build edge dicts
        for origin, tools in origin_to_tools.items():
            for tool in tools:
                edges.append({
                    "id": f"{origin}-{tool}",
                    "source": origin,
                    "target": tool,
                    "animated": True
                })

        return {"nodes": nodes, "edges": edges}
