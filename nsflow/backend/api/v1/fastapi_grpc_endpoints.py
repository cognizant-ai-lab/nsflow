from typing import Dict, Any
import logging
import json

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from google.protobuf.json_format import MessageToDict

from nsflow.backend.models.chat_request_model import ChatRequestModel
from nsflow.backend.utils.ns_grpc_service_utils import NsGrpcServiceUtils

router = APIRouter(prefix="/api/v1")


@router.post("/streaming_chat/{agent_name}")
async def streaming_chat(agent_name: str, chat_request: ChatRequestModel, request: Request):
    """
    Streaming POST endpoint for Neuro-SAN chat using gRPC.

    :param agent_name: The name of the target agent.
    :param request: FastAPI Request with JSON body and headers.
    :return: StreamingResponse that yields JSON lines.
    """
    grpc_service_utils = NsGrpcServiceUtils(agent_name=agent_name)
    try:
        response_generator = await grpc_service_utils.stream_chat(
            agent_name=agent_name,
            chat_request=chat_request.model_dump(),
            request=request
        )

        async def json_line_stream():
            async for subgen in response_generator:
                async for message in subgen:
                    message_dict = MessageToDict(message)
                    yield json.dumps(message_dict) + "\n"

        return StreamingResponse(json_line_stream(), media_type="application/json-lines")

    except Exception as e:
        logging.exception("Failed to stream chat response: %s", e)
        raise HTTPException(status_code=500, detail="Streaming chat failed") from e


@router.get("/list")
async def get_concierge_list(request: Request):
    """
    GET handler for concierge list API.
    Extracts forwarded metadata from headers and uses the utility class to call gRPC.

    :param request: The FastAPI Request object, used to extract headers.
    :return: JSON response from gRPC service.
    """
    grpc_service_utils = NsGrpcServiceUtils(agent_name=None)
    try:
        # Extract metadata from headers
        metadata: Dict[str, Any] = grpc_service_utils.get_metadata(request)

        # Delegate to utility function
        result = grpc_service_utils.list_concierge(metadata)

        return JSONResponse(content=result)

    except Exception as e:
        logging.exception("Failed to retrieve concierge list: %s", e)
        raise HTTPException(status_code=500, detail="Failed to retrieve concierge list") from e
