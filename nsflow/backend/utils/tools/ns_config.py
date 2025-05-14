
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

from dataclasses import dataclass

@dataclass
class NsConfig:
    """
    Class to manage configuration settings for the Neuro-San server.
    This class is responsible for storing and retrieving configuration
    parameters such as connectivity, host and port for the Neuro-San server.
    """
    host: str
    port: int
    connection_type: str = "grpc"

    @property
    def config_id(self) -> str:
        """Return the url form of a config"""
        return f"{self.connection_type}://{self.host}:{self.port}"

    def to_dict(self):
        """Return the dict form of a config"""
        return {
            "ns_server_host": self.host,
            "ns_server_port": self.port,
            "ns_connection_type": self.connection_type
        }

