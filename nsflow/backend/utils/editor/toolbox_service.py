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
Simplified toolbox service for managing toolbox tools.
"""

import os
import logging
from typing import Dict, Any, Optional, Union

from neuro_san.internals.run_context.langchain.toolbox.toolbox_info_restorer import ToolboxInfoRestorer

logger = logging.getLogger(__name__)


class ToolboxService:
    """Simplified service for managing toolbox operations"""
    
    def __init__(self, toolbox_info_file: Optional[str] = None):
        """Initialize toolbox service with optional toolbox info file path"""
        self.toolbox_info_file = toolbox_info_file or os.getenv(
            "AGENT_TOOLBOX_INFO_FILE", 
            "toolbox/toolbox_info.hocon"
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
