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
Simplified toolbox service for managing toolbox tools.
"""

import logging
import os
from typing import Any, Dict, Optional, Union

from neuro_san.internals.run_context.langchain.toolbox.toolbox_info_restorer import ToolboxInfoRestorer

logger = logging.getLogger(__name__)


class ToolboxService:
    """Simplified service for managing toolbox operations"""

    def __init__(self, toolbox_info_file: Optional[str] = None):
        """Initialize toolbox service with optional toolbox info file path"""
        self.toolbox_info_file = toolbox_info_file or os.getenv(
            "AGENT_TOOLBOX_INFO_FILE", "toolbox/toolbox_info.hocon"
        )

    def get_available_tools(self) -> Union[Dict[str, Any], str]:
        """
        Get list of available tools from toolbox info file.

        Returns:
            Dictionary containing tools if available, or error message string
        """
        try:
            logger.info(">>>>>>>>>>>>>>>>>>>Getting Tool Definition from Toolbox>>>>>>>>>>>>>>>>>>>")
            logger.info("Toolbox info file: %s", self.toolbox_info_file)
            tools: Dict[str, Any] = ToolboxInfoRestorer().restore(self.toolbox_info_file)
            logger.info("Successfully loaded toolbox info from %s", self.toolbox_info_file)
            return tools
        except FileNotFoundError as not_found_err:
            error_msg = f"Error: Failed to load toolbox info from {self.toolbox_info_file}. {str(not_found_err)}"
            logger.warning(error_msg)
            return error_msg
        except Exception as e:
            error_msg = f"Error: Failed to load toolbox info from {self.toolbox_info_file}. {str(e)}"
            logger.warning(error_msg)
            return error_msg


# Global instance
_toolbox_service: Optional[ToolboxService] = None


def get_toolbox_service(toolbox_info_file: Optional[str] = None) -> ToolboxService:
    """Get or create the toolbox service instance"""
    global _toolbox_service
    if _toolbox_service is None or toolbox_info_file:
        _toolbox_service = ToolboxService(toolbox_info_file)
    return _toolbox_service
