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

"""
Simplified state manager that avoids locks and complex async patterns.
Designed for single-user editing sessions with simpler state management.
"""

import json
import logging
import uuid
from copy import deepcopy
from datetime import datetime
from typing import Dict, Any, Optional, List

logger = logging.getLogger(__name__)


class SimpleStateManager:
    """
    Simplified state manager for agent network editing.
    No locks, no complex async patterns - just simple state management.
    """
    
    def __init__(self, design_id: Optional[str] = None):
        self.design_id = design_id or str(uuid.uuid4())
        self.current_state: Dict[str, Any] = {}
        self.state_history: List[Dict[str, Any]] = []
        self.history_index = -1
        self.max_history = 20  # Reduced for simplicity
        
        # Initialize empty state structure
        self._initialize_empty_state()
    
    def _initialize_empty_state(self):
        """Initialize an empty state structure"""
        self.current_state = {
            "design_id": self.design_id,
            "network_name": "",
            "meta": {
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat(),
                "version": 1
            },
            "top_level": {
                "llm_config": {
                    "model_name": "gpt-4o",
                    "temperature": 0.7,
                    "max_tokens": 2000
                },
                "verbose": False,
                "max_iterations": 20
            },
            "agents": {}
        }
    
    def _save_to_history(self):
        """Save current state to history for undo/redo"""
        # Remove future history if we're not at the end
        if self.history_index < len(self.state_history) - 1:
            self.state_history = self.state_history[:self.history_index + 1]
        
        # Add current state to history
        self.state_history.append(deepcopy(self.current_state))
        self.history_index = len(self.state_history) - 1
        
        # Limit history size
        if len(self.state_history) > self.max_history:
            self.state_history.pop(0)
            self.history_index -= 1
    
    def undo(self) -> bool:
        """Undo last operation"""
        if self.history_index > 0:
            self.history_index -= 1
            self.current_state = deepcopy(self.state_history[self.history_index])
            self.current_state["meta"]["updated_at"] = datetime.now().isoformat()
            return True
        return False
    
    def redo(self) -> bool:
        """Redo last undone operation"""
        if self.history_index < len(self.state_history) - 1:
            self.history_index += 1
            self.current_state = deepcopy(self.state_history[self.history_index])
            self.current_state["meta"]["updated_at"] = datetime.now().isoformat()
            return True
        return False
    
    def can_undo(self) -> bool:
        """Check if undo is possible"""
        return self.history_index > 0
    
    def can_redo(self) -> bool:
        """Check if redo is possible"""
        return self.history_index < len(self.state_history) - 1
    
    def get_state(self) -> Dict[str, Any]:
        """Get current state"""
        return deepcopy(self.current_state)
    
    def set_network_name(self, network_name: str) -> bool:
        """Set network name"""
        try:
            self._save_to_history()
            self.current_state["network_name"] = network_name
            self.current_state["meta"]["updated_at"] = datetime.now().isoformat()
            return True
        except Exception as e:
            logger.error(f"Failed to set network name: {e}")
            return False
    
    def load_from_hocon_structure(self, hocon_config: Dict[str, Any], network_name: str):
        """Load state from HOCON configuration"""
        try:
            self._save_to_history()
            
            # Reset state
            self._initialize_empty_state()
            self.current_state["network_name"] = network_name
            
            # Load top-level configuration
            self._load_top_level_config(hocon_config)
            
            # Load agents from tools
            tools = hocon_config.get("tools", [])
            for tool in tools:
                if isinstance(tool, dict) and "name" in tool:
                    self._load_agent_from_tool(tool)
            
            # Set parent relationships
            self._update_parent_relationships()
            
            self.current_state["meta"]["updated_at"] = datetime.now().isoformat()
            
        except Exception as e:
            logger.error(f"Failed to load from HOCON: {e}")
            raise
    
    def _load_top_level_config(self, hocon_config: Dict[str, Any]):
        """Load top-level configuration from HOCON"""
        top_level = self.current_state["top_level"]
        
        # Map HOCON fields to our structure
        field_mappings = {
            "llm_config": "llm_config",
            "verbose": "verbose",
            "max_iterations": "max_iterations",
            "max_execution_seconds": "max_execution_seconds",
            "error_formatter": "error_formatter",
            "error_fragments": "error_fragments",
            "metadata": "metadata"
        }
        
        for hocon_field, state_field in field_mappings.items():
            if hocon_field in hocon_config:
                top_level[state_field] = hocon_config[hocon_field]
        
        # Handle special cases
        if "commondefs" in hocon_config:
            commondefs = hocon_config["commondefs"]
            if not top_level.get("commondefs"):
                top_level["commondefs"] = {"replacement_strings": {}, "replacement_values": {}}
            if "replacement_strings" in commondefs:
                top_level["commondefs"]["replacement_strings"] = commondefs["replacement_strings"]
            if "replacement_values" in commondefs:
                top_level["commondefs"]["replacement_values"] = commondefs["replacement_values"]
    
    def _load_agent_from_tool(self, tool: Dict[str, Any]):
        """Load agent from HOCON tool definition"""
        agent_name = tool["name"]
        
        agent_def = {
            "name": agent_name,
            "instructions": tool.get("instructions", ""),
            "function": tool.get("function", {}),
            "tools": tool.get("tools", []),
            "class": tool.get("class"),
            "toolbox": tool.get("toolbox"),
            "args": tool.get("args", {}),
            "allow": tool.get("allow", {}),
            "llm_config": tool.get("llm_config", {}),
            "display_as": tool.get("display_as"),
            "max_message_history": tool.get("max_message_history"),
            "verbose": tool.get("verbose"),
            "max_iterations": tool.get("max_iterations"),
            "max_execution_seconds": tool.get("max_execution_seconds"),
            "error_formatter": tool.get("error_formatter"),
            "error_fragments": tool.get("error_fragments"),
            "structure_formats": tool.get("structure_formats"),
            "_parent": None  # Will be set when building hierarchy
        }
        
        self.current_state["agents"][agent_name] = agent_def
    
    def _update_parent_relationships(self):
        """Update parent relationships based on tools connections"""
        # Reset all parent relationships
        for agent in self.current_state["agents"].values():
            agent["_parent"] = None
        
        # Set parent relationships based on tools
        for agent_name, agent in self.current_state["agents"].items():
            for child_name in agent.get("tools", []):
                if child_name in self.current_state["agents"]:
                    self.current_state["agents"][child_name]["_parent"] = agent_name
    
    def load_from_copilot_state(self, copilot_state: Dict[str, Any]) -> bool:
        """Load state from copilot agent network definition"""
        try:
            self._save_to_history()
            
            network_name = copilot_state.get("agent_network_name", "")
            agent_network_definition = copilot_state.get("agent_network_definition", {})
            
            # Reset agents but keep top-level config
            self.current_state["agents"] = {}
            self.current_state["network_name"] = network_name
            
            # Convert copilot format to our format
            for agent_name, agent_data in agent_network_definition.items():
                agent_def = {
                    "name": agent_name,
                    "instructions": agent_data.get("instructions", ""),
                    "tools": agent_data.get("down_chains", []),
                    "class": None,
                    "_parent": None
                }
                self.current_state["agents"][agent_name] = agent_def
            
            # Set parent relationships
            self._update_parent_relationships()
            
            self.current_state["meta"]["updated_at"] = datetime.now().isoformat()
            return True
            
        except Exception as e:
            logger.error(f"Failed to load from copilot state: {e}")
            return False
    
    def create_from_template(self, template_type: str, **kwargs) -> bool:
        """Create network from template"""
        try:
            self._save_to_history()
            self._initialize_empty_state()
            
            if template_type == "single_agent":
                self._create_single_agent_template(**kwargs)
            elif template_type == "hierarchical":
                self._create_hierarchical_template(**kwargs)
            elif template_type == "sequential":
                self._create_sequential_template(**kwargs)
            else:
                raise ValueError(f"Unknown template type: {template_type}")
            
            self.current_state["meta"]["updated_at"] = datetime.now().isoformat()
            return True
            
        except Exception as e:
            logger.error(f"Failed to create from template: {e}")
            return False
    
    def _create_single_agent_template(self, **kwargs):
        """Create single agent template"""
        agent_name = kwargs.get("agent_name", "frontman")
        
        agent_def = {
            "name": agent_name,
            "instructions": "Main agent instructions",
            "tools": [],
            "class": None,
            "_parent": None
        }
        
        self.current_state["agents"][agent_name] = agent_def
    
    def _create_hierarchical_template(self, **kwargs):
        """Create hierarchical template"""
        levels = kwargs.get("levels", 2)
        agents_per_level = kwargs.get("agents_per_level", [1, 3])
        
        if len(agents_per_level) != levels:
            agents_per_level = [1] + [3] * (levels - 1)
        
        # Create frontman
        frontman_name = "frontman"
        frontman_def = {
            "name": frontman_name,
            "instructions": "Root agent instructions",
            "tools": [],
            "class": None,
            "_parent": None
        }
        self.current_state["agents"][frontman_name] = frontman_def
        
        # Create hierarchy
        current_parents = [frontman_name]
        for level in range(1, levels):
            new_agents = []
            for parent in current_parents:
                for i in range(agents_per_level[level]):
                    agent_name = f"agent_L{level}_{len(new_agents) + 1}"
                    agent_def = {
                        "name": agent_name,
                        "instructions": f"Level {level} agent instructions",
                        "tools": [],
                        "class": None,
                        "_parent": parent
                    }
                    self.current_state["agents"][agent_name] = agent_def
                    self.current_state["agents"][parent]["tools"].append(agent_name)
                    new_agents.append(agent_name)
            current_parents = new_agents
    
    def _create_sequential_template(self, **kwargs):
        """Create sequential template"""
        sequence_length = kwargs.get("sequence_length", 3)
        
        previous_agent = None
        for i in range(sequence_length):
            agent_name = f"agent_{i + 1}" if i > 0 else "frontman"
            agent_def = {
                "name": agent_name,
                "instructions": f"Step {i + 1} agent instructions",
                "tools": [],
                "class": None,
                "_parent": previous_agent
            }
            
            self.current_state["agents"][agent_name] = agent_def
            
            if previous_agent:
                self.current_state["agents"][previous_agent]["tools"].append(agent_name)
            
            previous_agent = agent_name
    
    def add_agent(self, agent_name: str, parent_name: Optional[str] = None, agent_data: Optional[Dict[str, Any]] = None) -> bool:
        """Add new agent"""
        try:
            if agent_name in self.current_state["agents"]:
                return False  # Agent already exists
            
            self._save_to_history()
            
            # Create simple agent structure
            agent_def = {
                "name": agent_name,
                "instructions": f"Instructions for {agent_name}",
                "tools": [],
                "class": None,
                "_parent": parent_name
            }
            
            if agent_data:
                agent_def.update(agent_data)
            
            self.current_state["agents"][agent_name] = agent_def
            
            # Add to parent's tools if parent specified
            if parent_name and parent_name in self.current_state["agents"]:
                if agent_name not in self.current_state["agents"][parent_name]["tools"]:
                    self.current_state["agents"][parent_name]["tools"].append(agent_name)
            
            self.current_state["meta"]["updated_at"] = datetime.now().isoformat()
            return True
            
        except Exception as e:
            logger.error(f"Failed to add agent: {e}")
            return False
    
    def update_agent(self, agent_name: str, updates: Dict[str, Any]) -> bool:
        """Update agent properties"""
        try:
            if agent_name not in self.current_state["agents"]:
                return False
            
            self._save_to_history()
            
            # Update agent properties
            agent = self.current_state["agents"][agent_name]
            for key, value in updates.items():
                agent[key] = value
            
            self.current_state["meta"]["updated_at"] = datetime.now().isoformat()
            return True
            
        except Exception as e:
            logger.error(f"Failed to update agent: {e}")
            return False
    
    def duplicate_agent(self, agent_name: str, new_name: str) -> bool:
        """Duplicate an agent"""
        try:
            if agent_name not in self.current_state["agents"] or new_name in self.current_state["agents"]:
                return False
            
            self._save_to_history()
            
            # Deep copy the agent
            original_agent = deepcopy(self.current_state["agents"][agent_name])
            original_agent["name"] = new_name
            
            self.current_state["agents"][new_name] = original_agent
            
            # Add to same parent if exists
            parent_name = original_agent.get("_parent")
            if parent_name and parent_name in self.current_state["agents"]:
                if new_name not in self.current_state["agents"][parent_name]["tools"]:
                    self.current_state["agents"][parent_name]["tools"].append(new_name)
            
            self.current_state["meta"]["updated_at"] = datetime.now().isoformat()
            return True
            
        except Exception as e:
            logger.error(f"Failed to duplicate agent: {e}")
            return False
    
    def delete_agent(self, agent_name: str) -> bool:
        """Delete an agent"""
        try:
            if agent_name not in self.current_state["agents"]:
                return False
            
            self._save_to_history()
            
            agent = self.current_state["agents"][agent_name]
            
            # Remove from parent's tools
            parent_name = agent.get("_parent")
            if parent_name and parent_name in self.current_state["agents"]:
                tools = self.current_state["agents"][parent_name]["tools"]
                if agent_name in tools:
                    tools.remove(agent_name)
            
            # Update children to have no parent (orphan them)
            for child_name in agent.get("tools", []):
                if child_name in self.current_state["agents"]:
                    self.current_state["agents"][child_name]["_parent"] = None
            
            # Remove agent references from all other agents' tools
            for other_agent in self.current_state["agents"].values():
                if agent_name in other_agent.get("tools", []):
                    other_agent["tools"].remove(agent_name)
            
            # Delete the agent
            del self.current_state["agents"][agent_name]
            
            self.current_state["meta"]["updated_at"] = datetime.now().isoformat()
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete agent: {e}")
            return False
    
    def add_edge(self, source_agent: str, target_agent: str) -> bool:
        """Add edge between agents"""
        try:
            if (source_agent not in self.current_state["agents"] or 
                target_agent not in self.current_state["agents"]):
                return False
            
            # Check for cycles
            if self._would_create_cycle(source_agent, target_agent):
                return False
            
            self._save_to_history()
            
            # Add target to source's tools
            source_tools = self.current_state["agents"][source_agent]["tools"]
            if target_agent not in source_tools:
                source_tools.append(target_agent)
            
            # Set parent relationship
            self.current_state["agents"][target_agent]["_parent"] = source_agent
            
            self.current_state["meta"]["updated_at"] = datetime.now().isoformat()
            return True
            
        except Exception as e:
            logger.error(f"Failed to add edge: {e}")
            return False
    
    def remove_edge(self, source_agent: str, target_agent: str) -> bool:
        """Remove edge between agents"""
        try:
            if (source_agent not in self.current_state["agents"] or 
                target_agent not in self.current_state["agents"]):
                return False
            
            self._save_to_history()
            
            # Remove target from source's tools
            source_tools = self.current_state["agents"][source_agent]["tools"]
            if target_agent in source_tools:
                source_tools.remove(target_agent)
            
            # Remove parent relationship if this was the parent
            target_agent_data = self.current_state["agents"][target_agent]
            if target_agent_data.get("_parent") == source_agent:
                target_agent_data["_parent"] = None
            
            self.current_state["meta"]["updated_at"] = datetime.now().isoformat()
            return True
            
        except Exception as e:
            logger.error(f"Failed to remove edge: {e}")
            return False
    
    def _would_create_cycle(self, source: str, target: str) -> bool:
        """Check if adding edge would create a cycle"""
        visited = set()
        
        def dfs(current: str) -> bool:
            if current == source:
                return True
            if current in visited:
                return False
            
            visited.add(current)
            
            agent = self.current_state["agents"].get(current)
            if not agent:
                return False
            
            for child in agent.get("tools", []):
                if child in self.current_state["agents"] and dfs(child):
                    return True
            
            return False
        
        return dfs(target)
    
    def validate_network(self) -> Dict[str, Any]:
        """Validate network structure"""
        validation_result = {
            "valid": True,
            "warnings": [],
            "errors": []
        }
        
        agents = self.current_state["agents"]
        
        if not agents:
            validation_result["errors"].append("Network has no agents")
            validation_result["valid"] = False
            return validation_result
        
        # Find frontman (agents with no parent)
        frontmen = [name for name, agent in agents.items() if not agent.get("_parent")]
        
        if len(frontmen) == 0:
            validation_result["errors"].append("Network has no frontman (root agent)")
            validation_result["valid"] = False
        elif len(frontmen) > 1:
            validation_result["warnings"].append(f"Network has multiple frontmen: {', '.join(frontmen)}. Only one frontman is recommended.")
        
        return validation_result
    
    def export_to_hocon(self) -> Dict[str, Any]:
        """Export current state to HOCON format"""
        hocon_config = {}
        
        # Add top-level configuration
        top_level = self.current_state["top_level"]
        
        # Add commondefs if not empty
        commondefs = top_level.get("commondefs", {})
        if commondefs.get("replacement_strings") or commondefs.get("replacement_values"):
            hocon_config["commondefs"] = commondefs
        
        # Add includes if not empty
        includes = top_level.get("includes", [])
        if includes:
            hocon_config["includes"] = includes
        
        # Add other top-level fields if they have values
        optional_fields = [
            "llm_info_file", "toolbox_info_file", "llm_config", "verbose",
            "max_iterations", "max_execution_seconds", "error_formatter",
            "error_fragments", "metadata"
        ]
        
        for field in optional_fields:
            value = top_level.get(field)
            if value is not None:
                hocon_config[field] = value
        
        # Convert agents to tools
        tools = []
        agents = self.current_state["agents"]
        
        # Find frontman first
        frontmen = [name for name, agent in agents.items() if not agent.get("_parent")]
        
        # Add frontman first, then others
        added_agents = set()
        for frontman in frontmen:
            self._add_agent_to_tools(frontman, tools, agents, added_agents)
        
        # Add any remaining agents
        for agent_name in agents:
            if agent_name not in added_agents:
                self._add_agent_to_tools(agent_name, tools, agents, added_agents)
        
        hocon_config["tools"] = tools
        
        return hocon_config
    
    def _add_agent_to_tools(self, agent_name: str, tools: List[Dict], agents: Dict, added_agents: set):
        """Recursively add agent and its children to tools list"""
        if agent_name in added_agents or agent_name not in agents:
            return
        
        agent = agents[agent_name]
        tool_def = {"name": agent_name}
        
        # Add all agent properties (except internal ones)
        for key, value in agent.items():
            if key not in ["name", "_parent"] and value is not None:
                if key == "tools":
                    # Filter out external tools and only include actual agent names
                    internal_tools = [t for t in value if t in agents]
                    if internal_tools:
                        tool_def[key] = internal_tools
                else:
                    tool_def[key] = value
        
        tools.append(tool_def)
        added_agents.add(agent_name)
        
        # Add children
        for child_name in agent.get("tools", []):
            if child_name in agents:
                self._add_agent_to_tools(child_name, tools, agents, added_agents)
    
    def save_to_file(self, file_path: str) -> bool:
        """Save current state to JSON file"""
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(self.current_state, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            logger.error(f"Failed to save to file: {e}")
            return False
    
    def load_from_file(self, file_path: str) -> bool:
        """Load state from JSON file"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                loaded_state = json.load(f)
            
            self._save_to_history()
            self.current_state = loaded_state
            self.design_id = loaded_state.get("design_id", self.design_id)
            self.current_state["meta"]["updated_at"] = datetime.now().isoformat()
            
            return True
        except Exception as e:
            logger.error(f"Failed to load from file: {e}")
            return False
    
    def extract_state_from_progress(self, progress_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Extract state dictionary from progress message data.
        Compatible with legacy StateManager for agent log processing.
        
        :param progress_data: Progress data from ChatMessageType.AGENT_PROGRESS
        :return: State dictionary if found, None otherwise
        """
        # Check if progress_data directly contains agent network definition
        if "agent_network_definition" in progress_data:
            return progress_data
        
        # Check nested structures
        for _, value in progress_data.items():
            if isinstance(value, dict) and "agent_network_definition" in value:
                return value
        
        return None
    
    def update_network_state(self, network_name: str, state_dict: Dict[str, Any], source: str = "unknown") -> bool:
        """
        Update the network state from external sources (like agent logs).
        This creates a new history entry so copilot changes can be undone.
        
        :param network_name: Name of the network
        :param state_dict: State dictionary from logs or editor  
        :param source: Source of the update (logs, editor, etc.)
        :return: True if update was successful
        """
        try:
            # Save current state to history before making changes
            # This ensures even the first update creates a history entry
            self._save_to_history()
            
            # Extract agent network definition
            agent_network_definition = state_dict.get("agent_network_definition", {})
            network_name_from_dict = state_dict.get("agent_network_name", network_name)
            
            # Clear current agents and reload from the state_dict
            self.current_state["agents"] = {}
            self.current_state["network_name"] = network_name_from_dict
            
            # Convert copilot format to our format
            for agent_name, agent_data in agent_network_definition.items():
                agent_def = {
                    "name": agent_name,
                    "instructions": agent_data.get("instructions", ""),
                    "tools": agent_data.get("down_chains", []),
                    "class": None,
                    "_parent": None
                }
                self.current_state["agents"][agent_name] = agent_def
            
            # Set parent relationships
            self._update_parent_relationships()
            
            # Update metadata
            self.current_state["meta"]["source"] = source
            self.current_state["meta"]["updated_at"] = datetime.now().isoformat()
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to update network state: {e}")
            return False
