
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
import logging
import os

from fastapi import HTTPException
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from nsflow.backend.utils.agentutils.agent_network_utils import AgentNetworkUtils
from nsflow.backend.utils.agentutils.ns_grpc_network_utils import NsGrpcNetworkUtils
from nsflow.backend.utils.agentutils.ns_grpc_ws_utils import NsGrpcWsUtils

logging.basicConfig(level=logging.INFO)

router = APIRouter(prefix="/api/v1")
agent_utils = AgentNetworkUtils()  # Instantiate utility class


@router.get("/networks/")
def get_networks():
    """Returns a list of available agent networks."""
    return agent_utils.list_available_networks()


@router.get("/connectivity/{network_name}", responses={200: {"description": "Agent Network found"},
                                                  404: {"description": "Agent Network not found"}})
async def get_agent_network(network_name: str):
    """Retrieves the network structure for a given agent network."""
    try:
        ns_grpc_utils = NsGrpcWsUtils(network_name, None)
        result = ns_grpc_utils.get_connectivity()

    except Exception as e:
        logging.exception("Failed to retrieve connectivity info: %s", e)
        raise HTTPException(status_code=500, detail="Failed to retrieve connectivity info") from e

    grpc_network_utils = NsGrpcNetworkUtils()
    res = grpc_network_utils.build_nodes_and_edges(result)
    return JSONResponse(content=res)


@router.get("/slydata/{network_name}", responses={200: {"description": "Latest SlyData found"},
                                                  404: {"description": "No SlyData available"}})
def get_latest_sly_data(network_name: str):
    """Retrieves the latest sly_data for a given network."""
    logging.info("Fetching latest sly_data for network: %s", network_name)
    try:
        latest_data = NsGrpcWsUtils.get_latest_sly_data(network_name)
        
        if not latest_data:
            raise HTTPException(status_code=404, detail=f"No sly_data available for network '{network_name}'")
        
        return JSONResponse(content={"network_name": network_name, "sly_data": latest_data})
        
    except Exception as e:
        logging.exception("Failed to retrieve sly_data for network %s: %s", network_name, e)
        raise HTTPException(status_code=500, detail="Failed to retrieve sly_data") from e


@router.get("/compact_connectivity/{network_name}", responses={200: {"description": "Connectivity Info"},
                                                       404: {"description": "HOCON file not found"}})
def get_connectivity_info(network_name: str):
    """Retrieves the network structure for a given local HOCON based agent network."""
    file_path = agent_utils.get_network_file_path(network_name)
    logging.info("network_name: %s", network_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Network name '{network_name}' not found.")
    return agent_utils.parse_agent_network(network_name)


@router.get("/networkconfig/{network_name}", responses={200: {"description": "Connectivity Info"},
                                                        404: {"description": "HOCON file not found"}})
def get_networkconfig(network_name: str):
    """Retrieves the entire details from a HOCON network configuration file."""
    logging.info("network_name: %s", network_name)
    return agent_utils.get_agent_network(network_name)


@router.get("/networkconfig/{network_name}/agent/{agent_name}", responses={200: {"description": "Agent Info found"},
                                                                           404: {"description": "Info not found"}})
def fetch_agent_info(network_name: str, agent_name: str):
    """Retrieves the entire details of an Agent from a HOCON network configuration file."""
    logging.info("network_name: %s, agent_name: %s", network_name, agent_name)
    return agent_utils.get_agent_details(network_name, agent_name)
