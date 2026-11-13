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
import logging
import os

from fastapi import APIRouter
from fastapi import HTTPException
from fastapi.responses import JSONResponse

from nsflow.backend.utils.agentutils.agent_network_utils import AgentNetworkUtils
from nsflow.backend.utils.agentutils.ns_network_utils import NsNetworkUtils
from nsflow.backend.utils.agentutils.ns_websocket_utils import NsWebsocketUtils

router = APIRouter(prefix="/api/v1")
agent_utils = AgentNetworkUtils()  # Instantiate utility class


@router.get(
    "/connectivity/{network_name:path}",
    responses={200: {"description": "Agent Network found"}, 404: {"description": "Agent Network not found"}},
)
async def get_agent_network(network_name: str):
    """Retrieves the network structure for a given agent network."""
    try:
        ns_utils = NsWebsocketUtils(network_name, None)
        result = ns_utils.get_connectivity()

    except Exception as e:
        logging.exception("Failed to retrieve connectivity info: %s", e)
        raise HTTPException(status_code=500, detail="Failed to retrieve connectivity info") from e

    network_utils = NsNetworkUtils()
    res = network_utils.build_nodes_and_edges(result)
    return JSONResponse(content=res)


@router.get(
    "/compact_connectivity/{network_name:path}",
    responses={200: {"description": "Connectivity Info"}, 404: {"description": "HOCON file not found"}},
)
def get_connectivity_info(network_name: str):
    """Retrieves the network structure for a given local HOCON based agent network."""
    file_path = agent_utils.get_network_file_path(network_name)
    logging.info("network_name: %s", network_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Network name '{network_name}' not found.")
    return agent_utils.parse_agent_network(network_name)


@router.get(
    "/networkconfig/{network_name}",
    responses={200: {"description": "Connectivity Info"}, 404: {"description": "HOCON file not found"}},
)
def get_networkconfig(network_name: str):
    """Retrieves the entire details from a HOCON network configuration file."""
    logging.info("network_name: %s", network_name)
    return agent_utils.get_agent_network(network_name)


@router.get(
    "/networkconfig/{network_name:path}/agent/{agent_name}",
    responses={200: {"description": "Agent Info found"}, 404: {"description": "Info not found"}},
)
def fetch_agent_info(network_name: str, agent_name: str):
    """Retrieves the entire details of an Agent from a HOCON network configuration file."""
    logging.info("network_name: %s, agent_name: %s", network_name, agent_name)
    return agent_utils.get_agent_details(network_name, agent_name)
