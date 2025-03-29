"""
Registry for shared WebsocketLogsManager instances.

This module provides a global dictionary to ensure that each agent_name
has exactly one WebsocketLogsManager instance, allowing shared log
streaming and internal chat broadcasting across the application.
"""

from typing import Dict
from nsflow.backend.utils.websocket_logs_manager import WebsocketLogsManager

_logs_managers: Dict[str, WebsocketLogsManager] = {}


def get_logs_manager(agent_name: str = "global") -> WebsocketLogsManager:
    """
    Retrieve a shared WebsocketLogsManager instance for a given agent.

    If an instance does not already exist for the specified agent_name,
    a new one is created and stored. This ensures that all components
    interacting with the same agent share the same logs manager.

    :param agent_name: The name of the agent to get the log manager for.
                       Defaults to "global" for shared/global logging.
    :return: A WebsocketLogsManager instance tied to the given agent_name.
    """
    if agent_name not in _logs_managers:
        _logs_managers[agent_name] = WebsocketLogsManager(agent_name)
    return _logs_managers[agent_name]
