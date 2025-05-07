
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
from typing import Dict


# pylint: disable=too-few-public-methods
class NsConfigStore:
    """
    Class to manage configuration settings for the Neuro-San server.
    This class is responsible for storing and retrieving configuration
    parameters such as host and port for the Neuro-San server.
    """
    def __init__(self, host: str, port: int):
        """
        Initialize the configuration store with host and port.
        :param host: Hostname or IP address of the Neuro-San server.
        :param port: Port number for the Neuro-San server.
        """
        self.config: Dict[str, any] = {
            "ns_server_host": host,
            "ns_server_port": port
        }
        self.logger = logging.getLogger(self.__class__.__name__)
        self.logger.info("NsConfigStore initialized with host: %s, port: %s", host, str(port))

    def reset_config(self):
        """
        Reset the configuration to default values.
        This method clears the current configuration and sets it to
        default values.
        """
        self.config.clear()
        self.logger.info("Configuration reset to default values.")
