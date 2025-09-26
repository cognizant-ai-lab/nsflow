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
Manages a global registry of StateManager instances, scoped by unique identifiers.

This allows consistent reuse of state managers across different components
(e.g., log processors, API endpoints) while avoiding redundant instantiations.
Each state manager can be identified by a combination of UUID and network name.
"""

import uuid
from typing import Dict, Optional, List, Tuple
from nsflow.backend.utils.editor.state_manager import StateManager


# pylint: disable=too-few-public-methods
class StateRegistry:
    """
    Registry for shared StateManager instances.
    Provides a way to access or create state managers scoped by unique identifiers,
    ensuring shared state management across components for the same agent network.
    """

    _managers: Dict[str, StateManager] = {}
    _network_to_keys: Dict[str, List[str]] = {}  # network_name -> list of keys

    @classmethod
    def register(cls, network_name: str, session_id: Optional[str] = None) -> Tuple[str, StateManager]:
        """
        Retrieve or create a StateManager for the given network and session.

        :param network_name: The name of the agent network
        :param session_id: Optional session ID. If None, creates a new UUID
        :return: Tuple of (registry_key, StateManager instance)
        """
        # Generate a unique key combining network_name and session_id
        if session_id is None:
            session_id = str(uuid.uuid4())
        
        registry_key = f"{network_name}:{session_id}"
        
        if registry_key not in cls._managers:
            cls._managers[registry_key] = StateManager()
            
            # Track network to keys mapping
            if network_name not in cls._network_to_keys:
                cls._network_to_keys[network_name] = []
            cls._network_to_keys[network_name].append(registry_key)
        
        return registry_key, cls._managers[registry_key]

    @classmethod
    def get_manager(cls, registry_key: str) -> Optional[StateManager]:
        """
        Get a StateManager by its registry key.
        
        :param registry_key: The registry key (network_name:session_id)
        :return: StateManager instance or None if not found
        """
        return cls._managers.get(registry_key)

    @classmethod
    def get_managers_for_network(cls, network_name: str) -> Dict[str, StateManager]:
        """
        Get all StateManager instances for a given network.
        
        :param network_name: The name of the agent network
        :return: Dictionary of {registry_key: StateManager}
        """
        if network_name not in cls._network_to_keys:
            return {}
        
        managers = {}
        for key in cls._network_to_keys[network_name]:
            if key in cls._managers:
                managers[key] = cls._managers[key]
        
        return managers

    @classmethod
    def get_primary_manager_for_network(cls, network_name: str) -> Optional[StateManager]:
        """
        Get the primary (most recently updated) StateManager for a network.
        
        :param network_name: The name of the agent network
        :return: StateManager instance or None if not found
        """
        managers = cls.get_managers_for_network(network_name)
        if not managers:
            return None
        
        # Find the manager with the most recent state update
        latest_manager = None
        latest_time = None
        
        for manager in managers.values():
            network_state = manager.get_network_state(network_name)
            if network_state:
                last_updated = network_state.get("last_updated")
                if last_updated and (latest_time is None or last_updated > latest_time):
                    latest_time = last_updated
                    latest_manager = manager
        
        # If no manager has state for this network, return the first one
        if latest_manager is None and managers:
            latest_manager = next(iter(managers.values()))
        
        return latest_manager

    @classmethod
    def unregister(cls, registry_key: str) -> bool:
        """
        Remove a StateManager from the registry.
        
        :param registry_key: The registry key to remove
        :return: True if removed, False if not found
        """
        if registry_key not in cls._managers:
            return False
        
        # Extract network name from registry key
        network_name = registry_key.split(':', 1)[0]
        
        # Remove from managers
        del cls._managers[registry_key]
        
        # Remove from network mapping
        if network_name in cls._network_to_keys:
            if registry_key in cls._network_to_keys[network_name]:
                cls._network_to_keys[network_name].remove(registry_key)
            
            # Clean up empty network entries
            if not cls._network_to_keys[network_name]:
                del cls._network_to_keys[network_name]
        
        return True

    @classmethod
    def list_networks(cls) -> List[str]:
        """
        Get a list of all network names that have registered state managers.
        
        :return: List of network names
        """
        return list(cls._network_to_keys.keys())

    @classmethod
    def list_registry_keys(cls) -> List[str]:
        """
        Get a list of all registry keys.
        
        :return: List of registry keys
        """
        return list(cls._managers.keys())

    @classmethod
    def clear_network(cls, network_name: str) -> int:
        """
        Remove all StateManager instances for a given network.
        
        :param network_name: The name of the agent network
        :return: Number of managers removed
        """
        if network_name not in cls._network_to_keys:
            return 0
        
        keys_to_remove = cls._network_to_keys[network_name].copy()
        count = 0
        
        for key in keys_to_remove:
            if cls.unregister(key):
                count += 1
        
        return count

    @classmethod
    def get_global_manager(cls) -> StateManager:
        """
        Get a global StateManager instance for general use.
        This is similar to the old global_state approach but registry-based.
        
        :return: Global StateManager instance
        """
        global_key = "global:default"
        if global_key not in cls._managers:
            cls._managers[global_key] = StateManager()
        return cls._managers[global_key]
