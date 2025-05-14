
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

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse

from nsflow.backend.utils.agentutils.ns_concierge_utils import NsConciergeUtils

router = APIRouter(prefix="/api/v1")


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
