
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
import os
import logging
from typing import Dict, Any
from dotenv import load_dotenv

from fastapi import HTTPException
import grpc
from neuro_san.interfaces.async_agent_session import AsyncAgentSession
from neuro_san.interfaces.concierge_session import ConciergeSession
from neuro_san.session.grpc_concierge_session import GrpcConciergeSession
from neuro_san.session.async_grpc_service_agent_session import AsyncGrpcServiceAgentSession
from neuro_san.session.grpc_service_agent_session import GrpcServiceAgentSession
from nsflow.backend.utils.ns_configs_registry import NsConfigsRegistry
from neuro_san.service.agent_server import DEFAULT_FORWARDED_REQUEST_METADATA


class NsGrpcBaseUtils:
    """
    Utility class to handle streaming chat requests via gRPC.
    """
    grpc_to_http = {
        grpc.StatusCode.INVALID_ARGUMENT: 400,
        grpc.StatusCode.UNAUTHENTICATED: 401,
        grpc.StatusCode.PERMISSION_DENIED: 403,
        grpc.StatusCode.NOT_FOUND: 404,
        grpc.StatusCode.ALREADY_EXISTS: 409,
        grpc.StatusCode.INTERNAL: 500,
        grpc.StatusCode.UNAVAILABLE: 503,
        grpc.StatusCode.DEADLINE_EXCEEDED: 504,
    }

    def __init__(self,
                 agent_name: str,
                 forwarded_request_metadata: str = DEFAULT_FORWARDED_REQUEST_METADATA,
                 host: str = None,
                 port: int = None):
        self.logger = logging.getLogger(self.__class__.__name__)
        try:
            config = NsConfigsRegistry.get_current().config
        except RuntimeError:
            raise RuntimeError("No active NsConfigStore. Please set it via /set_config before using gRPC endpoints.")
        self.logger.info("Using config: %s", config)
        self.server_host = host or config.get("ns_server_host", "localhost")
        self.server_port = port or config.get("ns_server_port", 30015)
        self.agent_name = agent_name
        self.forwarded_request_metadata = forwarded_request_metadata.split(" ")
        

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

    def get_agent_grpc_session(self, metadata: Dict[str, Any]) -> AsyncAgentSession:
        """
        Build gRPC session to talk to "main" service
        :return: AgentSession to use
        """
        grpc_session: AsyncAgentSession = \
            AsyncGrpcServiceAgentSession(
                host=self.server_host,
                port=self.server_port,
                metadata=metadata,
                agent_name=self.agent_name)
        return grpc_session

    def get_regular_agent_grpc_session(self, metadata: Dict[str, Any]) -> AsyncAgentSession:
        """
        Build gRPC session to talk to "main" service
        :return: a non async AgentSession to use
        """
        grpc_session: AsyncAgentSession = \
            GrpcServiceAgentSession(
                host=self.server_host,
                port=self.server_port,
                metadata=metadata,
                agent_name=self.agent_name)
        return grpc_session

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

    def handle_grpc_exception(self, exc: grpc.aio.AioRpcError):
        """
        Raise an HTTPException corresponding to the gRPC error code.
        :param exc: grpc.aio.AioRpcError
        :raises HTTPException: with appropriate status code and details
        """
        code = exc.code()
        http_status = self.grpc_to_http.get(code, 500)
        error_message = f"gRPC error [{code.name}]: {exc.details()}"
        self.logger.error(error_message)
        raise HTTPException(status_code=http_status, detail=error_message)
