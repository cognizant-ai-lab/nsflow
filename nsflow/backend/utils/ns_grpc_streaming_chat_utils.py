import os
import json
import logging
from typing import Dict, Generator, Any
from dotenv import load_dotenv

from google.protobuf.json_format import Parse
from neuro_san.api.grpc.agent_pb2 import ChatRequest
from neuro_san.session.async_grpc_service_agent_session import AsyncGrpcServiceAgentSession
from neuro_san.service.agent_server import DEFAULT_FORWARDED_REQUEST_METADATA


class NsGrpcStreamingChatUtils:
    """
    Utility class to handle streaming chat requests via gRPC.
    """

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

    async def stream_chat(self, agent_name: str, chat_request: Dict[str, Any], request: Dict[str, Any]) -> Generator:
        """
        Connect to the gRPC streaming_chat method and yield protobuf results.

        :param agent_name: Name of the agent to connect to.
        :param chat_request: Parsed JSON chat request.
        :param headers: Request headers for metadata extraction.
        :return: Generator of ChatResponse protobufs.
        """
        metadata = self.get_metadata(request)
        grpc_session = AsyncGrpcServiceAgentSession(
            host=self.server_host,
            port=self.server_port,
            metadata=metadata,
            agent_name=agent_name
        )
        grpc_request = Parse(json.dumps(chat_request), ChatRequest())
        return grpc_session.streaming_chat(grpc_request)
