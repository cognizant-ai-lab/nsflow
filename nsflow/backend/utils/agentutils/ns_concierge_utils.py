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

import json
import socket
from typing import Any, Dict

import httpx
from fastapi import HTTPException

from nsflow.backend.utils.logutils.websocket_logs_registry import LogsRegistry
from nsflow.backend.utils.tools.ns_configs_registry import NsConfigsRegistry


class NsConciergeUtils:
    """
    Encapsulates concierge session management and interactions for a client.
    """

    DEFAULT_FORWARDED_REQUEST_METADATA: str = "request_id user_id"

    def __init__(self, agent_name: str = None, forwarded_request_metadata: str = DEFAULT_FORWARDED_REQUEST_METADATA):
        """
        Initialize the concierge service API wrapper.
        :param agent_name: This is just for keeping consistency with the logs.
        """
        try:
            config = NsConfigsRegistry.get_current()
        except RuntimeError as e:
            raise RuntimeError(
                "No active NsConfigStore. \
                               Please set it via /set_config before using endpoints."
            ) from e

        self.server_host = config.host
        self.server_port = config.port
        self.connection = config.connection_type

        self.use_direct = False
        self.forwarded_request_metadata = forwarded_request_metadata.split(" ")

        self.logs_manager = LogsRegistry.register(agent_name)

    def get_metadata(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extract forwarded metadata from the Request headers.

        :param headers: Dictionary of incoming request headers.
        :return: Dictionary of metadata.
        """
        headers: Dict[str, Any] = request.headers
        metadata: Dict[str, Any] = {}
        for item_name in self.forwarded_request_metadata:
            if item_name in headers.keys():
                metadata[item_name] = headers[item_name]
        return metadata

    async def list_concierge(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """
        Call the concierge `list()` method via HTTP.

        :param metadata: Metadata to be forwarded with the request (e.g., from headers).
        :return: Dictionary containing the result from the HTTP service.
        """
        # fail fast if the server is not reachable
        # This might not be always true when using a http sidecar for example
        if self.server_host == "localhost" and not self.is_port_open(self.server_host, self.server_port, timeout=5.0):
            raise HTTPException(
                status_code=503, detail=f"NeuroSan server at {self.server_host}:{self.server_port} is not reachable"
            )

        if str(self.server_host) in ("localhost", "127.0.0.1"):
            self.connection = "http"
        if self.server_port == "443":
            url = f"{self.connection}://{self.server_host}/api/v1/list"
        else:
            url = f"{self.connection}://{self.server_host}:{self.server_port}/api/v1/list"

        try:
            async with httpx.AsyncClient(verify=True, headers={"host": self.server_host}) as client:
                response = await client.get(
                    url,
                    headers={
                        "User-Agent": "curl/8.7.1",
                        "Accept": "*/*",
                        "Host": self.server_host,  # important for SNI + proxying
                    },
                )
                try:
                    json_data = response.json()
                except (httpx.HTTPError, json.JSONDecodeError):
                    json_data = {
                        "error": "The NeuroSan Server did not return valid JSON",
                        "status_code": response.status_code,
                        "text": response.text.strip(),
                    }
                return json_data
        except httpx.RequestError as exc:
            await self.logs_manager.log_event(f"Failed to fetch concierge list: {exc}", "NeuroSan")
            raise HTTPException(status_code=502, detail=f"Failed to reach {url}: {str(exc)}") from exc

    def is_port_open(self, host: str, port: int, timeout=1.0) -> bool:
        """
        Check if a port is open on a given host.
        :param host: The hostname or IP address.
        :param port: The port number to check.
        :param timeout: Timeout in seconds for the connection attempt.
        :return: True if the port is open, False otherwise.
        """
        # Create a socket and set a timeout
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(timeout)
            try:
                sock.connect((host, port))
                return True
            except Exception:
                return False
