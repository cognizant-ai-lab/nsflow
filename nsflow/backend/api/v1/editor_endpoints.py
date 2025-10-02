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
import os
import aiofiles
from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Optional, Any

from nsflow.backend.models.editor_models import NetworkTemplate
from nsflow.backend.models.editor_models import TemplateType
from nsflow.backend.models.editor_models import EditorState
from nsflow.backend.models.editor_models import ValidationResult
from nsflow.backend.models.editor_models import NetworkInfo
from nsflow.backend.models.editor_models import NetworksList
from nsflow.backend.models.editor_models import AgentCreateRequest
from nsflow.backend.models.editor_models import AgentUpdateRequest
from nsflow.backend.models.editor_models import AgentDuplicateRequest
from nsflow.backend.models.editor_models import BaseAgentProperties
from nsflow.backend.models.editor_models import EdgeRequest
from nsflow.backend.models.editor_models import NetworkExportRequest
from nsflow.backend.models.editor_models import UndoRedoResponse
from nsflow.backend.models.editor_models import NetworkConnectivity
from nsflow.backend.models.editor_models import StateConnectivityResponse
from nsflow.backend.models.editor_models import NetworkStateInfo
from nsflow.backend.models.editor_models import TopLevelConfig
from nsflow.backend.models.editor_models import TopLevelConfigUpdateRequest
from nsflow.backend.models.editor_models import ToolboxAgentCreateRequest
from nsflow.backend.models.editor_models import ToolboxInfo

from nsflow.backend.utils.editor.simple_state_registry import get_registry
from nsflow.backend.utils.editor.hocon_reader import IndependentHoconReader
from nsflow.backend.utils.editor.toolbox_service import get_toolbox_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/andeditor")

# Initialize components lazily to avoid blocking during import
hocon_reader = None

def get_hocon_reader():
    """Get HOCON reader instance, creating it lazily"""
    global hocon_reader
    if hocon_reader is None:
        hocon_reader = IndependentHoconReader()
    return hocon_reader

# Registry will be accessed via get_registry() function


# Network-level operations

@router.get("/schemas/base-agent-properties", response_model=Dict[str, Any])
def get_agent_create_schema():
    try:
        return BaseAgentProperties.model_json_schema(by_alias=True)
    except AttributeError:
        return BaseAgentProperties.model_json_schema(by_alias=True)
    

@router.get("/networks", response_model=NetworksList)
async def list_all_networks():
    """List all available networks (registry + editing sessions)"""
    try:
        registry = get_registry()
        result = registry.list_all_networks()
        
        # Convert to response model
        editing_sessions = []
        for session in result["editing_sessions"]:
            editing_sessions.append(NetworkInfo(**session))
        
        return NetworksList(
            registry_networks=result["registry_networks"],
            editing_sessions=editing_sessions,
            total_registry=result["total_registry"],
            total_sessions=result["total_sessions"]
        )
    except Exception as e:
        logger.error(f"Error listing networks: {e}")
        raise HTTPException(status_code=500, detail="Error listing networks")


@router.post("/networks/create")
async def create_network(template: NetworkTemplate):
    """Create a new network from template with intelligent defaults and validation"""
    try:
        # Get corrected template parameters
        template_kwargs = template.get_corrected_parameters()
        
        # Generate network name if not provided or invalid
        network_name = template.name
        if not network_name:
            if template.type == TemplateType.SINGLE_AGENT:
                network_name = "single_agent_network"
            elif template.type == TemplateType.HIERARCHICAL:
                levels = template_kwargs.get("levels", 2)
                network_name = f"hierarchical_{levels}level_network"
            elif template.type == TemplateType.SEQUENTIAL:
                length = template_kwargs.get("sequence_length", 3)
                network_name = f"sequential_{length}agent_network"
        
        registry = get_registry()
        design_id, manager = registry.create_new_network(
            network_name=network_name,
            template_type=template.type.value,
            **template_kwargs
        )
        
        state = manager.get_state()
        validation = manager.validate_network()
        
        # Prepare response with corrections applied
        corrections_applied = []
        
        # Check if we made corrections to the template
        if template.type == TemplateType.HIERARCHICAL and template.agents_per_level:
            original_first_level = template.agents_per_level[0] if template.agents_per_level else None
            corrected_first_level = template_kwargs.get("agents_per_level", [1])[0]
            if original_first_level != corrected_first_level:
                corrections_applied.append(f"First level agents corrected from {original_first_level} to {corrected_first_level} (frontman requirement)")
        
        if not template.name:
            corrections_applied.append(f"Network name auto-generated: '{state['network_name']}'")
        
        response = {
            "success": True,
            "design_id": design_id,
            "network_name": state["network_name"],
            "message": f"Network created successfully from {template.type.value} template",
            "template_type": template.type.value,
            "template_parameters": template_kwargs,
            "validation": validation,
            "agent_count": len(state["agents"])
        }
        
        if corrections_applied:
            response["corrections_applied"] = corrections_applied
            response["message"] += f" (with {len(corrections_applied)} correction(s) applied)"
        
        return response
        
    except ValueError as e:
        # Handle validation errors with helpful messages
        logger.error(f"Validation error creating network: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid template parameters: {str(e)}")
    except Exception as e:
        logger.error(f"Error creating network: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating network: {str(e)}")


