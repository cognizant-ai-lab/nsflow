
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

from typing import Dict, Any
import json
import socket
import httpx

from fastapi import HTTPException

from nsflow.backend.utils.websocket_logs_registry import LogsRegistry
from nsflow.backend.utils.ns_configs_registry import NsConfigsRegistry

from neuro_san.interfaces.concierge_session import ConciergeSession
from neuro_san.session.grpc_concierge_session import GrpcConciergeSession
from neuro_san.service.agent_server import DEFAULT_FORWARDED_REQUEST_METADATA

class NsConciergeUtils:
    """
    Encapsulates concierge session management and interactions for a client.
    """
    def __init__(self,
                 agent_name: str=None,
                 forwarded_request_metadata: str = DEFAULT_FORWARDED_REQUEST_METADATA):
        """
        Initialize the gRPC service API wrapper.
        :param agent_name: This is just for keeping consistency with the logs.
        """
        try:
            config = NsConfigsRegistry.get_current()
        except RuntimeError as e:
            raise RuntimeError("No active NsConfigStore. \
                               Please set it via /set_config before using gRPC endpoints.") from e
        
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
        :return: Dictionary of gRPC metadata.
        """
        headers: Dict[str, Any] = request.headers
        metadata: Dict[str, Any] = {}
        for item_name in self.forwarded_request_metadata:
            if item_name in headers.keys():
                metadata[item_name] = headers[item_name]
        return metadata

    def get_concierge_grpc_session(self, metadata: Dict[str, Any]) -> ConciergeSession:
        """
        Build gRPC session to talk to "concierge" service
        :return: ConciergeSession to use
        """
        grpc_session: ConciergeSession = \
            GrpcConciergeSession(
                host=self.server_host,
                port=self.server_port,
                metadata=metadata)
        return grpc_session
    
    async def list_concierge(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """
        Call the concierge `list()` method via gRPC.

        :param metadata: Metadata to be forwarded with the request (e.g., from headers).
        :return: Dictionary containing the result from the gRPC service.
        """
        # fail fast if the server is not reachable
        # This might not be always true when using a http sidecar for example
        if self.server_host == "localhost" and not self.is_port_open(self.server_host, self.server_port, timeout=5.0):
            raise HTTPException(
                status_code=503,
                detail=f"NeuroSan server at {self.server_host}:{self.server_port} is not reachable"
            )

        if self.connection == "grpc":
            try:
                grpc_session = self.get_concierge_grpc_session(metadata=metadata)
                request_data: Dict[str, Any] = {}
                return grpc_session.list(request_data)
            except Exception as e:
                await self.logs_manager.log_event(f"Failed to fetch concierge list: {e}", "NeuroSan")
                raise
        else:
            if str(self.server_host) in ("localhost", "127.0.0.1"):
                self.connection = "http"
            if self.server_port == "443":
                url = f"{self.connection}://{self.server_host}/api/v1/list"
            else:
                url = f"{self.connection}://{self.server_host}:{self.server_port}/api/v1/list"

            try:
                async with httpx.AsyncClient(verify=True, headers={"host": self.server_host}) as client:  # consider verify=True in prod
                    response = await client.get(url, headers={
                        "User-Agent": "curl/8.7.1",
                        "Accept": "*/*",
                        "Host": self.server_host  # important for SNI + proxying
                        })
                    try:
                        json_data = response.json()
                        # await self.logs_manager.log_event(f"Response status: {response.status_code}, response.text: {response.text}", "NeuroSan")
                    except (httpx.HTTPError, json.JSONDecodeError):
                        json_data = {
                            "error": "The NeuroSan Server did not return valid JSON",
                            "status_code": response.status_code,
                            "text": response.text.strip()
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
