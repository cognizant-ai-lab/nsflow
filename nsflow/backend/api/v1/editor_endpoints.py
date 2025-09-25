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

import logging
from fastapi import APIRouter, HTTPException

from nsflow.backend.models.editor_models import (
    NetworkConnectivity,
    StateConnectivityResponse, NetworkStateInfo
)
from nsflow.backend.utils.agentutils.agent_network_utils import AgentNetworkUtils
from nsflow.backend.utils.agentutils.ns_grpc_network_utils import NsGrpcNetworkUtils
from nsflow.backend.utils.editor.state_registry import StateRegistry

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/andeditor")

# Initialize components
agent_utils = AgentNetworkUtils()


@router.get("/list")
async def list_networks():
    """List all available agent networks (same as /api/v1/networks)"""
    try:
        result = agent_utils.list_available_networks()
        return result
    except Exception as e:
        logger.error(f"Error listing networks: {e}")
        raise HTTPException(status_code=500, detail="Error listing networks")


@router.get("/connectivity/{network_name}")
async def get_connectivity(network_name: str):
    """Get connectivity information for a network (similar to existing endpoint)"""
    try:
        result = agent_utils.parse_agent_network(network_name)
        return NetworkConnectivity(
            nodes=result["nodes"],
            edges=result["edges"],
            agent_details=result["agent_details"]
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting connectivity: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting connectivity: {str(e)}")




@router.get("/state/networks")
async def get_state_networks():
    """Get all networks that have current state"""
    try:
        # Get all networks across all state managers in the registry
        all_networks = set()
        networks_info = []
        
        for network_name in StateRegistry.list_networks():
            # Get the primary (most recent) state manager for this network
            state_manager = StateRegistry.get_primary_manager_for_network(network_name)
            
            if state_manager:
                # Check all states in this manager
                network_states = state_manager.get_all_network_states()
                
                for state_network_name, network_state in network_states.items():
                    if state_network_name not in all_networks:
                        all_networks.add(state_network_name)
                        
                        state_dict = network_state.get("state", {})
                        agent_def = state_dict.get("agent_network_definition", {})
                        
                        info = NetworkStateInfo(
                            name=state_network_name,
                            last_updated=network_state.get("last_updated"),
                            source=network_state.get("source"),
                            has_state=bool(state_dict),
                            agent_count=len(agent_def) if agent_def else None,
                            agents=list(agent_def.keys()) if agent_def else None
                        )
                        networks_info.append(info)
        
        return {"networks": networks_info}
    except Exception as e:
        logger.error(f"Error getting state networks: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting state networks: {str(e)}")


@router.get("/state/networks/{network_name}")
async def get_network_state(network_name: str):
    """Get current state for a specific network"""
    try:
        # Get the primary state manager for this network
        state_manager = StateRegistry.get_primary_manager_for_network(network_name)
        
        if not state_manager:
            # Try to get state from HOCON file
            global_manager = StateRegistry.get_global_manager()
            network_state = global_manager.get_state_from_hocon(network_name)
            
            if network_state:
                return {
                    "network_name": network_name,
                    "state": network_state.get("state", {}),
                    "last_updated": network_state.get("last_updated"),
                    "source": network_state.get("source", "hocon_file")
                }
            else:
                raise HTTPException(status_code=404, detail=f"No state found for network '{network_name}'")
        
        network_state = state_manager.get_network_state(network_name)
        
        if not network_state:
            raise HTTPException(status_code=404, detail=f"No state found for network '{network_name}'")
        
        return {
            "network_name": network_name,
            "state": network_state.get("state", {}),
            "last_updated": network_state.get("last_updated"),
            "source": network_state.get("source")
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting network state: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting network state: {str(e)}")


@router.get("/state/connectivity/{network_name}")
async def get_network_state_connectivity(network_name: str):
    """Get connectivity for a network from current state (if available)"""
    try:
        # Get the primary state manager for this network
        state_manager = StateRegistry.get_primary_manager_for_network(network_name)
        
        network_state = None
        if state_manager:
            network_state = state_manager.get_network_state(network_name)
        
        # If no state in memory, try to load from HOCON file
        if not network_state:
            global_manager = StateRegistry.get_global_manager()
            hocon_state = global_manager.get_state_from_hocon(network_name)
            if hocon_state:
                network_state = hocon_state
        
        if not network_state:
            raise HTTPException(status_code=404, detail=f"No state found for network '{network_name}'")
        
        state_dict = network_state.get("state", network_state)  # Handle both formats
        if not state_dict:
            raise HTTPException(status_code=404, detail=f"No state data found for network '{network_name}'")
        
        # Use the partial build method to create nodes and edges
        result = NsGrpcNetworkUtils.partial_build_nodes_and_edges(state_dict)
        
        # Calculate additional metrics
        nodes = result["nodes"]
        edges = result["edges"]
        
        # Count defined vs undefined agents
        defined_agents = len([node for node in nodes if node.get("data", {}).get("is_defined", False)])
        undefined_agents = len(nodes) - defined_agents
        
        # Find connected components
        parent_map = {}
        for node in nodes:
            node_data = node.get("data", {})
            parent = node_data.get("parent")
            if parent:
                parent_map[node["id"]] = parent
        
        connected_components = len(NsGrpcNetworkUtils._find_connected_components(
            {node["id"] for node in nodes},
            parent_map
        ))
        
        return StateConnectivityResponse(
            nodes=nodes,
            edges=edges,
            network_name=network_name,
            connected_components=connected_components,
            total_agents=len(nodes),
            defined_agents=defined_agents,
            undefined_agents=undefined_agents
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting network state connectivity: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting network state connectivity: {str(e)}")
