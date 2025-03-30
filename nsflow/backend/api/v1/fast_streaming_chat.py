
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
import logging
import json
from google.protobuf.json_format import MessageToDict

from nsflow.backend.models.chat_request_model import ChatRequestModel
from nsflow.backend.utils.ns_grpc_streaming_chat_utils import NsGrpcStreamingChatUtils

router = APIRouter(prefix="/api/v1")
grpc_utils = NsGrpcStreamingChatUtils()


@router.post("/streaming_chat/{agent_name}")
async def streaming_chat(agent_name: str, chat_request: ChatRequestModel, request: Request):
    """
    Streaming POST endpoint for Neuro-SAN chat using gRPC.

    :param agent_name: The name of the target agent.
    :param request: FastAPI Request with JSON body and headers.
    :return: StreamingResponse that yields JSON lines.
    """

    try:
        response_generator = await grpc_utils.stream_chat(
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
        logging.exception("Failed to stream chat response")
        raise HTTPException(status_code=500, detail="Streaming chat failed")
