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

from pydantic import BaseModel, Field, field_validator
from typing import Dict, List, Optional, Any, Union
from enum import Enum


# Extended models for comprehensive editor functionality

class TemplateType(str, Enum):
    """Available network template types"""
    SINGLE_AGENT = "single_agent"
    HIERARCHICAL = "hierarchical"
    SEQUENTIAL = "sequential"


class NetworkTemplate(BaseModel):
    """Template configuration for creating new networks"""
    type: TemplateType = Field(default=TemplateType.SINGLE_AGENT, description="Template type")
    name: Optional[str] = Field(None, description="Network name (will be auto-generated if not provided)")
    
    # Template-specific parameters
    levels: Optional[int] = Field(None, description="Number of levels for hierarchical template (min: 2)")
    agents_per_level: Optional[List[int]] = Field(None, description="Agents per level for hierarchical (first level always 1)")
    sequence_length: Optional[int] = Field(None, description="Length for sequential template (min: 2)")
    agent_name: Optional[str] = Field(None, description="Agent name for single agent template")
    
    @field_validator('levels')
    def validate_levels(cls, v, info):
        # Only validate levels for hierarchical templates
        template_type = info.data.get('type')
        if template_type == TemplateType.HIERARCHICAL and v is not None and v < 2:
            raise ValueError("Hierarchical template must have at least 2 levels")
        return v
    
    @field_validator('sequence_length')
    def validate_sequence_length(cls, v, info):
        # Only validate sequence_length for sequential templates
        template_type = info.data.get('type')
        if template_type == TemplateType.SEQUENTIAL and v is not None and v < 2:
            raise ValueError("Sequential template must have at least 2 agents")
        return v
    
    @field_validator('agents_per_level')
    def validate_agents_per_level(cls, v, info):
        # Only validate agents_per_level for hierarchical templates
        template_type = info.data.get('type')
        if template_type == TemplateType.HIERARCHICAL and v is not None:
            if len(v) == 0:
                raise ValueError("agents_per_level cannot be empty")
            # Auto-correct: first level should always have 1 agent (frontman)
            if v[0] != 1:
                v[0] = 1
            # Ensure all levels have at least 1 agent
            for i in range(len(v)):
                if v[i] < 1:
                    v[i] = 1
        return v
    
    @field_validator('name')
    def validate_name(cls, v):
        if v is not None:
            v = v.strip()
            if v == "string" or v == "":
                return None  # Will be auto-generated
            # Basic name validation
            import re
            if not re.match(r'^[a-zA-Z0-9_\-]+$', v):
                raise ValueError("Network name must contain only alphanumeric characters, underscores, and hyphens")
        return v
    
    def get_corrected_parameters(self) -> Dict[str, Any]:
        """Get template parameters with corrections applied"""
        params = {}
        
        if self.type == TemplateType.SINGLE_AGENT:
            params["agent_name"] = self.agent_name or "frontman"
            
        elif self.type == TemplateType.HIERARCHICAL:
            params["levels"] = self.levels or 2
            if self.agents_per_level:
                # Ensure we have the right number of levels
                agents_per_level = list(self.agents_per_level)
                while len(agents_per_level) < params["levels"]:
                    agents_per_level.append(2)  # Default 2 agents per additional level
                agents_per_level = agents_per_level[:params["levels"]]  # Trim if too many
                params["agents_per_level"] = agents_per_level
            else:
                params["agents_per_level"] = [1] + [2] * (params["levels"] - 1)
                
        elif self.type == TemplateType.SEQUENTIAL:
            params["sequence_length"] = self.sequence_length or 3
            
        return params


class EditorState(BaseModel):
    """Complete editor state structure"""
    design_id: str = Field(..., description="Unique identifier for this design session")
    network_name: str = Field(..., description="Network name")
    meta: Dict[str, Any] = Field(..., description="Metadata")
    top_level: Dict[str, Any] = Field(..., description="Top-level configuration")
    agents: Dict[str, Dict[str, Any]] = Field(..., description="Agent definitions")
    
    class Config:
        extra = "allow"


