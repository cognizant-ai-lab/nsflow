
import os
import logging
from typing import List, Dict, Any
from dotenv import load_dotenv

from neuro_san.service.agent_server import DEFAULT_FORWARDED_REQUEST_METADATA
from neuro_san.session.grpc_concierge_session import GrpcConciergeSession


class NsGrpcConciergeUtils:
    """
    Utility class to interact with the concierge gRPC service.
    """

    def __init__(self,
                 forwarded_request_metadata: List[str] = DEFAULT_FORWARDED_REQUEST_METADATA,
                 host: str = None,
                 port: int = None):
        """
        Initialize the concierge gRPC utility.

        :param port: Port where the concierge gRPC service is running.
        :param host: Hostname of the concierge gRPC service.
        """
        self.root_dir = os.getcwd()
        self.load_env_variables()
        self.server_host = host or os.getenv("NS_SERVER_HOST", "localhost")
        self.server_port = port or int(os.getenv("NS_SERVER_PORT", "30015"))
        self.forwarded_request_metadata = forwarded_request_metadata.split(" ")
        self.logger = logging.getLogger(self.__class__.__name__)

    def get_metadata(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extract forwarded metadata from the Request headers.
        :return: Dictionary containing metadata extracted from headers.
        """
        headers: Dict[str, Any] = request.headers
        metadata: Dict[str, Any] = {}
        for item_name in self.forwarded_request_metadata:
            if item_name in headers.keys():
                metadata[item_name] = headers[item_name]
        return metadata

    def list_concierge(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """
        Call the concierge `list()` method via gRPC.

        :param metadata: Metadata to be forwarded with the request (e.g., from headers).
        :return: Dictionary containing the result from the gRPC service.
        """
        try:
            grpc_session = GrpcConciergeSession(
                host=self.server_host,
                port=self.server_port,
                metadata=metadata
            )
            request_data: Dict[str, Any] = {}
            return grpc_session.list(request_data)
        except Exception as e:
            self.logger.exception("Failed to fetch concierge list")
            raise

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