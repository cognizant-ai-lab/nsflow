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


class BaseAgentProperties(BaseModel):
    """Base class containing all common agent properties"""
    # Core agent properties
    instructions: Optional[str] = Field(None, description="Agent instructions")
    function: Optional[Dict[str, Any]] = Field(None, description="Agent function definition")
    class_: Optional[str] = Field(None, alias="class", description="Coded tool class")
    command: Optional[str] = Field(None, description="Agent command template")
    tools: Optional[List[str]] = Field(None, description="List of downstream agent names")
    toolbox: Optional[str] = Field(None, description="Toolbox reference")
    args: Optional[Dict[str, Any]] = Field(None, description="Agent arguments")
    allow: Optional[Dict[str, Any]] = Field(None, description="Allow configuration")
    display_as: Optional[str] = Field(None, description="Display name")
    max_message_history: Optional[int] = Field(None, description="Maximum message history")
    verbose: Optional[bool] = Field(None, description="Verbose mode")
    llm_config: Optional[Dict[str, Any]] = Field(None, description="LLM configuration")
    
    class Config:
        extra = "allow"
        allow_population_by_field_name = True


class AgentCreateRequest(BaseAgentProperties):
    """Request to create a new agent"""
    # Required field
    name: str = Field(..., description="Agent name")
    
    # Optional parent relationship
    parent_name: Optional[str] = Field(None, description="Parent agent name")
    
    # Legacy fields for backward compatibility
    agent_data: Optional[Dict[str, Any]] = Field(None, description="Legacy agent configuration")
    agent_type: str = Field(default="conversational", description="Type of agent (conversational or coded_tool)")
    template: Optional[str] = Field(None, description="Template to base agent on")
    
    @field_validator('name')
    def validate_name(cls, v):
        if not v or not v.strip():
            raise ValueError("Agent name cannot be empty")
        return v.strip()
    
    @field_validator('agent_type')
    def validate_agent_type(cls, v):
        if v not in ['conversational', 'coded_tool']:
            raise ValueError("Agent type must be 'conversational' or 'coded_tool'")
        return v
    
    def to_agent_data_dict(self) -> Dict[str, Any]:
        """Convert to agent data dictionary, filtering out None values"""
        agent_data = {}
        
        # Add all non-None fields (excluding name and parent_name which are handled separately)
        exclude_fields = {"name", "parent_name", "agent_data", "agent_type", "template"}
        for field_name, field_value in self.dict(exclude_none=True, by_alias=True).items():
            if field_name not in exclude_fields and field_value is not None:
                agent_data[field_name] = field_value
        
        # Add agent_type and template if provided
        if self.agent_type:
            agent_data["agent_type"] = self.agent_type
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
        """Convert to updates dictionary, filtering out None values"""
        updates = {}
        
        # Add all non-None fields
        for field_name, field_value in self.dict(exclude_none=True, by_alias=True).items():
            if field_name != "updates" and field_value is not None:
                updates[field_name] = field_value
        
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


# Legacy models for backward compatibility
class LLMConfig(BaseModel):
    """Model for LLM configuration - can contain any user-defined properties"""
    class_: Optional[str] = Field(None, alias="class", description="LLM class type")
    model_name: Optional[str] = Field(None, description="Model name")
    use_model: Optional[str] = Field(None, description="Alternative model field")
    temperature: Optional[float] = Field(None, description="Temperature setting")
    max_tokens: Optional[int] = Field(None, description="Maximum tokens")
    api_key: Optional[str] = Field(None, description="API key")
    api_base: Optional[str] = Field(None, description="API base URL")
    
    # Allow any additional fields
    class Config:
        extra = "allow"
        allow_population_by_field_name = True


class FunctionParameters(BaseModel):
    """Model for function parameters - follows OpenAI schema"""
    type: str = Field(default="object", description="Parameter type (always object for top level)")
    properties: Optional[Dict[str, Any]] = Field(None, description="Parameter properties")
    required: Optional[List[str]] = Field(None, description="Required parameter names")
    
    class Config:
        extra = "allow"