class ValidationResult(BaseModel):
    """Network validation result"""
    valid: bool = Field(..., description="Whether network is valid")
    warnings: List[str] = Field(default_factory=list, description="Validation warnings")
    errors: List[str] = Field(default_factory=list, description="Validation errors")


class NetworkInfo(BaseModel):
    """Network information summary"""
    design_id: str = Field(..., description="Design ID")
    network_name: str = Field(..., description="Network name")
    original_network_name: Optional[str] = Field(None, description="Original network name if loaded from registry")
    source: str = Field(..., description="Source: new, registry, copilot")
    agent_count: int = Field(..., description="Number of agents")
    created_at: Optional[str] = Field(None, description="Creation timestamp")
    updated_at: Optional[str] = Field(None, description="Last update timestamp")
    can_undo: bool = Field(default=False, description="Whether undo is available")
    can_redo: bool = Field(default=False, description="Whether redo is available")
    validation: Optional[ValidationResult] = Field(None, description="Validation status")


class NetworksList(BaseModel):
    """List of all available networks"""
    registry_networks: List[str] = Field(..., description="Networks available in registry")
    editing_sessions: List[NetworkInfo] = Field(..., description="Current editing sessions")
    total_registry: int = Field(..., description="Total registry networks")
    total_sessions: int = Field(..., description="Total editing sessions")


class LLMConfig(BaseModel):
    """Model for LLM configuration - flexible structure for any LLM provider"""
    # Common LLM parameters
    model_name: Optional[str] = Field(None, description="Model name", examples=["gpt-4o", "claude-3-sonnet", "gpt-4o-mini"])
    class_: Optional[str] = Field(None, alias="class", description="LLM class type", examples=["OpenAILLM", "AnthropicLLM"])
    
    # Advanced parameters
    temperature: Optional[float] = Field(None, ge=0.0, le=2.0, description="Temperature setting (0.0-2.0)", examples=[0.7, 0.5, 1.0])
    max_tokens: Optional[int] = Field(None, gt=0, description="Maximum tokens to generate", examples=[2000, 4000, 1000])
    api_key: Optional[str] = Field(None, description="API key", examples=["sk-..."])
    api_base: Optional[str] = Field(None, description="API base URL", examples=["https://api.openai.com/v1"])
    top_p: Optional[float] = Field(None, ge=0.0, le=1.0, description="Top-p sampling (0.0-1.0)", examples=[0.9, 0.8, 1.0])
    reasoning: Optional[bool] = Field(None, description="Controls the reasoning/thinking mode for supported models. If None (Default), The model will use its default reasoning behavior.", examples=[True, False])
    
    # Allow any additional custom fields for flexibility
    class Config:
        extra = "allow"
        allow_population_by_field_name = True


class BaseAgentProperties(BaseModel):
    """Base class containing all common agent properties"""
    # Core agent properties
    instructions: Optional[str] = Field(None, description="Agent instructions", examples=["You are a helpful assistant", "Analyze the data and provide insights"])
    function: Optional[Dict[str, Any]] = Field(None, description="Agent function definition", examples=[{"description": "Get weather info", "parameters": {"type": "object"}}])
    class_: Optional[str] = Field(None, alias="class", description="Coded tool class (makes this a coded tool agent)", examples=["WeatherTool", "DataAnalyzer"])
    command: Optional[str] = Field(None, description="Agent command template", examples=["python analyze.py {input}", "curl -X GET {url}"])
    tools: Optional[List[str]] = Field(None, description="List of downstream agent names", examples=[["agent1", "agent2"], ["data_processor"]])
    toolbox: Optional[str] = Field(None, description="Toolbox reference (makes this a toolbox agent)", examples=["data_analysis_toolbox", "web_scraping_toolbox"])
    args: Optional[Dict[str, Any]] = Field(None, description="Agent arguments", examples=[{"timeout": 30, "retries": 3}])
    allow: Optional[Dict[str, Any]] = Field(None, description="Allow configuration", examples=[{"tools": ["web_search"], "functions": ["get_weather"]}])
    display_as: Optional[str] = Field(None, description="Display name", examples=["Data Analyst", "Weather Assistant"])
    max_message_history: Optional[int] = Field(None, description="Maximum message history", examples=[10, 50, 100])
    verbose: Optional[bool] = Field(None, description="Verbose mode", examples=[True, False])
    
    # LLM configuration - optional, only shown when needed
    llm_config: Optional[Union[LLMConfig, Dict[str, Any]]] = Field(
        default=None, 
        description="LLM configuration (optional - only specify if you need custom LLM settings)",
        examples=[
            {"model_name": "gpt-4o", "temperature": 0.7},
            {"model_name": "claude-3-sonnet", "max_tokens": 4000}
        ]
    )
    
    class Config:
        extra = "allow"
        allow_population_by_field_name = True


