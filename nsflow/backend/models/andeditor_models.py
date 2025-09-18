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

from pydantic import BaseModel, Field, validator
from typing import Dict, List, Optional, Any, Union
from enum import Enum


class LLMConfig(BaseModel):
    """Model for LLM configuration - can contain any user-defined properties"""
    class_: Optional[str] = Field(None, alias="class", description="LLM class type")
    model_name: Optional[str] = Field(None, description="Model name")
    use_model: Optional[str] = Field(None, description="Alternative model field")
    temperature: Optional[float] = Field(None, description="Temperature setting")
    max_tokens: Optional[int] = Field(None, description="Maximum tokens")
    
    # Allow any additional fields
    class Config:
        extra = "allow"


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

    @validator('title')
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


class EditingState(BaseModel):
    """Model for tracking editing state"""
    is_editing: bool = Field(default=False, description="Whether network is currently being edited")
    last_saved: Optional[str] = Field(None, description="Last saved timestamp")
    last_modified: Optional[str] = Field(None, description="Last modification timestamp")
    has_unsaved_changes: bool = Field(default=False, description="Whether there are unsaved changes")


class NetworkMetadata(BaseModel):
    """Model for network metadata"""
    name: str = Field(..., description="Network name")
    file_path: str = Field(..., description="Path to HOCON file")
    in_manifest: bool = Field(..., description="Whether network is listed in manifest")
    editing_state: EditingState = Field(..., description="Current editing state")


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


class NetworkRenameRequest(BaseModel):
    """Model for network rename requests"""
    old_name: str = Field(..., description="Current network name")
    new_name: str = Field(..., description="New network name")
    
    @validator('new_name')
    def validate_new_name(cls, v):
        import re
        if not re.match(r'^[a-zA-Z0-9_\-]+$', v):
            raise ValueError("Network name must contain only alphanumeric characters, underscores, and hyphens")
        return v


class PropertyAddRequest(BaseModel):
    """Model for adding properties to agents or networks"""
    property_name: str = Field(..., description="Name of the property to add")
    property_value: Any = Field(..., description="Value of the property")
    property_type: Optional[str] = Field(None, description="Type hint for the property")


class AgentCreateRequest(BaseModel):
    """Model for creating new agents"""
    name: str = Field(..., description="Agent name")
    agent_type: str = Field(default="conversational", description="Type of agent (conversational or coded_tool)")
    template: Optional[str] = Field(None, description="Template to base agent on")
    
    @validator('agent_type')
    def validate_agent_type(cls, v):
        if v not in ['conversational', 'coded_tool']:
            raise ValueError("Agent type must be 'conversational' or 'coded_tool'")
        return v


class NetworkCreateRequest(BaseModel):
    """Model for creating new networks"""
    name: str = Field(..., description="Network name")
    template: Optional[str] = Field(None, description="Template network to copy from")
    add_to_manifest: bool = Field(default=True, description="Whether to add to manifest.hocon")
    
    @validator('name')
    def validate_name(cls, v):
        import re
        if not re.match(r'^[a-zA-Z0-9_\-]+$', v):
            raise ValueError("Network name must contain only alphanumeric characters, underscores, and hyphens")
        return v
