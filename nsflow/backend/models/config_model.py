
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
from pydantic import BaseModel, Field


class ConfigRequest(BaseModel):
    """
    Represents the configuration request for the NeuroSan server.
    Attributes:
        NS_CONNECTIVITY_TYPE (str): The connectivity type for NeuroSan server
        NS_SERVER_HOST (IPvAnyAddress): The host address of the NeuroSan server.
        NS_SERVER_PORT (int): The port number of the NeuroSan server.
    """
    NEURO_SAN_CONNECTION_TYPE: str = Field(..., description="Connectivity type")
    NEURO_SAN_SERVER_HOST: str = Field(..., description="Host address of the NeuroSan server")
    NEURO_SAN_SERVER_PORT: int = Field(..., ge=0, le=65535)
