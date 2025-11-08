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