@router.post("/networks/load/{network_name}")
async def load_network_from_registry(network_name: str):
    """Load a network from the registry for editing"""
    try:
        registry = get_registry()
        design_id, manager = registry.load_from_registry(network_name)
        
        state = manager.get_state()
        validation = manager.validate_network()
        
        return {
            "success": True,
            "design_id": design_id,
            "network_name": state["network_name"],
            "original_network_name": network_name,
            "message": f"Network '{network_name}' loaded successfully",
            "validation": validation,
            "agent_count": len(state["agents"])
        }
    except Exception as e:
        logger.error(f"Error loading network from registry: {e}")
        raise HTTPException(status_code=500, detail=f"Error loading network: {str(e)}")


@router.get("/networks/{design_id}", response_model=EditorState)
async def get_network_state(design_id: str):
    """Get complete network state"""
    try:
        registry = get_registry()
        manager = registry.get_manager(design_id)
        if not manager:
            raise HTTPException(status_code=404, detail=f"Network with design_id '{design_id}' not found")
        
        state = manager.get_state()
        return EditorState(**state)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting network state: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting network state: {str(e)}")


@router.get("/networks/{design_id}/info")
async def get_network_info(design_id: str):
    """Get network information and metadata"""
    try:
        registry = get_registry()
        info = registry.get_session_info(design_id)
        if not info:
            raise HTTPException(status_code=404, detail=f"Network with design_id '{design_id}' not found")
        
        return info
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting network info: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting network info: {str(e)}")


@router.delete("/networks/{design_id}")
async def delete_network(design_id: str):
    """Delete a network editing session and all associated draft files"""
    try:
        registry = get_registry()
        
        # Delete the session (includes draft cleanup)
        success = registry.delete_session(design_id)
        if not success:
            raise HTTPException(status_code=404, detail=f"Network with design_id '{design_id}' not found")
        
        return {
            "success": True,
            "message": f"Network session '{design_id}' and all associated files deleted successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting network: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting network: {str(e)}")


