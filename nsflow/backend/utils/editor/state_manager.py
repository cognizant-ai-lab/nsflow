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
from datetime import datetime
from typing import Dict, Any, Optional, List, Callable
from threading import Lock

logger = logging.getLogger(__name__)


class StateManager:
    """
    Centralized state manager for agent network states.
    Shared between agent network designer, FastAPI, and log processing.
    """
    
    def __init__(self):
        # Simple dictionary to store network states
        # Format: {network_name: {"state": state_dict, "last_updated": timestamp, "source": source}}
        self.network_states: Dict[str, Dict[str, Any]] = {}
        self.subscribers: List[Callable] = []
        self.state_lock = Lock()
    
    def update_network_state(self, network_name: str, state_dict: Dict[str, Any], source: str = "unknown") -> bool:
        """
        Update the network state for a given network.
        
        :param network_name: Name of the network
        :param state_dict: State dictionary from logs or editor
        :param source: Source of the update (logs, editor, etc.)
        :return: True if update was successful
        """
        try:
            with self.state_lock:
                # Simple state storage
                network_state = {
                    "state": state_dict,
                    "last_updated": datetime.now().isoformat(),
                    "source": source
                }
                
                self.network_states[network_name] = network_state
                
                # Notify subscribers
                self._notify_subscribers(network_name, network_state)
                
                logger.info(f"Updated network state for '{network_name}' from {source}")
                return True
                
        except Exception as e:
            logger.error(f"Failed to update network state: {e}")
            return False
    
    def get_network_state(self, network_name: str) -> Optional[Dict[str, Any]]:
        """
        Get the current network state for a given network.
        
        :param network_name: Name of the network
        :return: State dict or None if not found
        """
        with self.state_lock:
            return self.network_states.get(network_name)
    
    def get_all_network_states(self) -> Dict[str, Dict[str, Any]]:
        """Get all current network states"""
        with self.state_lock:
            return self.network_states.copy()
    
    def subscribe_to_updates(self, callback: Callable[[str, Dict[str, Any]], None]):
        """
        Subscribe to state updates.
        
        :param callback: Function to call when state is updated
        """
        self.subscribers.append(callback)
    
    def unsubscribe_from_updates(self, callback: Callable):
        """
        Unsubscribe from state updates.
        
        :param callback: Function to remove from subscribers
        """
        if callback in self.subscribers:
            self.subscribers.remove(callback)
    
    def _notify_subscribers(self, network_name: str, network_state: Dict[str, Any]):
        """Notify all subscribers of state changes"""
        for callback in self.subscribers:
            try:
                callback(network_name, network_state)
            except Exception as e:
                logger.error(f"Error notifying subscriber: {e}")
    
    def clear_network_state(self, network_name: str) -> bool:
        """
        Clear the state for a specific network.
        
        :param network_name: Name of the network to clear
        :return: True if cleared successfully
        """
        try:
            with self.state_lock:
                if network_name in self.network_states:
                    del self.network_states[network_name]
                    logger.info(f"Cleared network state for '{network_name}'")
                    return True
                return False
        except Exception as e:
            logger.error(f"Failed to clear network state: {e}")
            return False
    
    def get_network_names(self) -> List[str]:
        """Get list of all network names that have states"""
        with self.state_lock:
            return list(self.network_states.keys())
    
    def extract_state_from_progress(self, progress_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Extract state dictionary from progress message data.
        
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
    
    def get_state_from_hocon(self, network_name: str) -> Optional[Dict[str, Any]]:
        """
        Get state by reading from existing HOCON file.
        This allows us to load state from files already on disk.
        
        :param network_name: Name of the network to load from HOCON
        :return: State dictionary if file exists and can be parsed, None otherwise
        """
        try:
            # Import here to avoid circular imports
            from nsflow.backend.utils.agentutils.agent_network_utils import AgentNetworkUtils
            
            agent_utils = AgentNetworkUtils()
            agent_network = agent_utils.get_agent_network(network_name)
            config = agent_network.get_config()
            
            # Convert HOCON config to our state format
            state_dict = self._convert_hocon_to_state(config, network_name)
            
            # Optionally cache this state in memory
            if state_dict:
                self.update_network_state(network_name, state_dict, source="hocon_file")
            
            return state_dict
            
        except Exception as e:
            logger.warning(f"Could not load state from HOCON for '{network_name}': {e}")
            return None
    
    def _convert_hocon_to_state(self, hocon_config: Dict[str, Any], network_name: str) -> Dict[str, Any]:
        """
        Convert HOCON config format to our state format.
        
        :param hocon_config: Raw HOCON configuration
        :param network_name: Network name to include in state
        :return: State dictionary in our expected format
        """
        try:
            # Extract tools/agents from HOCON
            tools = hocon_config.get("tools", [])
            
            agent_network_definition = {}
            for tool in tools:
                if isinstance(tool, dict) and "name" in tool:
                    agent_name = tool["name"]
                    agent_def = {
                        "instructions": tool.get("instructions", "")
                    }
                    
                    # Extract down_chains from tools field
                    if "tools" in tool and isinstance(tool["tools"], list):
                        agent_def["down_chains"] = tool["tools"]
                    else:
                        agent_def["down_chains"] = []
                    
                    agent_network_definition[agent_name] = agent_def
            
            return {
                "agent_network_definition": agent_network_definition,
                "agent_network_name": network_name
            }
            
        except Exception as e:
            logger.error(f"Error converting HOCON to state: {e}")
            return {}
    
    def get_or_load_state(self, network_name: str) -> Optional[Dict[str, Any]]:
        """
        Get state from memory, or load from HOCON file if not in memory.
        
        :param network_name: Name of the network
        :return: State dictionary from memory or HOCON file
        """
        # First try to get from memory
        memory_state = self.get_network_state(network_name)
        if memory_state:
            return memory_state
        
        # If not in memory, try to load from HOCON file
        return self.get_state_from_hocon(network_name)
