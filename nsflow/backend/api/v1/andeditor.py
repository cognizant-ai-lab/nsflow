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

import os
import logging
import json
import shutil
from datetime import datetime
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pyhocon import ConfigFactory, HOCONConverter

from nsflow.backend.models.andeditor_models import (
    LLMConfig, Agent, NetworkTitle, IncludeStatements, CommonDefs,
    CustomVariables, ToolsList, NetworkConnectivity, EditingState,
    NetworkMetadata, AgentSuggestions, OperationResult, NetworkRenameRequest,
    PropertyAddRequest, AgentCreateRequest, NetworkCreateRequest
)
from nsflow.backend.utils.agentutils.agent_network_utils import AgentNetworkUtils

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/andeditor")


class AndEditor:
    """Agent Network Editor utility class"""
    
    def __init__(self):
        self.agent_utils = AgentNetworkUtils()
        self.registry_dir = self.agent_utils.registry_dir
        self.manifest_file = os.path.join(self.registry_dir, "manifest.hocon")
        
        # In-memory editing state
        self.editing_sessions = {}  # network_name -> editing_state
    
    def get_manifest_config(self) -> Dict[str, Any]:
        """Load manifest configuration"""
        if os.path.exists(self.manifest_file):
            return self.agent_utils.load_hocon_config(self.manifest_file)
        return {}
    
    def update_manifest(self, network_name: str, enabled: bool = True):
        """Update manifest.hocon to include/exclude network"""
        try:
            manifest = self.get_manifest_config()
            hocon_filename = f"{network_name}.hocon"
            
            if enabled:
                manifest[hocon_filename] = True
            else:
                manifest.pop(hocon_filename, None)
            
            # Save manifest with header
            header = """# Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
# All Rights Reserved.
# Issued under the Academic Public License.
#
# You can be released from the terms, and requirements of the Academic Public
# License by purchasing a commercial license.
# Purchase of a commercial license is mandatory for any use of the
# neuro-san SDK Software in commercial settings.
#
# END COPYRIGHT
"""
            hocon_content = HOCONConverter.to_hocon(manifest)
            
            with open(self.manifest_file, 'w', encoding='utf-8') as f:
                f.write(header + hocon_content)
                
            logger.info(f"Updated manifest: {network_name} -> {enabled}")
        except Exception as e:
            logger.error(f"Error updating manifest: {e}")
            raise HTTPException(status_code=500, detail=f"Error updating manifest: {str(e)}")
    
    def get_network_config(self, network_name: str) -> Dict[str, Any]:
        """Load network configuration"""
        file_path = self.agent_utils.get_network_file_path(network_name)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"Network '{network_name}' not found")
        
        try:
            return self.agent_utils.load_hocon_config(file_path)
        except Exception as e:
            logger.error(f"Error loading network: {e}")
            raise HTTPException(status_code=500, detail=f"Error loading network: {str(e)}")
    
    def save_network_config(self, network_name: str, config: Dict[str, Any], backup: bool = True):
        """Save network configuration"""
        file_path = self.agent_utils.get_network_file_path(network_name)
        
        # Create backup
        if backup and os.path.exists(file_path):
            backup_path = f"{file_path}.backup.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            shutil.copy2(file_path, backup_path)
        
        try:
            # Convert to HOCON and save
            hocon_content = HOCONConverter.to_hocon(config)
            header = """# Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
# All Rights Reserved.
# Issued under the Academic Public License.
#
# You can be released from the terms, and requirements of the Academic Public
# License by purchasing a commercial license.
# Purchase of a commercial license is mandatory for any use of the
# neuro-san SDK Software in commercial settings.
#
# END COPYRIGHT

"""
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(header + hocon_content)
            
            # Update editing state
            if network_name in self.editing_sessions:
                self.editing_sessions[network_name]["last_saved"] = datetime.now().isoformat()
                self.editing_sessions[network_name]["has_unsaved_changes"] = False
            
            logger.info(f"Saved network: {network_name}")
            return file_path
        except Exception as e:
            logger.error(f"Error saving network: {e}")
            raise HTTPException(status_code=500, detail=f"Error saving network: {str(e)}")
    
    def start_editing_session(self, network_name: str):
        """Start an editing session for a network"""
        self.editing_sessions[network_name] = {
            "is_editing": True,
            "last_modified": datetime.now().isoformat(),
            "has_unsaved_changes": False,
            "started_at": datetime.now().isoformat()
        }
    
    def mark_modified(self, network_name: str):
        """Mark network as modified"""
        if network_name not in self.editing_sessions:
            self.start_editing_session(network_name)
        
        self.editing_sessions[network_name].update({
            "last_modified": datetime.now().isoformat(),
            "has_unsaved_changes": True
        })


