from typing import Dict, Any

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
import logging

from nsflow.backend.utils.ns_grpc_concierge_utils import NsGrpcConciergeUtils

router = APIRouter(prefix="/api/v1")

grpc_utils = NsGrpcConciergeUtils()


@router.get("/list")
async def get_concierge_list(request: Request):
    """
    GET handler for concierge list API.
    Extracts forwarded metadata from headers and uses the utility class to call gRPC.

    :param request: The FastAPI Request object, used to extract headers.
    :return: JSON response from gRPC service.
    """
    try:
        # Extract metadata from headers
        metadata: Dict[str, Any] = grpc_utils.get_metadata(request)

        # Delegate to utility function
        result = grpc_utils.list_concierge(metadata)

        return JSONResponse(content=result)

    except Exception:
        logging.exception("Failed to retrieve concierge list")
        raise HTTPException(status_code=500, detail="Failed to retrieve concierge list")
