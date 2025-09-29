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


# Extended models for comprehensive editor functionality

class NetworkTemplate(BaseModel):
    """Template configuration for creating new networks"""
    type: str = Field(..., description="Template type: single_agent, hierarchical, sequential")
    name: Optional[str] = Field(None, description="Network name")
    
    # Template-specific parameters
    levels: Optional[int] = Field(None, description="Number of levels for hierarchical template")
    agents_per_level: Optional[List[int]] = Field(None, description="Agents per level for hierarchical")
    sequence_length: Optional[int] = Field(None, description="Length for sequential template")
    agent_name: Optional[str] = Field(None, description="Agent name for single agent template")


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


class AgentCreateRequest(BaseModel):
    """Request to create a new agent"""
    name: str = Field(..., description="Agent name")
    parent_name: Optional[str] = Field(None, description="Parent agent name")
    agent_data: Optional[Dict[str, Any]] = Field(None, description="Agent configuration")
    # Additional fields for compatibility
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


class AgentUpdateRequest(BaseModel):
    """Request to update an agent"""
    updates: Dict[str, Any] = Field(..., description="Fields to update")
    
    class Config:
        extra = "allow"


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
    output_path: Optional[str] = Field(None, description="Output file path")
    validate_before_export: bool = Field(default=True, description="Validate before export")


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


# AgentCreateRequest moved up to avoid duplication


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
