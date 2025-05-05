
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

import json
from typing import Dict, Generator, Any

import grpc
from google.protobuf.json_format import Parse
# pylint: disable=no-name-in-module
from neuro_san.api.grpc.agent_pb2 import ChatRequest
from neuro_san.session.async_grpc_service_agent_session import AsyncGrpcServiceAgentSession
from neuro_san.session.grpc_concierge_session import GrpcConciergeSession

from nsflow.backend.utils.ns_grpc_base_utils import NsGrpcBaseUtils


class NsGrpcServiceUtils(NsGrpcBaseUtils):
    """
    Utility class to handle streaming chat requests via gRPC.
    """
    async def stream_chat(self, agent_name: str, chat_request: Dict[str, Any], request: Dict[str, Any]) -> Generator:
        """
        Connect to the gRPC streaming_chat method and yield protobuf results.

        :param agent_name: Name of the agent to connect to.
        :param chat_request: Parsed JSON chat request.
        :param headers: Request headers for metadata extraction.
        :return: Generator of ChatResponse protobufs.
        """
        metadata = self.get_metadata(request)
        grpc_request = Parse(json.dumps(chat_request), ChatRequest())

        try:
            grpc_session = AsyncGrpcServiceAgentSession(
                host=self.server_host,
                port=self.server_port,
                metadata=metadata,
                agent_name=agent_name
            )
            return grpc_session.streaming_chat(grpc_request)

        except grpc.aio.AioRpcError as exc:
            self.handle_grpc_exception(exc)

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
            self.logger.exception("Failed to fetch concierge list: %s", e)
            raise

    def get_connectivity(self, metadata: Dict[str, Any], agent_name: str) -> Dict[str, Any]:
        """
        Call the concierge `connectivity()` method via gRPC.

        :param metadata: Metadata to be forwarded with the request (e.g., from headers).
        :return: Dictionary containing the result from the gRPC service.
        """
        try:
            grpc_session = AsyncGrpcServiceAgentSession(
                host=self.server_host,
                port=self.server_port,
                metadata=metadata,
                agent_name=agent_name
            )
            request_data: Dict[str, Any] = {}
            return grpc_session.connectivity(request_data)
        except Exception as e:
            self.logger.exception("Failed to fetch connectivity info: %s", e)
            raise