import os
import json
import logging
from typing import Dict, Any
from dotenv import load_dotenv

from fastapi import HTTPException
import grpc
from neuro_san.interfaces.async_agent_session import AsyncAgentSession
from neuro_san.interfaces.concierge_session import ConciergeSession
from neuro_san.session.grpc_concierge_session import GrpcConciergeSession
from neuro_san.session.async_grpc_service_agent_session import AsyncGrpcServiceAgentSession
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
                 forwarded_request_metadata: str = DEFAULT_FORWARDED_REQUEST_METADATA,
                 host: str = None,
                 port: int = None):
        self.root_dir = os.getcwd()
        self.load_env_variables()
        self.server_host = host or os.getenv("NS_SERVER_HOST", "localhost")
        self.server_port = port or int(os.getenv("NS_SERVER_PORT", "30015"))
        self.forwarded_request_metadata = forwarded_request_metadata.split(" ")
        self.logger = logging.getLogger(self.__class__.__name__)

    def load_env_variables(self):
        """
        Loads environment variables from a .env file in the current root directory.
        """
        env_path = os.path.join(self.root_dir, ".env")
        if os.path.exists(env_path):
            load_dotenv(env_path)
            logging.info("Loaded env vars from .env")
        else:
            logging.warning("No .env file found")

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
                host="localhost",
                port=self.port,
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
                host="localhost",
                port=self.port,
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
