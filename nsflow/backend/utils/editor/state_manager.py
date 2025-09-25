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
import asyncio

from nsflow.backend.models.andeditor_models import AgentNetworkState, SharedState

logger = logging.getLogger(__name__)


class StateManager:
    """
    Centralized state manager for agent network states.
    Shared between agent network designer, FastAPI, and log processing.
    """
    
    def __init__(self):
        self.shared_states: Dict[str, SharedState] = {}
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
                # Validate and convert to AgentNetworkState
                agent_network_state = AgentNetworkState.parse_obj(state_dict)
                
                # Update shared state
                shared_state = SharedState(
                    current_network_state=agent_network_state,
                    last_updated=datetime.now().isoformat(),
                    source=source
                )
                
                self.shared_states[network_name] = shared_state
                
                # Notify subscribers
                self._notify_subscribers(network_name, shared_state)
                
                logger.info(f"Updated network state for '{network_name}' from {source}")
                return True
                
        except Exception as e:
            logger.error(f"Failed to update network state: {e}")
            return False
    
    def get_network_state(self, network_name: str) -> Optional[SharedState]:
        """
        Get the current network state for a given network.
        
        :param network_name: Name of the network
        :return: SharedState or None if not found
        """
        with self.state_lock:
            return self.shared_states.get(network_name)
    
    def get_all_network_states(self) -> Dict[str, SharedState]:
        """Get all current network states"""
        with self.state_lock:
            return self.shared_states.copy()
    
    def subscribe_to_updates(self, callback: Callable[[str, SharedState], None]):
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
    
    def _notify_subscribers(self, network_name: str, shared_state: SharedState):
        """Notify all subscribers of state changes"""
        for callback in self.subscribers:
            try:
                callback(network_name, shared_state)
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
                if network_name in self.shared_states:
                    del self.shared_states[network_name]
                    logger.info(f"Cleared network state for '{network_name}'")
                    return True
                return False
        except Exception as e:
            logger.error(f"Failed to clear network state: {e}")
            return False
    
    def get_network_names(self) -> List[str]:
        """Get list of all network names that have states"""
        with self.state_lock:
            return list(self.shared_states.keys())
    
    async def update_from_logs(self, network_name: str, log_data: Dict[str, Any]):
        """
        Update network state from log data.
        This method can be called from the log processor.
        
        :param network_name: Name of the network
        :param log_data: Log data containing state information
        """
        try:
            # Extract state dictionary from log data
            # The exact format will depend on how logs are structured
            if "agent_network_definition" in log_data:
                state_dict = log_data
            elif "state_dict" in log_data:
                state_dict = log_data["state_dict"]
            else:
                # Try to construct state from log data
                state_dict = self._construct_state_from_logs(network_name, log_data)
            
            if state_dict:
                self.update_network_state(network_name, state_dict, source="logs")
                
        except Exception as e:
            logger.error(f"Failed to update from logs: {e}")
    
    def _construct_state_from_logs(self, network_name: str, log_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Construct state dictionary from log data.
        This is a placeholder for more sophisticated log parsing.
        """
        # This would need to be implemented based on the actual log format
        # For now, return None if we can't construct a valid state
        return None
