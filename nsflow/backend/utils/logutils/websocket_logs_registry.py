
# Copyright © 2025 Cognizant Technology Solutions Corp, www.cognizant.com.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# END COPYRIGHT
"""
Manages a global registry of WebsocketLogsManager instances, scoped by agent name.

This allows consistent reuse of log managers across different components
(e.g., WebSocket handlers, services) while avoiding redundant instantiations.
"""

from typing import Dict
from nsflow.backend.utils.logutils.websocket_logs_manager import WebsocketLogsManager


# pylint: disable=too-few-public-methods
class LogsRegistry:
    """
    Registry for shared WebsocketLogsManager instances.
    Provides a way to access or create logs managers scoped by `agent_name` and `session_id`,
    ensuring isolated broadcasting of logs and internal chat messages per user session.
    """

    _managers: Dict[str, WebsocketLogsManager] = {}

    @classmethod
    def register(cls, agent_name: str = "global", session_id: str = "global") -> WebsocketLogsManager:
        """
        Retrieve a WebsocketLogsManager for the given agent name and session ID.

        If an instance does not already exist for the specified agent_name:session_id pair,
        a new one is created and stored. This ensures that each user session has its own
        isolated logs manager, preventing message cross-contamination in multi-user scenarios.

        :param agent_name: The name of the agent to get the log manager for.
                           Defaults to "global" for shared/global logging.
        :param session_id: The unique session identifier for this user connection.
                          Defaults to "global" for backward compatibility.
        :return: A WebsocketLogsManager instance tied to the given agent_name:session_id pair.
        """
        key = f"{agent_name}:{session_id}"
        if key not in cls._managers:
            cls._managers[key] = WebsocketLogsManager(agent_name, session_id)
        return cls._managers[key]