# Initialize editor
editor = AndEditor()


@router.get("/list")
async def list_networks():
    """List all available agent networks (same as /api/v1/networks)"""
    try:
        result = editor.agent_utils.list_available_networks()
        
        # Add editing state information
        networks_with_state = []
        for network in result["networks"]:
            editing_state = editor.editing_sessions.get(network, {
                "is_editing": False,
                "has_unsaved_changes": False
            })
            networks_with_state.append({
                "name": network,
                "editing_state": editing_state
            })
        
        return {"networks": networks_with_state}
    except Exception as e:
        logger.error(f"Error listing networks: {e}")
        raise HTTPException(status_code=500, detail="Error listing networks")


@router.get("/connectivity/{network_name}")
async def get_connectivity(network_name: str):
    """Get connectivity information for a network (similar to existing endpoint)"""
    try:
        file_path = editor.agent_utils.get_network_file_path(network_name)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"Network '{network_name}' not found")
        
        result = editor.agent_utils.parse_agent_network(file_path)
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


@router.get("/networks/{network_name}/title")
async def get_network_title(network_name: str):
    """Get network title/name"""
    return NetworkTitle(title=network_name)


@router.put("/networks/{network_name}/title")
async def update_network_title(network_name: str, new_title: NetworkTitle):
    """Rename a network"""
    try:
        if network_name == new_title.title:
            return OperationResult(success=True, message="No change needed")
        
        old_file_path = editor.agent_utils.get_network_file_path(network_name)
        if not os.path.exists(old_file_path):
            raise HTTPException(status_code=404, detail=f"Network '{network_name}' not found")
        
        new_file_path = editor.agent_utils.get_network_file_path(new_title.title)
        if os.path.exists(new_file_path):
            raise HTTPException(status_code=409, detail=f"Network '{new_title.title}' already exists")
        
        # Rename file
        shutil.move(old_file_path, new_file_path)
        
        # Update manifest
        editor.update_manifest(network_name, enabled=False)  # Remove old
        editor.update_manifest(new_title.title, enabled=True)  # Add new
        
        # Update editing session
        if network_name in editor.editing_sessions:
            editor.editing_sessions[new_title.title] = editor.editing_sessions.pop(network_name)
        
        return OperationResult(
            success=True,
            message=f"Network renamed from '{network_name}' to '{new_title.title}'",
            data={"old_name": network_name, "new_name": new_title.title}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error renaming network: {e}")
        raise HTTPException(status_code=500, detail=f"Error renaming network: {str(e)}")


@router.get("/networks/{network_name}/llm_config")
async def get_llm_config(network_name: str):
    """Get top-level LLM configuration"""
    try:
        config = editor.get_network_config(network_name)
        llm_config = config.get("llm_config", {})
        return LLMConfig.parse_obj(llm_config)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting LLM config: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting LLM config: {str(e)}")


@router.put("/networks/{network_name}/llm_config")
async def update_llm_config(network_name: str, llm_config: LLMConfig):
    """Update top-level LLM configuration"""
    try:
        config = editor.get_network_config(network_name)
        config["llm_config"] = llm_config.dict(exclude_unset=True, by_alias=True)
        
        editor.save_network_config(network_name, config)
        editor.mark_modified(network_name)
        
        return OperationResult(success=True, message="LLM config updated")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating LLM config: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating LLM config: {str(e)}")


@router.get("/networks/{network_name}/include")
async def get_include_statements(network_name: str):
    """Get include statements"""
    try:
        config = editor.get_network_config(network_name)
        includes = config.get("include", [])
        if isinstance(includes, str):
            includes = [includes]
        return IncludeStatements(includes=includes)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting includes: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting includes: {str(e)}")


@router.put("/networks/{network_name}/include")
async def update_include_statements(network_name: str, includes: IncludeStatements):
    """Update include statements"""
    try:
        config = editor.get_network_config(network_name)
        if len(includes.includes) == 1:
            config["include"] = includes.includes[0]
        elif len(includes.includes) > 1:
            config["include"] = includes.includes
        else:
            config.pop("include", None)
        
        editor.save_network_config(network_name, config)
        editor.mark_modified(network_name)
        
        return OperationResult(success=True, message="Include statements updated")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating includes: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating includes: {str(e)}")


@router.get("/networks/{network_name}/commondefs")
async def get_common_definitions(network_name: str):
    """Get common definitions"""
    try:
        config = editor.get_network_config(network_name)
        commondefs = config.get("commondefs", {})
        return CommonDefs.parse_obj(commondefs)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting commondefs: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting commondefs: {str(e)}")


@router.put("/networks/{network_name}/commondefs")
async def update_common_definitions(network_name: str, commondefs: CommonDefs):
    """Update common definitions"""
    try:
        config = editor.get_network_config(network_name)
        config["commondefs"] = commondefs.dict(exclude_unset=True)
        
        editor.save_network_config(network_name, config)
        editor.mark_modified(network_name)
        
        return OperationResult(success=True, message="Common definitions updated")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating commondefs: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating commondefs: {str(e)}")


@router.get("/networks/{network_name}/custom_vars")
async def get_custom_variables(network_name: str):
    """Get custom user-defined variables"""
    try:
        config = editor.get_network_config(network_name)
        
        # Extract custom variables (everything that's not a standard key)
        standard_keys = {"include", "llm_config", "commondefs", "tools", "max_iterations", "max_execution_seconds"}
        custom_vars = {k: v for k, v in config.items() if k not in standard_keys}
        
        return CustomVariables(variables=custom_vars)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting custom variables: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting custom variables: {str(e)}")


@router.put("/networks/{network_name}/custom_vars")
async def update_custom_variables(network_name: str, custom_vars: CustomVariables):
    """Update custom user-defined variables"""
    try:
        config = editor.get_network_config(network_name)
        
        # Remove old custom variables
        standard_keys = {"include", "llm_config", "commondefs", "tools", "max_iterations", "max_execution_seconds"}
        config = {k: v for k, v in config.items() if k in standard_keys}
        
        # Add new custom variables
        config.update(custom_vars.variables)
        
        editor.save_network_config(network_name, config)
        editor.mark_modified(network_name)
        
        return OperationResult(success=True, message="Custom variables updated")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating custom variables: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating custom variables: {str(e)}")


@router.get("/networks/{network_name}/tools")
async def get_tools_list(network_name: str):
    """Get list of tools/agents in the network"""
    try:
        config = editor.get_network_config(network_name)
        tools = config.get("tools", [])
        
        # Extract agent names
        agent_names = []
        for tool in tools:
            if isinstance(tool, dict) and "name" in tool:
                agent_names.append(tool["name"])
        
        return ToolsList(tools=agent_names)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting tools list: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting tools list: {str(e)}")


@router.get("/networks/{network_name}/agents/{agent_name}")
async def get_agent_details(network_name: str, agent_name: str):
    """Get detailed information about a specific agent"""
    try:
        config = editor.get_network_config(network_name)
        tools = config.get("tools", [])
        
        # Find the agent
        agent_data = None
        for tool in tools:
            if isinstance(tool, dict) and tool.get("name") == agent_name:
                agent_data = tool
                break
        
        if not agent_data:
            raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")
        
        return Agent.parse_obj(agent_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting agent details: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting agent details: {str(e)}")


@router.put("/networks/{network_name}/agents/{agent_name}")
async def update_agent(network_name: str, agent_name: str, agent: Agent):
    """Update an agent's configuration"""
    try:
        config = editor.get_network_config(network_name)
        tools = config.get("tools", [])
        
        # Find and update the agent
        agent_found = False
        for i, tool in enumerate(tools):
            if isinstance(tool, dict) and tool.get("name") == agent_name:
                tools[i] = agent.dict(exclude_unset=True, by_alias=True)
                agent_found = True
                break
        
        if not agent_found:
            raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")
        
        config["tools"] = tools
        editor.save_network_config(network_name, config)
        editor.mark_modified(network_name)
        
        return OperationResult(success=True, message=f"Agent '{agent_name}' updated")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating agent: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating agent: {str(e)}")


@router.post("/networks/{network_name}/agents")
async def create_agent(network_name: str, request: AgentCreateRequest):
    """Create a new agent in the network"""
    try:
        config = editor.get_network_config(network_name)
        tools = config.get("tools", [])
        
        # Check if agent already exists
        for tool in tools:
            if isinstance(tool, dict) and tool.get("name") == request.name:
                raise HTTPException(status_code=409, detail=f"Agent '{request.name}' already exists")
        
        # Create agent based on type
        if request.agent_type == "conversational":
            new_agent = {
                "name": request.name,
                "function": {"description": f"Agent {request.name}"},
                "instructions": f"You are {request.name}. Help users with their requests."
            }
        else:  # coded_tool
            new_agent = {
                "name": request.name,
                "function": {
                    "description": f"Coded tool {request.name}",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "required": []
                    }
                },
                "class": f"coded_tools.{request.name}.{request.name.title()}"
            }
        
        # Add template properties if specified
        if request.template:
            for tool in tools:
                if isinstance(tool, dict) and tool.get("name") == request.template:
                    template_agent = tool.copy()
                    template_agent["name"] = request.name
                    new_agent = template_agent
                    break
        
        tools.append(new_agent)
        config["tools"] = tools
        
        editor.save_network_config(network_name, config)
        editor.mark_modified(network_name)
        
        return OperationResult(
            success=True,
            message=f"Agent '{request.name}' created",
            data={"agent": new_agent}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating agent: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating agent: {str(e)}")


@router.delete("/networks/{network_name}/agents/{agent_name}")
async def delete_agent(network_name: str, agent_name: str):
    """Delete an agent from the network"""
    try:
        config = editor.get_network_config(network_name)
        tools = config.get("tools", [])
        
        # Find and remove the agent
        original_length = len(tools)
        tools = [tool for tool in tools if not (isinstance(tool, dict) and tool.get("name") == agent_name)]
        
        if len(tools) == original_length:
            raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")
        
        config["tools"] = tools
        editor.save_network_config(network_name, config)
        editor.mark_modified(network_name)
        
        return OperationResult(success=True, message=f"Agent '{agent_name}' deleted")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting agent: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting agent: {str(e)}")


@router.post("/networks")
async def create_network(request: NetworkCreateRequest):
    """Create a new network"""
    try:
        file_path = editor.agent_utils.get_network_file_path(request.name)
        if os.path.exists(file_path):
            raise HTTPException(status_code=409, detail=f"Network '{request.name}' already exists")
        
        # Create config
        if request.template:
            config = editor.get_network_config(request.template)
        else:
            config = {
                "llm_config": {"model_name": "gpt-4"},
                "max_iterations": 1000,
                "max_execution_seconds": 300,
                "tools": []
            }
        
        editor.save_network_config(request.name, config, backup=False)
        
        if request.add_to_manifest:
            editor.update_manifest(request.name, enabled=True)
        
        editor.start_editing_session(request.name)
        
        return OperationResult(
            success=True,
            message=f"Network '{request.name}' created",
            data={"network_name": request.name, "file_path": file_path}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating network: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating network: {str(e)}")


@router.post("/networks/{network_name}/save")
async def save_network(network_name: str):
    """Save network changes"""
    try:
        config = editor.get_network_config(network_name)
        file_path = editor.save_network_config(network_name, config)
        
        return OperationResult(
            success=True,
            message=f"Network '{network_name}' saved",
            data={"file_path": file_path}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving network: {e}")
        raise HTTPException(status_code=500, detail=f"Error saving network: {str(e)}")


@router.get("/suggestions")
async def get_agent_suggestions():
    """Get suggestions for agent properties"""
    return AgentSuggestions(
        common_properties=["name", "function", "instructions", "tools", "llm_config"],
        coded_tool_properties=["name", "function", "class"],
        conversational_agent_properties=["name", "function", "instructions", "tools", "command", "allow"],
        function_schema_template={
            "description": "Function description",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    )