class AgentCreateRequest(BaseAgentProperties):
    """Request to create a new agent"""
    # Required field
    name: str = Field(..., description="Agent name", examples=["data_analyst", "weather_assistant", "frontman"])
    
    # Optional parent relationship
    parent_name: Optional[str] = Field(None, description="Parent agent name", examples=["frontman", "coordinator"])
    
    # Legacy fields for backward compatibility
    agent_data: Optional[Dict[str, Any]] = Field(None, description="Legacy agent configuration")
    template: Optional[str] = Field(None, description="Template to base agent on", examples=["basic_agent", "data_processor"])
    
    @field_validator('name')
    def validate_name(cls, v):
        if not v or not v.strip():
            raise ValueError("Agent name cannot be empty")
        return v.strip()
    
    def infer_agent_type(self) -> str:
        """Infer agent type based on provided fields"""
        # Get the model dump to check the actual values
        model_data = self.model_dump()
        class_value = model_data.get('class_')
        
        if class_value:
            return "coded_tool"
        elif self.toolbox:
            return "toolbox"
        else:
            return "conversational"
    
    def to_agent_data_dict(self) -> Dict[str, Any]:
        """Convert to agent data dictionary, filtering out None values and handling LLMConfig"""
        agent_data = {}
        
        # Add all non-None fields (excluding name and parent_name which are handled separately)
        exclude_fields = {"name", "parent_name", "agent_data", "agent_type", "template", "llm_config"}
        for field_name, field_value in self.dict(exclude_none=True, by_alias=True).items():
            if field_name not in exclude_fields and field_value is not None:
                agent_data[field_name] = field_value
        
        # Handle LLM config specially - convert LLMConfig to dict and filter None values
        if self.llm_config is not None:
            if isinstance(self.llm_config, LLMConfig):
                # Convert LLMConfig to dict, excluding None values
                llm_dict = self.llm_config.dict(exclude_none=True, by_alias=True)
                if llm_dict:  # Only add if there are actual values
                    agent_data["llm_config"] = llm_dict
            elif isinstance(self.llm_config, dict):
                # Filter None values from dict
                llm_dict = {k: v for k, v in self.llm_config.items() if v is not None}
                if llm_dict:  # Only add if there are actual values
                    agent_data["llm_config"] = llm_dict
        
        # Add inferred agent_type and template if provided
        agent_data["agent_type"] = self.infer_agent_type()
        if self.template:
            agent_data["template"] = self.template
        
        # Merge with legacy agent_data field if provided
        if self.agent_data:
            agent_data.update(self.agent_data)
        
        return agent_data


class AgentUpdateRequest(BaseAgentProperties):
    """Request to update an agent"""
    # Optional name field for updates
    name: Optional[str] = Field(None, description="Agent name")
    
    # Legacy field for backward compatibility
    updates: Optional[Dict[str, Any]] = Field(None, description="Legacy updates field")
    
    def to_updates_dict(self) -> Dict[str, Any]:
        """Convert to updates dictionary, filtering out None values and handling LLMConfig"""
        updates = {}
        
        # Add all non-None fields (excluding llm_config which is handled specially)
        exclude_fields = {"updates", "llm_config"}
        for field_name, field_value in self.dict(exclude_none=True, by_alias=True).items():
            if field_name not in exclude_fields and field_value is not None:
                updates[field_name] = field_value
        
        # Handle LLM config specially - convert LLMConfig to dict and filter None values
        if self.llm_config is not None:
            if isinstance(self.llm_config, LLMConfig):
                # Convert LLMConfig to dict, excluding None values
                llm_dict = self.llm_config.dict(exclude_none=True, by_alias=True)
                if llm_dict:  # Only add if there are actual values
                    updates["llm_config"] = llm_dict
            elif isinstance(self.llm_config, dict):
                # Filter None values from dict
                llm_dict = {k: v for k, v in self.llm_config.items() if v is not None}
                if llm_dict:  # Only add if there are actual values
                    updates["llm_config"] = llm_dict
        
        # Merge with legacy updates field if provided
        if self.updates:
            updates.update(self.updates)
        
        return updates


