"""
Manages a global registry of WebsocketLogsManager instances, scoped by agent name.

This allows consistent reuse of log managers across different components
(e.g., WebSocket handlers, services) while avoiding redundant instantiations.
"""

from typing import Dict
from nsflow.backend.utils.websocket_logs_manager import WebsocketLogsManager

# pylint: disable=too-few-public-methods
class LogsRegistry:
    """
    Registry for shared WebsocketLogsManager instances.
    
    Provides a way to access or create logs managers scoped by `agent_name`,
    ensuring shared broadcasting of logs and internal chat messages.
    """

    _managers: Dict[str, WebsocketLogsManager] = {}

    @classmethod
    def register(cls, agent_name: str = "global") -> WebsocketLogsManager:
        """
        Retrieve a WebsocketLogsManager for the given agent name.

        If an instance does not already exist for the specified agent_name,
        a new one is created and stored. This ensures that all components
        interacting with the same agent share the same logs manager.
        :param agent_name: The name of the agent to get the log manager for.
                           Defaults to "global" for shared/global logging.
        :return: A WebsocketLogsManager instance tied to the given agent_name.
        """
        if agent_name not in cls._managers:
            cls._managers[agent_name] = WebsocketLogsManager(agent_name)
        return cls._managers[agent_name]