@router.put("/networks/{design_id}/name")
async def set_network_name(design_id: str, request: Dict[str, str]):
    """Set network name"""
    try:
        registry = get_registry()
        manager = registry.get_manager(design_id)
        if not manager:
            raise HTTPException(status_code=404, detail=f"Network with design_id '{design_id}' not found")
        
        new_name = request.get("name", "").strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Network name cannot be empty")
        
        # Use operation store for versioned operations
        operation_store = registry.get_operation_store(design_id)
        if operation_store:
            operation_store.apply({
                "op": "set_network_name",
                "args": {
                    "name": new_name
                }
            })
        else:
            # Fallback to direct manager call
            success = manager.set_network_name(new_name)
            if not success:
                raise HTTPException(status_code=500, detail="Failed to set network name")
        
        return {
            "success": True,
            "message": f"Network name set to '{new_name}'"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting network name: {e}")
        raise HTTPException(status_code=500, detail=f"Error setting network name: {str(e)}")


@router.get("/networks/{design_id}/config", response_model=TopLevelConfig)
async def get_top_level_config(design_id: str):
    """Get top-level network configuration"""
    try:
        registry = get_registry()
        manager = registry.get_manager(design_id)
        if not manager:
            raise HTTPException(status_code=404, detail=f"Network with design_id '{design_id}' not found")
        
        config = manager.get_top_level_config()
        return TopLevelConfig(**config)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting top-level config: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting top-level config: {str(e)}")


@router.put("/networks/{design_id}/config")
async def update_top_level_config(design_id: str, request: TopLevelConfigUpdateRequest):
    """Update top-level network configuration with undo/redo support"""
    try:
        registry = get_registry()
        manager = registry.get_manager(design_id)
        if not manager:
            raise HTTPException(status_code=404, detail=f"Network with design_id '{design_id}' not found")
        
        # Convert request to updates dictionary
        updates = request.to_updates_dict()
        
        if not updates:
            raise HTTPException(status_code=400, detail="No updates provided")
        
        # Use operation store for versioned operations
        operation_store = registry.get_operation_store(design_id)
        if operation_store:
            operation_store.apply({
                "op": "update_top_level_config",
                "args": {
                    "updates": updates
                }
            })
        else:
            # Fallback to direct manager call
            success = manager.update_top_level_config(updates)
            if not success:
                raise HTTPException(status_code=500, detail="Failed to update top-level config")
        
        return {
            "success": True,
            "message": "Top-level configuration updated successfully",
            "updated_fields": list(updates.keys()),
            "updates": updates
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating top-level config: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating top-level config: {str(e)}")


# Agent-level operations

@router.post("/networks/{design_id}/agents")
async def create_agent(design_id: str, request: AgentCreateRequest):
    """Create a new agent"""
    try:
        registry = get_registry()
        manager = registry.get_manager(design_id)
        if not manager:
            raise HTTPException(status_code=404, detail=f"Network with design_id '{design_id}' not found")
        
        # Convert request to agent data using the new unified method
        agent_data = request.to_agent_data_dict()
        
        # Use operation store for versioned operations
        operation_store = registry.get_operation_store(design_id)
        if operation_store:
            if request.parent_name:
                # Atomic operation: create agent with parent (add_agent + add_edge)
                operation_store.apply({
                    "op": "create_agent_with_parent",
                    "args": {
                        "name": request.name,
                        "parent": request.parent_name,
                        "agent_data": agent_data
                    }
                })
            else:
                # Simple agent creation without parent
                operation_store.apply({
                    "op": "add_agent",
                    "args": {
                        "name": request.name,
                        "parent": None,
                        "agent_data": agent_data
                    }
                })
        else:
            # Fallback to direct manager call
            success = manager.add_agent(
                agent_name=request.name,
                parent_name=request.parent_name,
                agent_data=agent_data
            )
            if not success:
                raise HTTPException(status_code=400, detail=f"Failed to create agent '{request.name}' (may already exist)")
        
        parent_msg = f" with parent '{request.parent_name}'" if request.parent_name else ""
        inferred_type = request.infer_agent_type()
        return {
            "success": True,
            "message": f"Agent '{request.name}' created successfully{parent_msg}",
            "parent_name": request.parent_name,
            "agent_type": inferred_type,
            "agent_properties": agent_data
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating agent: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating agent: {str(e)}")


@router.put("/networks/{design_id}/agents/{agent_name}")
async def update_agent(design_id: str, agent_name: str, request: AgentUpdateRequest):
    """Update an agent with structured fields"""
    try:
        registry = get_registry()
        manager = registry.get_manager(design_id)
        if not manager:
            raise HTTPException(status_code=404, detail=f"Network with design_id '{design_id}' not found")
        
        # Convert request to updates dictionary
        updates = request.to_updates_dict()
        
        if not updates:
            raise HTTPException(status_code=400, detail="No updates provided")
        
        # Use operation store for versioned operations
        operation_store = registry.get_operation_store(design_id)
        if operation_store:
            operation_store.apply({
                "op": "update_agent",
                "args": {
                    "name": agent_name,
                    "updates": updates
                }
            })
        else:
            # Fallback to direct manager call
            success = manager.update_agent(agent_name, updates)
            if not success:
                raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")
        
        return {
            "success": True,
            "message": f"Agent '{agent_name}' updated successfully",
            "updated_fields": list(updates.keys())
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating agent: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating agent: {str(e)}")


@router.post("/networks/{design_id}/agents/{agent_name}/duplicate")
async def duplicate_agent(design_id: str, agent_name: str, request: AgentDuplicateRequest):
    """Duplicate an agent"""
    try:
        registry = get_registry()
        manager = registry.get_manager(design_id)
        if not manager:
            raise HTTPException(status_code=404, detail=f"Network with design_id '{design_id}' not found")
        
        # Use operation store for versioned operations
        operation_store = registry.get_operation_store(design_id)
        if operation_store:
            operation_store.apply({
                "op": "duplicate_agent",
                "args": {
                    "agent_name": agent_name,
                    "new_name": request.new_name
                }
            })
        else:
            # Fallback to direct manager call
            success = manager.duplicate_agent(agent_name, request.new_name)
            if not success:
                raise HTTPException(status_code=400, detail=f"Failed to duplicate agent (source not found or target exists)")
        
        return {
            "success": True,
            "message": f"Agent '{agent_name}' duplicated as '{request.new_name}'"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error duplicating agent: {e}")
        raise HTTPException(status_code=500, detail=f"Error duplicating agent: {str(e)}")


@router.delete("/networks/{design_id}/agents/{agent_name}")
async def delete_agent(design_id: str, agent_name: str):
    """Delete an agent"""
    try:
        registry = get_registry()
        manager = registry.get_manager(design_id)
        if not manager:
            raise HTTPException(status_code=404, detail=f"Network with design_id '{design_id}' not found")
        
        # Use operation store for versioned operations
        operation_store = registry.get_operation_store(design_id)
        if operation_store:
            operation_store.apply({
                "op": "delete_agent",
                "args": {
                    "name": agent_name
                }
            })
        else:
            # Fallback to direct manager call
            success = manager.delete_agent(agent_name)
            if not success:
                raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")
        
        return {
            "success": True,
            "message": f"Agent '{agent_name}' deleted successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting agent: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting agent: {str(e)}")


@router.get("/networks/{design_id}/agents/{agent_name}")
async def get_agent(design_id: str, agent_name: str):
    """Get agent details"""
    try:
        registry = get_registry()
        manager = registry.get_manager(design_id)
        if not manager:
            raise HTTPException(status_code=404, detail=f"Network with design_id '{design_id}' not found")
        
        state = manager.get_state()
        agent = state["agents"].get(agent_name)
        if not agent:
            raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")
        
        return {
            "agent": agent,
            "design_id": design_id,
            "network_name": state["network_name"]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting agent: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting agent: {str(e)}")


# Edge operations

@router.post("/networks/{design_id}/edges")
async def add_edge(design_id: str, request: EdgeRequest):
    """Add edge between agents"""
    try:
        registry = get_registry()
        manager = registry.get_manager(design_id)
        if not manager:
            raise HTTPException(status_code=404, detail=f"Network with design_id '{design_id}' not found")
        
        # Use operation store for versioned operations
        operation_store = registry.get_operation_store(design_id)
        if operation_store:
            operation_store.apply({
                "op": "add_edge",
                "args": {
                    "src": request.source_agent,
                    "dst": request.target_agent
                }
            })
        else:
            # Fallback to direct manager call
            success = manager.add_edge(request.source_agent, request.target_agent)
            if not success:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Failed to add edge (agents not found or would create cycle)"
                )
        
        return {
            "success": True,
            "message": f"Edge added from '{request.source_agent}' to '{request.target_agent}'"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding edge: {e}")
        raise HTTPException(status_code=500, detail=f"Error adding edge: {str(e)}")


@router.delete("/networks/{design_id}/edges")
async def remove_edge(design_id: str, request: EdgeRequest):
    """Remove edge between agents"""
    try:
        registry = get_registry()
        manager = registry.get_manager(design_id)
        if not manager:
            raise HTTPException(status_code=404, detail=f"Network with design_id '{design_id}' not found")
        
        # Use operation store for versioned operations
        operation_store = registry.get_operation_store(design_id)
        if operation_store:
            operation_store.apply({
                "op": "remove_edge",
                "args": {
                    "src": request.source_agent,
                    "dst": request.target_agent
                }
            })
        else:
            # Fallback to direct manager call
            success = manager.remove_edge(request.source_agent, request.target_agent)
            if not success:
                raise HTTPException(status_code=400, detail="Failed to remove edge (agents not found)")
        
        return {
            "success": True,
            "message": f"Edge removed from '{request.source_agent}' to '{request.target_agent}'"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing edge: {e}")
        raise HTTPException(status_code=500, detail=f"Error removing edge: {str(e)}")


# Toolbox operations

@router.get("/toolbox/tools", response_model=ToolboxInfo)
async def get_available_tools(toolbox_info_file: Optional[str] = Query(None, description="Path to toolbox info file")):
    """Get list of available tools from toolbox"""
    try:
        toolbox_service = get_toolbox_service(toolbox_info_file)
        tools_result = toolbox_service.get_available_tools()
        
        if isinstance(tools_result, str):
            # Error message returned
            return ToolboxInfo(tools=None, error=tools_result)
        else:
            # Tools dictionary returned
            return ToolboxInfo(tools=tools_result, error=None)
    except Exception as e:
        logger.error(f"Error getting toolbox tools: {e}")
        error_msg = f"Toolbox is currently not available: {str(e)}"
        return ToolboxInfo(tools=None, error=error_msg)


@router.post("/networks/{design_id}/toolbox-agent")
async def create_toolbox_agent(design_id: str, request: ToolboxAgentCreateRequest):
    """Create a new toolbox agent with undo/redo support"""
    try:
        registry = get_registry()
        manager = registry.get_manager(design_id)
        if not manager:
            raise HTTPException(status_code=404, detail=f"Network with design_id '{design_id}' not found")
        
        # Note: We don't validate tool existence to keep it simple
        # Users can check available tools via GET /toolbox/tools if needed
        
        # Use operation store for versioned operations
        operation_store = registry.get_operation_store(design_id)
        if operation_store:
            if request.parent_name:
                # Atomic operation: create toolbox agent with parent
                operation_store.apply({
                    "op": "create_toolbox_agent_with_parent",
                    "args": {
                        "name": request.name,
                        "toolbox": request.toolbox,
                        "parent": request.parent_name
                    }
                })
            else:
                # Simple toolbox agent creation without parent
                operation_store.apply({
                    "op": "add_toolbox_agent",
                    "args": {
                        "name": request.name,
                        "toolbox": request.toolbox,
                        "parent": None
                    }
                })
        else:
            # Fallback to direct manager call
            agent_data = request.to_agent_data_dict()
            success = manager.add_agent(
                agent_name=request.name,
                parent_name=request.parent_name,
                agent_data=agent_data
            )
            if not success:
                raise HTTPException(status_code=400, detail=f"Failed to create toolbox agent '{request.name}' (may already exist)")
        
        parent_msg = f" with parent '{request.parent_name}'" if request.parent_name else ""
        return {
            "success": True,
            "message": f"Toolbox agent '{request.name}' created successfully{parent_msg}",
            "agent_name": request.name,
            "toolbox": request.toolbox,
            "parent_name": request.parent_name,
            "agent_type": "toolbox"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating toolbox agent: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating toolbox agent: {str(e)}")


@router.delete("/networks/{design_id}/toolbox-agent/{agent_name}")
async def delete_toolbox_agent(design_id: str, agent_name: str):
    """Delete a toolbox agent (same as deleting any agent)"""
    try:
        registry = get_registry()
        manager = registry.get_manager(design_id)
        if not manager:
            raise HTTPException(status_code=404, detail=f"Network with design_id '{design_id}' not found")
        
        # Verify it's a toolbox agent
        state = manager.get_state()
        agent = state["agents"].get(agent_name)
        if not agent:
            raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")
        
        if agent.get("agent_type") != "toolbox":
            raise HTTPException(status_code=400, detail=f"Agent '{agent_name}' is not a toolbox agent")
        
        # Use operation store for versioned operations
        operation_store = registry.get_operation_store(design_id)
        if operation_store:
            operation_store.apply({
                "op": "delete_agent",
                "args": {
                    "name": agent_name
                }
            })
        else:
            # Fallback to direct manager call
            success = manager.delete_agent(agent_name)
            if not success:
                raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")
        
        return {
            "success": True,
            "message": f"Toolbox agent '{agent_name}' deleted successfully",
            "toolbox": agent.get("toolbox")
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting toolbox agent: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting toolbox agent: {str(e)}")


# Connectivity and visualization

@router.get("/networks/{design_id}/connectivity")
async def get_network_connectivity(design_id: str):
    """Get network connectivity for visualization"""
    try:
        registry = get_registry()
        manager = registry.get_manager(design_id)
        if not manager:
            raise HTTPException(status_code=404, detail=f"Network with design_id '{design_id}' not found")
        
        state = manager.get_state()
        
        # Convert to connectivity format similar to existing system
        nodes = []
        edges = []
        agent_details = {}
        
        for agent_name, agent in state["agents"].items():
            # Create node
            children = [child for child in agent.get("tools", []) if child in state["agents"]]
            parent = agent.get("_parent")
            
            nodes.append({
                "id": agent_name,
                "type": "agent",
                "data": {
                    "label": agent_name,
                    "parent": parent,
                    "children": children,
                    "dropdown_tools": [],  # Non-agent tools
                    "sub_networks": []  # External tools
                },
                "position": {"x": 100, "y": 100}
            })
            
            # Create edges for children
            for child in children:
                edges.append({
                    "id": f"{agent_name}-{child}",
                    "source": agent_name,
                    "target": child,
                    "animated": True
                })
            
            # Store agent details
            agent_details[agent_name] = {
                "instructions": agent.get("instructions", ""),
                "command": agent.get("command", ""),
                "class": agent.get("class"),
                "function": agent.get("function"),
                "dropdown_tools": [],
                "sub_networks": []
            }
        
        return {
            "nodes": nodes,
            "edges": edges,
            "agent_details": agent_details,
            "design_id": design_id,
            "network_name": state["network_name"]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting connectivity: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting connectivity: {str(e)}")


# Validation

@router.get("/networks/{design_id}/validate", response_model=ValidationResult)
async def validate_network(design_id: str):
    """Validate network structure"""
    try:
        registry = get_registry()
        manager = registry.get_manager(design_id)
        if not manager:
            raise HTTPException(status_code=404, detail=f"Network with design_id '{design_id}' not found")
        
        validation_result = manager.validate_network()
        return ValidationResult(**validation_result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating network: {e}")
        raise HTTPException(status_code=500, detail=f"Error validating network: {str(e)}")


# Undo/Redo

@router.post("/networks/{design_id}/undo", response_model=UndoRedoResponse)
async def undo_operation(design_id: str):
    """Undo last operation using operation store"""
    try:
        registry = get_registry()
        operation_store = registry.get_operation_store(design_id)
        if not operation_store:
            raise HTTPException(status_code=404, detail=f"Network with design_id '{design_id}' not found")
        
        success = operation_store.undo()
        
        # Get updated undo/redo status
        history = operation_store._read_jsonl(operation_store.hist_file)
        redo_stack = operation_store._read_jsonl(operation_store.redo_file)
        
        return UndoRedoResponse(
            success=success,
            can_undo=len(history) > 0,
            can_redo=len(redo_stack) > 0,
            message="Undo successful" if success else "Nothing to undo"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error undoing operation: {e}")
        raise HTTPException(status_code=500, detail=f"Error undoing operation: {str(e)}")


@router.post("/networks/{design_id}/redo", response_model=UndoRedoResponse)
async def redo_operation(design_id: str):
    """Redo last undone operation using operation store"""
    try:
        registry = get_registry()
        operation_store = registry.get_operation_store(design_id)
        if not operation_store:
            raise HTTPException(status_code=404, detail=f"Network with design_id '{design_id}' not found")
        
        success = operation_store.redo()
        
        # Get updated undo/redo status
        history = operation_store._read_jsonl(operation_store.hist_file)
        redo_stack = operation_store._read_jsonl(operation_store.redo_file)
        
        return UndoRedoResponse(
            success=success,
            can_undo=len(history) > 0,
            can_redo=len(redo_stack) > 0,
            message="Redo successful" if success else "Nothing to redo"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error redoing operation: {e}")
        raise HTTPException(status_code=500, detail=f"Error redoing operation: {str(e)}")


# Export and Save
def determine_export_filename(network_name: str, original_network_name: Optional[str]) -> str:
    """
    Determine the filename for export based on whether this is a new network or edited from registry.
    
    :param network_name: Current network name from state
    :param original_network_name: Original network name if loaded from registry
    :return: Filename without extension
    """
    if original_network_name:
        # This was loaded from registry, use the original name to replace the existing file
        logger.info(f"Network was loaded from registry, using original name: {original_network_name}")
        return original_network_name
    else:
        # This is a new network, use the current network name
        logger.info(f"Network is new, using current name: {network_name}")
        return network_name


@router.post("/networks/{design_id}/export")
async def export_to_hocon(design_id: str, request: NetworkExportRequest):
    """Export network to HOCON file and update manifest.hocon"""
    try:
        registry = get_registry()
        manager = registry.get_manager(design_id)
        if not manager:
            raise HTTPException(status_code=404, detail=f"Network with design_id '{design_id}' not found")
        
        state = manager.get_state()
        network_name = state["network_name"]
        
        # Get original_network_name directly from state (added when loading from registry)
        original_network_name = state.get("original_network_name")
        
        # Validate before export if requested
        if request.validate_before_export:
            validation_result = manager.validate_network()
            if not validation_result["valid"]:
                return {
                    "success": False,
                    "message": "Network validation failed",
                    "validation": validation_result
                }
        
        # Determine output filename based on whether this is new or edited from registry
        output_path = request.output_path
        if not output_path:
            # Auto-determine filename based on new vs edited from registry
            from nsflow.backend.utils.agentutils.agent_network_utils import REGISTRY_DIR
            filename_for_export = determine_export_filename(network_name, original_network_name)
            if filename_for_export.strip() == "":
                filename_for_export = f"network_{design_id[:8]}"
            output_path = os.path.join(REGISTRY_DIR, f"{filename_for_export}.hocon")
            filename_for_manifest = filename_for_export

        # Export to HOCON
        success = registry.export_to_hocon_file(design_id, output_path)

        if success:
            # Add to manifest.hocon (inline code as requested)
            try:
                manifest_path = os.path.join(REGISTRY_DIR, "manifest.hocon")
                manifest_entry = f'"{filename_for_manifest}.hocon" = true'

                try:
                    # Read the current manifest content
                    async with aiofiles.open(manifest_path, "r") as file:
                        manifest_content = await file.read()
                except FileNotFoundError:
                    # Create new manifest if it doesn't exist
                    manifest_content = ""

                # Avoid duplicates
                if f'"{filename_for_manifest}.hocon"' not in manifest_content:
                    # Detect old format (with braces)
                    if "{" in manifest_content and "}" in manifest_content:
                        insert_position = manifest_content.rfind("}")
                        # Insert before the closing brace, with proper indentation/newline
                        updated_content = (
                            manifest_content[:insert_position].rstrip(", \n")
                            + f",\n    {manifest_entry}\n"
                            + manifest_content[insert_position:]
                        )
                    else:
                        # New format (no braces) → just append at the end
                        if manifest_content.strip():
                            updated_content = manifest_content.rstrip("\n") + f"\n{manifest_entry}\n"
                        else:
                            # Empty manifest
                            updated_content = f"{manifest_entry}\n"

                    # Write back updated content
                    async with aiofiles.open(manifest_path, "w") as file:
                        await file.write(updated_content)
                    logger.info("Added to manifest: %s", filename_for_manifest)
                    manifest_message = " and added to manifest.hocon"
                else:
                    manifest_message = " (already in manifest.hocon)"
                    
            except Exception as e:
                logger.warning(f"Failed to update manifest.hocon: {e}")
                manifest_message = " (warning: failed to update manifest.hocon)"
            
            # Determine action message
            if original_network_name:
                action_message = f"Network exported to {output_path} (replaced existing '{original_network_name}.hocon')"
            else:
                action_message = f"Network exported to {output_path} (new file)"
            
            return {
                "success": True,
                "message": action_message + manifest_message,
                "output_path": output_path,
                "filename": filename_for_manifest,
                "action": "replace" if original_network_name else "create",
                "original_name": original_network_name
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to export network")
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting to HOCON: {e}")
        raise HTTPException(status_code=500, detail=f"Error exporting to HOCON: {str(e)}")


@router.post("/networks/{design_id}/save-draft")
async def save_session(design_id: str):
    """Save editing session as draft with operation history"""
    try:
        registry = get_registry()
        operation_store = registry.get_operation_store(design_id)
        
        if not operation_store:
            raise HTTPException(status_code=404, detail=f"Network with design_id '{design_id}' not found")
        
        success = operation_store.save_draft()
        
        if success:
            draft_info = operation_store.get_draft_info()
            return {
                "success": True,
                "message": "Draft saved successfully with operation history",
                "draft_info": {
                    "design_id": draft_info.get("design_id"),
                    "network_name": draft_info.get("network_name"),
                    "operation_count": draft_info.get("operation_count", 0),
                    "last_saved": draft_info.get("last_saved"),
                    "draft_path": draft_info.get("draft_path")
                }
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to save draft")
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving session: {e}")
        raise HTTPException(status_code=500, detail=f"Error saving session: {str(e)}")


@router.post("/networks/{design_id}/load-draft")
async def load_draft_session(design_id: str):
    """Load a draft state into an active editing session"""
    try:
        registry = get_registry()
        
        # Check if already loaded
        if registry.get_manager(design_id):
            return {
                "success": True,
                "message": f"Draft '{design_id}' is already loaded",
                "design_id": design_id
            }
        
        # Load the draft
        loaded_design_id, manager = registry.load_draft_state(design_id)
        
        state = manager.get_state()
        operation_store = registry.get_operation_store(design_id)
        draft_info = operation_store.get_draft_info() if operation_store else {}
        
        return {
            "success": True,
            "message": f"Draft loaded successfully",
            "design_id": loaded_design_id,
            "network_name": state["network_name"],
            "agent_count": len(state["agents"]),
            "operation_count": draft_info.get("operation_count", 0),
            "can_undo": draft_info.get("can_undo", False),
            "can_redo": draft_info.get("can_redo", False)
        }
    except Exception as e:
        logger.error(f"Error loading draft session: {e}")
        raise HTTPException(status_code=500, detail=f"Error loading draft session: {str(e)}")


# Legacy endpoints for backward compatibility

@router.get("/list")
async def list_networks():
    """List all available agent networks (legacy endpoint)"""
    try:
        result = get_hocon_reader().list_available_networks()
        return result
    except Exception as e:
        logger.error(f"Error listing networks: {e}")
        raise HTTPException(status_code=500, detail="Error listing networks")


@router.get("/connectivity/{network_name}")
async def get_connectivity(network_name: str):
    """Get connectivity information for a network (legacy endpoint)"""
    try:
        result = get_hocon_reader().parse_agent_network_for_editor(network_name)
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
    """Get all networks that have current state (legacy endpoint)"""
    try:
        # For backward compatibility, return current editing sessions
        registry = get_registry()
        result = registry.list_all_networks()
        
        networks_info = []
        for session in result["editing_sessions"]:
                        info = NetworkStateInfo(
                name=session["network_name"],
                last_updated=session.get("updated_at"),
                source="editor_session",
                has_state=True,
                agent_count=session["agent_count"],
                agents=None  # Would need to get from state if needed
                        )
                        networks_info.append(info)
        
        return {"networks": networks_info}
    except Exception as e:
        logger.error(f"Error getting state networks: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting state networks: {str(e)}")


@router.get("/state/networks/{network_name}")
async def get_network_state_legacy(network_name: str):
    """Get current state for a specific network (legacy endpoint)"""
    try:
        # Try to find matching editing session
        registry = get_registry()
        managers = registry.get_managers_for_network(network_name)
        
        if managers:
            # Get the most recent one
            manager = registry.get_primary_manager_for_network(network_name)
            state = manager.get_state()
            
            if state:
                return {
                    "network_name": network_name,
                    "state": state,
                    "last_updated": state.get("meta", {}).get("updated_at"),
                    "source": "editor_session"
                }
            else:
                raise HTTPException(status_code=404, detail=f"No state found for network '{network_name}'")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting network state: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting network state: {str(e)}")


@router.get("/state/connectivity/{network_name}")
async def get_network_state_connectivity(network_name: str):
    """Get connectivity for a network from current state (legacy endpoint)"""
    try:
        # Try to find matching editing session
        registry = get_registry()
        manager = registry.get_primary_manager_for_network(network_name)
        
        if not manager:
            raise HTTPException(status_code=404, detail=f"No state found for network '{network_name}'")
        
        state = manager.get_state()
        
        # Build connectivity similar to existing format
        nodes = []
        edges = []
        
        for agent_name, agent in state["agents"].items():
            is_defined = bool(agent.get("instructions") or agent.get("function"))
            parent = agent.get("_parent")
            
            nodes.append({
                "id": agent_name,
                "type": "agent",
                "data": {
                    "label": agent_name,
                    "parent": parent,
                    "is_defined": is_defined
                },
                "position": {"x": 100, "y": 100}
            })
            
            # Create edges for children
            for child in agent.get("tools", []):
                if child in state["agents"]:
                    edges.append({
                        "id": f"{agent_name}-{child}",
                        "source": agent_name,
                        "target": child,
                        "animated": True
                    })
        
        # Calculate metrics
        defined_agents = len([node for node in nodes if node.get("data", {}).get("is_defined", False)])
        undefined_agents = len(nodes) - defined_agents
        
        # Simple connected components calculation
        connected_components = 1  # Simplified for now
        
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


# Utility endpoints

@router.post("/cleanup")
async def cleanup_old_sessions(max_age_days: int = Query(default=7, ge=1, le=30)):
    """Clean up old editing sessions"""
    try:
        # Cleanup not implemented in simplified version
        deleted_count = 0
        return {
            "success": True,
            "message": f"Cleaned up {deleted_count} old sessions",
            "deleted_count": deleted_count
        }
    except Exception as e:
        logger.error(f"Error cleaning up sessions: {e}")
        raise HTTPException(status_code=500, detail=f"Error cleaning up sessions: {str(e)}")


@router.get("/templates")
async def get_available_templates():
    """Get available network templates with validation rules"""
    return {
        "templates": [
            {
                "type": TemplateType.SINGLE_AGENT.value,
                "name": "Single Agent",
                "description": "A simple network with just one agent (frontman)",
                "parameters": ["agent_name"],
                "defaults": {"agent_name": "frontman"},
                "validation_rules": ["agent_name is optional, defaults to 'frontman'"]
            },
            {
                "type": TemplateType.HIERARCHICAL.value,
                "name": "Hierarchical Network", 
                "description": "A hierarchical network with multiple levels",
                "parameters": ["levels", "agents_per_level"],
                "defaults": {"levels": 2, "agents_per_level": [1, 2]},
                "validation_rules": [
                    "levels must be >= 2",
                    "agents_per_level[0] is always 1 (frontman)",
                    "all other levels must have >= 1 agent"
                ]
            },
            {
                "type": TemplateType.SEQUENTIAL.value,
                "name": "Sequential Network",
                "description": "A linear sequence of agents",
                "parameters": ["sequence_length"],
                "defaults": {"sequence_length": 3},
                "validation_rules": ["sequence_length must be >= 2"]
            }
        ],
        "auto_corrections": {
            "network_name": "Auto-generated if not provided or invalid",
            "hierarchical_first_level": "First level always corrected to 1 agent (frontman)",
            "minimum_values": "Parameters below minimum are corrected to minimum valid values"
        }
    }
