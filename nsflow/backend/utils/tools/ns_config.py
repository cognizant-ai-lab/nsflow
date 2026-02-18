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
    connection_type: str = "http"

    @property
    def config_id(self) -> str:
        """Return the url form of a config"""
        return f"{self.connection_type}://{self.host}:{self.port}"

    def to_dict(self):
        """Return the dict form of a config"""
        return {"ns_server_host": self.host, "ns_server_port": self.port, "ns_connection_type": self.connection_type}
