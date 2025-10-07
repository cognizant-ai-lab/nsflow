
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


# pylint: disable=too-few-public-methods
class NsGrpcNetworkUtils:
    """
    Utility class to handle network-related operations for Neuro-San agents.
    This includes building nodes and edges for visualization.
    """
    # pylint: disable=too-many-locals
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

    @staticmethod
    def partial_build_nodes_and_edges(state_dict: Dict[str, Any]) -> Dict[str, List[Dict]]:
        """
        Build nodes and edges from agent network state dictionary.
        This method can handle partial/disconnected graphs and missing information.
        
        :param state_dict: Agent network state dictionary containing agent definitions
        :return: A dictionary containing nodes and edges for the network
        """
        nodes: List[Dict] = []
        edges: List[Dict] = []
        
        # Extract agent network definition
        agent_definition = state_dict.get("agent_network_definition", {})
        network_name = state_dict.get("agent_network_name", "unknown_network")
        
        if not agent_definition:
            return {
                "nodes": nodes,
                "edges": edges,
                "network_name": network_name,
                "connected_components": 0,
                "total_agents": 0,
                "defined_agents": 0,
                "undefined_agents": 0,
            }
        
        # Step 1: Create all nodes first
        all_agent_names = set(agent_definition.keys())

        # Step 2: Calculate depths and parent relationships
        parent_map: Dict[str, str] = {}
        depth_map: Dict[str, int] = {}
        
        # Build parent mapping from down_chains
        # Also collect all down_chain agents that might not be defined yet
        for agent_name, agent_data in agent_definition.items():
            down_chains = NsGrpcNetworkUtils.get_children(agent_data)
            all_agent_names.update(down_chains)
            for child in down_chains:
                parent_map[child] = agent_name
        
        # Calculate depths using breadth-first approach
        # Start with root nodes (those without parents)
        root_nodes = [name for name in all_agent_names if name not in parent_map]
        
        # If no clear hierarchy, treat all defined agents as potential roots
        if not root_nodes:
            root_nodes = list(agent_definition.keys())
        
        # BFS to assign depths
        queue = [(node, 0) for node in root_nodes]
        visited = set()
        
        while queue:
            current_node, depth = queue.pop(0)
            if current_node in visited:
                continue
            visited.add(current_node)
            depth_map[current_node] = depth
            
            # Add children to queue
            if current_node in agent_definition:
                down_chains =  NsGrpcNetworkUtils.get_children(agent_definition[current_node])
                for child in down_chains:
                    if child not in visited:
                        queue.append((child, depth + 1))
        
        # Handle orphaned nodes (not visited in BFS)
        for agent_name in all_agent_names:
            if agent_name not in depth_map:
                depth_map[agent_name] = 0  # Place orphans at root level
        
        # Step 3: Position calculation for better layout
        positions = NsGrpcNetworkUtils._calculate_positions(all_agent_names, depth_map, parent_map)
        
        # Step 4: Create node objects
        for agent_name in all_agent_names:
            agent_data = agent_definition.get(agent_name, {})
            # more details could be added here, but as of now, we are only using down_chains and instructions
            down_chains =  NsGrpcNetworkUtils.get_children(agent_data)
            instructions = agent_data.get("instructions", "")
            
            # Determine node type
            node_type = "agent"
            if agent_name not in agent_definition:
                node_type = "undefined_agent"  # For down_chain references without definitions
            
            node = {
                "id": agent_name,
                "type": node_type,
                "data": {
                    "label": agent_name,
                    "depth": depth_map.get(agent_name, 0),
                    "parent": parent_map.get(agent_name),
                    "children": down_chains,
                    "instructions": instructions,
                    "dropdown_tools": [],
                    "sub_networks": [],
                    "network_name": network_name,
                    "is_defined": agent_name in agent_definition
                },
                "position": positions.get(agent_name, {"x": 100, "y": 100})
            }
            nodes.append(node)
        
        # Step 5: Create edges
        for agent_name, agent_data in agent_definition.items():
            down_chains = NsGrpcNetworkUtils.get_children(agent_data)
            for target in down_chains:
                edge = {
                    "id": f"{agent_name}-{target}",
                    "source": agent_name,
                    "target": target,
                    "animated": False,
                    "type": "default"
                }
                edges.append(edge)

        # Summary stats & components
        components = NsGrpcNetworkUtils._find_connected_components(all_agent_names, parent_map)
        total_agents = len(all_agent_names)
        defined_agents = len(agent_definition)
        undefined_agents = total_agents - defined_agents
        
        return {
            "nodes": nodes,
            "edges": edges,
            "network_name": network_name,
            "connected_components": len(components),
            "total_agents": total_agents,
            "defined_agents": defined_agents,
            "undefined_agents": undefined_agents,
        }
    
    @staticmethod
    def get_children(data: Dict[str, Any]) -> List[str]:
        return list(data.get("tools") or data.get("down_chains") or [])
    
    @staticmethod
    def _calculate_positions(agent_names: set, depth_map: Dict[str, int], parent_map: Dict[str, str]) -> Dict[str, Dict[str, int]]:
        """
        Calculate optimal positions for nodes to create a nice layout.
        Handles disconnected components and orphaned nodes.
        """
        positions = {}
        
        # Group nodes by depth
        depth_groups = {}
        for agent_name in agent_names:
            depth = depth_map.get(agent_name, 0)
            if depth not in depth_groups:
                depth_groups[depth] = []
            depth_groups[depth].append(agent_name)
        
        # Layout constants
        horizontal_spacing = 200
        vertical_spacing = 150
        component_spacing = 300  # Extra spacing between disconnected components
        
        # Find connected components
        components = NsGrpcNetworkUtils._find_connected_components(agent_names, parent_map)
        
        current_x_offset = 0
        
        for component_idx, component in enumerate(components):
            # Get the depth range for this component
            component_depths = {depth_map.get(node, 0) for node in component}
            max_depth = max(component_depths) if component_depths else 0
            
            # Position nodes in this component
            for depth in range(max_depth + 1):
                nodes_at_depth = [node for node in component if depth_map.get(node, 0) == depth]
                nodes_at_depth.sort()  # Consistent ordering
                
                for i, node in enumerate(nodes_at_depth):
                    x = current_x_offset + (i * horizontal_spacing)
                    y = depth * vertical_spacing
                    positions[node] = {"x": x, "y": y}
            
            # Calculate width of this component for next component offset
            if component:
                component_width = max(len([n for n in component if depth_map.get(n, 0) == d]) 
                                    for d in range(max_depth + 1)) * horizontal_spacing
                current_x_offset += component_width + component_spacing
        
        return positions
    
    @staticmethod
    def _find_connected_components(agent_names: set, parent_map: Dict[str, str]) -> List[List[str]]:
        """
        Find connected components in the agent network.
        """
        # Build adjacency list (bidirectional)
        adjacency = {name: set() for name in agent_names}
        for child, parent in parent_map.items():
            if parent in adjacency and child in adjacency:
                adjacency[parent].add(child)
                adjacency[child].add(parent)
        
        visited = set()
        components = []
        
        for node in agent_names:
            if node not in visited:
                # DFS to find all connected nodes
                component = []
                stack = [node]
                
                while stack:
                    current = stack.pop()
                    if current not in visited:
                        visited.add(current)
                        component.append(current)
                        stack.extend(adjacency[current] - visited)
                
                components.append(component)
        
        return components
