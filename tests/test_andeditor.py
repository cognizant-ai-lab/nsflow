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

import pytest
import os
import tempfile
import shutil
from fastapi.testclient import TestClient
from nsflow.backend.main import app
from nsflow.backend.models.andeditor_models import (
    LLMConfig, Agent, NetworkTitle, IncludeStatements, 
    CommonDefs, CustomVariables, ToolsList, AgentCreateRequest,
    NetworkCreateRequest
)

client = TestClient(app)


class TestAndEditor:
    """Test cases for the Agent Network Designer API"""
    
    def test_list_networks(self):
        """Test listing networks with editing state"""
        response = client.get("/api/v1/andeditor/list")
        assert response.status_code == 200
        data = response.json()
        assert "networks" in data
        assert isinstance(data["networks"], list)
        
        # Check structure of network items
        if data["networks"]:
            network = data["networks"][0]
            assert "name" in network
            assert "editing_state" in network
    
    def test_get_connectivity(self):
        """Test getting network connectivity"""
        # First get a network to test with
        response = client.get("/api/v1/andeditor/list")
        assert response.status_code == 200
        networks = response.json()["networks"]
        
        if networks:
            network_name = networks[0]["name"]
            response = client.get(f"/api/v1/andeditor/connectivity/{network_name}")
            assert response.status_code == 200
            data = response.json()
            assert "nodes" in data
            assert "edges" in data
            assert "agent_details" in data
    
    def test_get_nonexistent_network_connectivity(self):
        """Test getting connectivity for non-existent network"""
        response = client.get("/api/v1/andeditor/connectivity/nonexistent_network")
        assert response.status_code == 404
    
    def test_llm_config_operations(self):
        """Test LLM configuration get/put operations"""
        # Get networks
        response = client.get("/api/v1/andeditor/list")
        networks = response.json()["networks"]
        
        if networks:
            network_name = networks[0]["name"]
            
            # Get current LLM config
            response = client.get(f"/api/v1/andeditor/networks/{network_name}/llm_config")
            assert response.status_code == 200
            llm_config = response.json()
            
            # Update LLM config
            new_config = {
                "model_name": "gpt-4o-test",
                "temperature": 0.8
            }
            response = client.put(f"/api/v1/andeditor/networks/{network_name}/llm_config", json=new_config)
            assert response.status_code == 200
            result = response.json()
            assert result["success"] is True
    
    def test_tools_list(self):
        """Test getting tools list"""
        response = client.get("/api/v1/andeditor/list")
        networks = response.json()["networks"]
        
        if networks:
            network_name = networks[0]["name"]
            response = client.get(f"/api/v1/andeditor/networks/{network_name}/tools")
            assert response.status_code == 200
            data = response.json()
            assert "tools" in data
            assert isinstance(data["tools"], list)
    
    def test_agent_operations(self):
        """Test agent get/put operations"""
        response = client.get("/api/v1/andeditor/list")
        networks = response.json()["networks"]
        
        if networks:
            network_name = networks[0]["name"]
            
            # Get tools list
            response = client.get(f"/api/v1/andeditor/networks/{network_name}/tools")
            tools = response.json()["tools"]
            
            if tools:
                agent_name = tools[0]
                
                # Get agent details
                response = client.get(f"/api/v1/andeditor/networks/{network_name}/agents/{agent_name}")
                assert response.status_code == 200
                agent_data = response.json()
                assert "name" in agent_data
                assert agent_data["name"] == agent_name
    
    def test_custom_variables_operations(self):
        """Test custom variables get/put"""
        response = client.get("/api/v1/andeditor/list")
        networks = response.json()["networks"]
        
        if networks:
            network_name = networks[0]["name"]
            
            # Get current custom variables
            response = client.get(f"/api/v1/andeditor/networks/{network_name}/custom_vars")
            assert response.status_code == 200
            vars_data = response.json()
            assert "variables" in vars_data
            
            # Update custom variables
            test_vars = {
                "variables": {
                    "test_variable": "test_value",
                    "test_number": 42
                }
            }
            response = client.put(f"/api/v1/andeditor/networks/{network_name}/custom_vars", json=test_vars)
            assert response.status_code == 200
            result = response.json()
            assert result["success"] is True
    
    def test_get_suggestions(self):
        """Test getting agent property suggestions"""
        response = client.get("/api/v1/andeditor/suggestions")
        assert response.status_code == 200
        data = response.json()
        assert "common_properties" in data
        assert "coded_tool_properties" in data
        assert "conversational_agent_properties" in data
        assert "function_schema_template" in data
        
        # Verify expected properties are present
        assert "name" in data["common_properties"]
        assert "function" in data["common_properties"]
        assert "class" in data["coded_tool_properties"]
        assert "instructions" in data["conversational_agent_properties"]
    
    def test_network_title_operations(self):
        """Test network title get operation"""
        response = client.get("/api/v1/andeditor/list")
        networks = response.json()["networks"]
        
        if networks:
            network_name = networks[0]["name"]
            
            # Get network title
            response = client.get(f"/api/v1/andeditor/networks/{network_name}/title")
            assert response.status_code == 200
            title_data = response.json()
            assert "title" in title_data
            assert title_data["title"] == network_name