class AgentDuplicateRequest(BaseModel):
    """Request to duplicate an agent"""
    new_name: str = Field(..., description="Name for the duplicated agent")
    
    @field_validator('new_name')
    def validate_new_name(cls, v):
        if not v or not v.strip():
            raise ValueError("New agent name cannot be empty")
        return v.strip()


class EdgeRequest(BaseModel):
    """Request to add/remove edges between agents"""
    source_agent: str = Field(..., description="Source agent name")
    target_agent: str = Field(..., description="Target agent name")


class NetworkExportRequest(BaseModel):
    """Request to export network to HOCON"""
    output_path: Optional[str] = Field(None, description="Output file path (auto-generated if not provided)")
    validate_before_export: bool = Field(default=True, description="Validate before export")
    
    @field_validator('output_path')
    def validate_output_path(cls, v):
        if v is not None:
            v = v.strip()
            # Treat "string" as invalid default value (common in API docs)
            if v == "string" or v == "":
                return None  # Will be auto-generated
        return v


class UndoRedoResponse(BaseModel):
    """Response for undo/redo operations"""
    success: bool = Field(..., description="Whether operation succeeded")
    can_undo: bool = Field(..., description="Whether undo is still available")
    can_redo: bool = Field(..., description="Whether redo is still available")
    message: str = Field(..., description="Result message")


# NetworkConnectivity is used by legacy endpoints
class NetworkConnectivity(BaseModel):
    """Model for network connectivity information"""
    nodes: List[Dict[str, Any]] = Field(..., description="Network nodes")
    edges: List[Dict[str, Any]] = Field(..., description="Network edges")
    agent_details: Dict[str, Any] = Field(..., description="Agent details")


# State Dictionary Models
class StateConnectivityResponse(BaseModel):
    """Model for state-based connectivity response"""
    nodes: List[Dict[str, Any]] = Field(..., description="Network nodes from state")
    edges: List[Dict[str, Any]] = Field(..., description="Network edges from state")
    network_name: str = Field(..., description="Network name")
    connected_components: int = Field(..., description="Number of connected components")
    total_agents: int = Field(..., description="Total number of agents")
    defined_agents: int = Field(..., description="Number of defined agents")
    undefined_agents: int = Field(..., description="Number of undefined agents (referenced but not defined)")


class NetworkStateInfo(BaseModel):
    """Model for network state information"""
    name: str = Field(..., description="Network name")
    last_updated: Optional[str] = Field(None, description="Last update timestamp")
    source: Optional[str] = Field(None, description="Source of the state update")
    has_state: bool = Field(..., description="Whether network has current state")
    agent_count: Optional[int] = Field(None, description="Number of agents in network")
    agents: Optional[List[str]] = Field(None, description="List of agent names")


class CommonDefs(BaseModel):
    """Model for common definitions in HOCON"""
    replacement_strings: Optional[Dict[str, str]] = Field(None, description="String replacements", examples=[{"API_URL": "https://api.example.com"}])
    replacement_values: Optional[Dict[str, Any]] = Field(None, description="Value replacements", examples=[{"MAX_RETRIES": 3, "TIMEOUT": 30.0}])
    
    class Config:
        extra = "allow"


class NetworkMetadata(BaseModel):
    """Model for network metadata"""
    description: Optional[str] = Field(None, description="Network description", examples=["Customer service agent network", "Data processing pipeline"])
    tags: Optional[List[str]] = Field(None, description="Network tags", examples=[["production", "customer-facing"], ["data", "analytics"]])
    
    class Config:
        extra = "allow"


