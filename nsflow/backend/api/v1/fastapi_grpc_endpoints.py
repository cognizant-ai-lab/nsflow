
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
import logging
import json
import socket
import httpx

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from google.protobuf.json_format import MessageToDict

from nsflow.backend.models.chat_request_model import ChatRequestModel
# from nsflow.backend.utils.ns_grpc_service_utils import NsGrpcServiceUtils
from nsflow.backend.utils.ns_concierge_utils import NsConciergeUtils

router = APIRouter(prefix="/api/v1")


# @router.post("/{agent_name}/streaming_chat")
# async def streaming_chat(agent_name: str, chat_request: ChatRequestModel, request: Request):
#     """
#     Streaming POST endpoint for Neuro-SAN chat using gRPC.

#     :param agent_name: The name of the target agent.
#     :param request: FastAPI Request with JSON body and headers.
#     :return: StreamingResponse that yields JSON lines.
#     """
#     try:
#         grpc_service_utils = NsGrpcServiceUtils(agent_name=agent_name)
#         response_generator = await grpc_service_utils.stream_chat(
#             agent_name=agent_name,
#             chat_request=chat_request.model_dump(),
#             request=request
#         )

#         async def json_line_stream():
#             async for subgen in response_generator:
#                 async for message in subgen:
#                     message_dict = MessageToDict(message)
#                     yield json.dumps(message_dict) + "\n"

#         return StreamingResponse(json_line_stream(), media_type="application/json-lines")

#     except Exception as e:
#         logging.exception("Failed to stream chat response: %s", e)
#         raise HTTPException(status_code=500, detail="Streaming chat failed") from e


@router.get("/list")
async def get_concierge_list(request: Request):
    """
    GET handler for concierge list API.
    Extracts forwarded metadata from headers and uses the utility class to call gRPC.

    :param request: The FastAPI Request object, used to extract headers.
    :return: JSON response from gRPC service.
    """
    # common class for both grpc and https/https
    ns_concierge_utils = NsConciergeUtils()
    try:
        # Extract metadata from headers
        metadata: Dict[str, Any] = ns_concierge_utils.get_metadata(request)

        # Delegate to utility function
        result = await ns_concierge_utils.list_concierge(metadata)

        return JSONResponse(content=result)

    except Exception as e:
        logging.exception("Failed to retrieve concierge list: %s", e)
        raise HTTPException(status_code=500, detail="Failed to retrieve concierge list") from e


    # # for gRPC based connection
    # grpc_service_utils = NsGrpcServiceUtils(agent_name=None)
    # host = grpc_service_utils.server_host
    # port = grpc_service_utils.server_port
    # # fail fast if the server is not reachable
    # # This might not be always true when using a http sidecar for example
    # if host == "localhost" and not is_port_open(host, port, timeout=5.0):
    #     raise HTTPException(
    #         status_code=503,
    #         detail=f"NeuroSan server at {host}:{port} is not reachable"
    #     )

    # try:
    #     # Extract metadata from headers
    #     metadata: Dict[str, Any] = grpc_service_utils.get_metadata(request)

    #     # Delegate to utility function
    #     result = grpc_service_utils.list_concierge(metadata)

    #     return JSONResponse(content=result)

    # except Exception as e:
    #     logging.exception("Failed to retrieve concierge list: %s", e)
    #     raise HTTPException(status_code=500, detail="Failed to retrieve concierge list") from e
    
    # # for http/https based connection
    # protocol_prefix = "https"
    # host = request.query_params.get("host", "abcd.ml")
    # port = request.query_params.get("port", "443")
    # # url = f"https://{host}:{port}/api/v1/list"
    # if str(host) in ("localhost", "127.0.0.1"):
    #     protocol_prefix = "http"
    # if port == "443":
    #     url = f"{protocol_prefix}://{host}/api/v1/list"
    # else:
    #     url = f"{protocol_prefix}://{host}:{port}/api/v1/list"

    # try:
    #     async with httpx.AsyncClient(verify=True, headers={"host": host}) as client:  # consider verify=True in prod
    #         response = await client.get(url, headers={
    #             "User-Agent": "curl/8.7.1",
    #             "Accept": "*/*",
    #             "Host": host  # important for SNI + proxying
    #             })
    #         try:
    #             json_data = response.json()
    #             logging.info("Response status: %s, response.text: %s", response.status_code, response.text)
    #         except (httpx.HTTPError, json.JSONDecodeError):
    #             json_data = {
    #                 "error": "Tornado did not return valid JSON",
    #                 "status_code": response.status_code,
    #                 "text": response.text.strip()
    #             }
    #         return JSONResponse(content=json_data, status_code=response.status_code)
    # except httpx.RequestError as exc:
    #     raise HTTPException(status_code=502, detail=f"Failed to reach {url}: {str(exc)}")


# @router.get("/{agent_name}/connectivity")
# async def get_connectivity(agent_name: str, request: Request):
#     """
#     GET handler for connectivity API.
#     Extracts forwarded metadata from headers and uses the utility class to call gRPC.

#     :param agent_name: The name of the target agent.
#     :param request: The FastAPI Request object, used to extract headers.
#     :return: JSON response from gRPC service.
#     """
#     grpc_service_utils = NsGrpcServiceUtils(agent_name=agent_name)
#     try:
#         # Extract metadata from headers
#         metadata: Dict[str, Any] = grpc_service_utils.get_metadata(request)

#         # Delegate to utility function
#         result = await grpc_service_utils.get_connectivity(metadata, agent_name)

#         return JSONResponse(content=result)

#     except Exception as e:
#         logging.exception("Failed to retrieve connectivity info: %s", e)
#         raise HTTPException(status_code=500, detail="Failed to retrieve connectivity info") from e


# @router.get("/{agent_name}/function")
# async def get_function(agent_name: str, request: Request):
#     """
#     GET handler for function API.
#     Extracts forwarded metadata from headers and uses the utility class to call gRPC.

#     :param agent_name: The name of the target agent.
#     :param request: The FastAPI Request object, used to extract headers.
#     :return: JSON response from gRPC service.
#     """
#     grpc_service_utils = NsGrpcServiceUtils(agent_name=agent_name)
#     try:
#         # Extract metadata from headers
#         metadata: Dict[str, Any] = grpc_service_utils.get_metadata(request)

#         # Delegate to utility function
#         result = await grpc_service_utils.get_function(metadata, agent_name)

#         return JSONResponse(content=result)

#     except Exception as e:
#         logging.exception("Failed to retrieve function info: %s", e)
#         raise HTTPException(status_code=500, detail="Failed to retrieve function info") from e


# def is_port_open(host: str, port: int, timeout=1.0) -> bool:
#     """
#     Check if a port is open on a given host.
#     :param host: The hostname or IP address.
#     :param port: The port number to check.
#     :param timeout: Timeout in seconds for the connection attempt.
#     :return: True if the port is open, False otherwise.
#     """
#     # Create a socket and set a timeout
#     with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
#         sock.settimeout(timeout)
#         try:
#             sock.connect((host, port))
#             return True
#         except Exception:
#             return False