class AgentFunction(BaseModel):
    """Model for agent function definition"""
    description: str = Field(..., description="Function description")
    parameters: Optional[FunctionParameters] = Field(None, description="Function parameters")
    
    class Config:
        extra = "allow"


class Agent(BaseModel):
    """Model for individual agent - flexible to allow user-defined properties"""
    name: str = Field(..., description="Agent name")
    function: Optional[Union[AgentFunction, Dict[str, Any]]] = Field(None, description="Agent function")
    instructions: Optional[str] = Field(None, description="Agent instructions")
    command: Optional[str] = Field(None, description="Agent command template")
    tools: Optional[List[str]] = Field(None, description="List of downstream agent names")
    class_: Optional[str] = Field(None, alias="class", description="Coded tool class")
    llm_config: Optional[LLMConfig] = Field(None, description="Agent-specific LLM config")
    allow: Optional[Dict[str, Any]] = Field(None, description="Allow configuration")
    
    # Allow any additional fields that users might want to add
    class Config:
        extra = "allow"


class NetworkTitle(BaseModel):
    """Model for network title/name"""
    title: str = Field(..., description="Network title/name")

    @field_validator('title')
    def validate_title(cls, v):
        import re
        if not re.match(r'^[a-zA-Z0-9_\-]+$', v):
            raise ValueError("Network title must contain only alphanumeric characters, underscores, and hyphens")
        return v


class IncludeStatements(BaseModel):
    """Model for include statements"""
    includes: List[str] = Field(default_factory=list, description="List of included HOCON files")


class CommonDefs(BaseModel):
    """Model for common definitions"""
    replacement_strings: Optional[Dict[str, Any]] = Field(None, description="String replacements")
    replacement_values: Optional[Dict[str, Any]] = Field(None, description="Value replacements")
    
    # Allow any additional common definitions
    class Config:
        extra = "allow"


class CustomVariables(BaseModel):
    """Model for custom user-defined variables"""
    variables: Dict[str, Any] = Field(default_factory=dict, description="Custom variables")


class ToolsList(BaseModel):
    """Model for tools list"""
    tools: List[str] = Field(default_factory=list, description="List of agent names in the network")


class NetworkConnectivity(BaseModel):
    """Model for network connectivity information"""
    nodes: List[Dict[str, Any]] = Field(..., description="Network nodes")
    edges: List[Dict[str, Any]] = Field(..., description="Network edges")
    agent_details: Dict[str, Any] = Field(..., description="Agent details")


class AgentSuggestions(BaseModel):
    """Model for agent property suggestions"""
    common_properties: List[str] = Field(..., description="Common agent properties")
    coded_tool_properties: List[str] = Field(..., description="Properties specific to coded tools")
    conversational_agent_properties: List[str] = Field(..., description="Properties for conversational agents")
    function_schema_template: Dict[str, Any] = Field(..., description="Template for function schema")


class OperationResult(BaseModel):
    """Model for operation results"""
    success: bool = Field(..., description="Whether operation succeeded")
    message: str = Field(..., description="Result message")
    data: Optional[Dict[str, Any]] = Field(None, description="Additional result data")
    errors: Optional[List[str]] = Field(None, description="Error messages if any")


class NetworkCreateRequest(BaseModel):
    """Model for creating new networks"""
    name: str = Field(..., description="Network name")
    template: Optional[str] = Field(None, description="Template network to copy from")
    add_to_manifest: bool = Field(default=True, description="Whether to add to manifest.hocon")
    
    @field_validator('name')
    def validate_name(cls, v):
        import re
        if not re.match(r'^[a-zA-Z0-9_\-]+$', v):
            raise ValueError("Network name must contain only alphanumeric characters, underscores, and hyphens")
        return v


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