class TopLevelConfig(BaseModel):
    """Model for top-level network configuration"""
    # Common definitions
    commondefs: Optional[CommonDefs] = Field(None, description="Common definitions for string/value replacements")
    
    # Include statements
    includes: Optional[List[str]] = Field(None, description="List of HOCON files to include", examples=[["aaosa.conf", "aaosa_basic.conf"]])
    
    # File references
    llm_info_file: Optional[str] = Field(None, description="Path to LLM info file", examples=["configs/llm_info.json"])
    toolbox_info_file: Optional[str] = Field(None, description="Path to toolbox info file", examples=["configs/toolbox_info.json"])
    
    # LLM configuration
    llm_config: Optional[Union[LLMConfig, Dict[str, Any]]] = Field(None, description="Top-level LLM configuration")
    
    # Execution parameters
    verbose: Optional[bool] = Field(None, description="Enable verbose logging", examples=[True, False])
    max_iterations: Optional[int] = Field(None, gt=0, description="Maximum iterations", examples=[100, 50, 200])
    max_execution_seconds: Optional[int] = Field(None, gt=0, description="Maximum execution time in seconds", examples=[300, 600, 1800])
    
    # Error handling
    error_formatter: Optional[str] = Field(None, description="Error formatter class", examples=["DefaultErrorFormatter", "CustomErrorFormatter"])
    error_fragments: Optional[Dict[str, Any]] = Field(None, description="Error fragment configuration")
    
    # Metadata
    metadata: Optional[NetworkMetadata] = Field(None, description="Network metadata")
    
    class Config:
        extra = "allow"


class TopLevelConfigUpdateRequest(BaseModel):
    """Request to update top-level configuration"""
    # Allow partial updates of any top-level field
    commondefs: Optional[CommonDefs] = Field(None, description="Update common definitions")
    includes: Optional[List[str]] = Field(None, description="Update include statements")
    llm_info_file: Optional[str] = Field(None, description="Update LLM info file path")
    toolbox_info_file: Optional[str] = Field(None, description="Update toolbox info file path")
    llm_config: Optional[Union[LLMConfig, Dict[str, Any]]] = Field(None, description="Update LLM configuration")
    verbose: Optional[bool] = Field(None, description="Update verbose setting")
    max_iterations: Optional[int] = Field(None, gt=0, description="Update max iterations")
    max_execution_seconds: Optional[int] = Field(None, gt=0, description="Update max execution seconds")
    error_formatter: Optional[str] = Field(None, description="Update error formatter")
    error_fragments: Optional[Dict[str, Any]] = Field(None, description="Update error fragments")
    metadata: Optional[NetworkMetadata] = Field(None, description="Update metadata")
    
    def to_updates_dict(self) -> Dict[str, Any]:
        """Convert to updates dictionary, filtering out None values and handling nested objects"""
        updates = {}
        
        # Get all non-None fields
        for field_name, field_value in self.model_dump(exclude_none=True).items():
            if field_value is not None:
                # Handle LLM config specially
                if field_name == "llm_config":
                    if isinstance(field_value, LLMConfig):
                        llm_dict = field_value.model_dump(exclude_none=True, by_alias=True)
                        if llm_dict:
                            updates[field_name] = llm_dict
                    elif isinstance(field_value, dict):
                        llm_dict = {k: v for k, v in field_value.items() if v is not None}
                        if llm_dict:
                            updates[field_name] = llm_dict
                # Handle CommonDefs specially
                elif field_name == "commondefs" and isinstance(field_value, CommonDefs):
                    commondefs_dict = field_value.model_dump(exclude_none=True)
                    if commondefs_dict:
                        updates[field_name] = commondefs_dict
                # Handle NetworkMetadata specially
                elif field_name == "metadata" and isinstance(field_value, NetworkMetadata):
                    metadata_dict = field_value.model_dump(exclude_none=True)
                    if metadata_dict:
                        updates[field_name] = metadata_dict
                else:
                    updates[field_name] = field_value
        
        return updates
    
    class Config:
        extra = "allow"
