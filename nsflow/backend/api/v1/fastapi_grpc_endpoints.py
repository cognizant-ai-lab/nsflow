
# Copyright © 2025 Cognizant Technology Solutions Corp, www.cognizant.com.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
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
