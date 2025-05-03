
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

class NsConfigStore:
    def __init__(self, host: str, port: int):
        self.config: Dict[str, any] = {
            "ns_server_host": host,
            "ns_server_port": port
        }
        self.logger = logging.getLogger(self.__class__.__name__)
        self.logger.info("NsConfigStore initialized with host: %s, port: %s", host, str(port))

    def reset_config(self):
        self.config.clear()
        self.logger.info("Configuration reset to default values.")