class TestAndEditorModels:
    """Test cases for AndEditor Pydantic models"""
    
    def test_llm_config_model(self):
        """Test LLM configuration model"""
        config = LLMConfig(model_name="gpt-4", temperature=0.7)
        assert config.model_name == "gpt-4"
        assert config.temperature == 0.7
        
        # Test with extra fields (should be allowed)
        config_dict = {"model_name": "gpt-4", "custom_field": "custom_value"}
        config = LLMConfig.parse_obj(config_dict)
        assert config.model_name == "gpt-4"
    
    def test_agent_model(self):
        """Test agent model with flexible properties"""
        agent_data = {
            "name": "test_agent",
            "function": {"description": "Test agent"},
            "instructions": "Test instructions",
            "custom_property": "custom_value"
        }
        agent = Agent.parse_obj(agent_data)
        assert agent.name == "test_agent"
        assert agent.function["description"] == "Test agent"
        assert agent.instructions == "Test instructions"
    
    def test_network_title_validation(self):
        """Test network title validation"""
        # Valid titles
        valid_title = NetworkTitle(title="valid_network_name")
        assert valid_title.title == "valid_network_name"
        
        valid_title = NetworkTitle(title="network-with-hyphens")
        assert valid_title.title == "network-with-hyphens"
        
        # Invalid titles should raise validation error
        with pytest.raises(Exception):
            NetworkTitle(title="invalid network name")  # spaces not allowed
        
        with pytest.raises(Exception):
            NetworkTitle(title="invalid/network")  # slashes not allowed
    
    def test_custom_variables_model(self):
        """Test custom variables model"""
        variables = {
            "string_var": "hello",
            "number_var": 42,
            "boolean_var": True,
            "list_var": [1, 2, 3],
            "dict_var": {"nested": "value"}
        }
        custom_vars = CustomVariables(variables=variables)
        assert custom_vars.variables["string_var"] == "hello"
        assert custom_vars.variables["number_var"] == 42
        assert custom_vars.variables["boolean_var"] is True
    
    def test_agent_create_request_validation(self):
        """Test agent creation request validation"""
        # Valid request
        request = AgentCreateRequest(name="test_agent", agent_type="conversational")
        assert request.name == "test_agent"
        assert request.agent_type == "conversational"
        
        # Invalid agent type
        with pytest.raises(Exception):
            AgentCreateRequest(name="test_agent", agent_type="invalid_type")
    
    def test_network_create_request_validation(self):
        """Test network creation request validation"""
        # Valid request
        request = NetworkCreateRequest(name="test_network")
        assert request.name == "test_network"
        assert request.add_to_manifest is True  # default
        
        # Invalid name
        with pytest.raises(Exception):
            NetworkCreateRequest(name="invalid network name")


if __name__ == "__main__":
    pytest.main([__file__])
