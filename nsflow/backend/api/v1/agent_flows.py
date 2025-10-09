
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
from typing import Any, Dict

from fastapi import HTTPException
from fastapi import APIRouter
from fastapi import Request
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


@router.post(
    "/connectivity/from_json",
    summary="Build connectivity graph from raw JSON (no gRPC, no Pydantic).",
    responses={
        200: {"description": "Connectivity graph built from provided JSON."},
        422: {"description": "Invalid payload. Provide exactly one of the accepted formats."},
        500: {"description": "Failed to build nodes/edges."},
    },
)
async def build_connectivity_from_json(request: Request):
    """
    Accepts ONE of:
      A) connectivity_info: [{ "origin": str, "tools": [str, ...] }, ...]
         -> NsGrpcNetworkUtils.build_nodes_and_edges(...)
      B) agent_network_definition: { "<agent>": { "down_chains": [...], "instructions": str }, ... }
         + optional agent_network_name
         -> NsGrpcNetworkUtils.partial_build_nodes_and_edges(...)
    """
    try:
        data: Dict[str, Any] = await request.json()
    except Exception as e:
        raise HTTPException(status_code=422, detail="Body must be valid JSON") from e

    has_conn = isinstance(data.get("connectivity_info"), list)
    has_state = isinstance(data.get("agent_network_definition"), dict)

    # require exactly one of the two inputs
    if has_conn == has_state:
        raise HTTPException(
            status_code=422,
            detail="Provide exactly one of 'connectivity_info' (list) or 'agent_network_definition' (dict).",
        )

    try:
        utils = NsGrpcNetworkUtils()

        if has_conn:
            # Minimal pass-through shape used by build_nodes_and_edges(...)
            connectivity_response = {"connectivity_info": data["connectivity_info"]}
            result = utils.build_nodes_and_edges(connectivity_response)
            return JSONResponse(content=result)

        # Otherwise: partial build from state dict
        state_dict = {
            "agent_network_name": data.get("agent_network_name", "new_agent_network"),
            "agent_network_definition": data["agent_network_definition"],
        }
        result = utils.partial_build_nodes_and_edges(state_dict)
        return JSONResponse(content=result)

    except HTTPException:
        raise
    except Exception as e:
        logging.exception("Failed to build connectivity from JSON: %s", e)
        raise HTTPException(status_code=500, detail="Failed to build nodes/edges") from e


@router.post(
    "/connectivity/from_json/agents/{agent_name}",
    summary="Get details for a specific agent from raw JSON (no gRPC, no Pydantic).",
    responses={
        200: {"description": "Agent details built from provided JSON."},
        404: {"description": "Agent not found in provided JSON."},
        422: {"description": "Invalid payload. Must include 'agent_network_definition'."},
        500: {"description": "Failed to build agent details."},
    },
)
async def get_agent_details_from_json(agent_name: str, request: Request):
    """Get agent details from json object such as agent_network_definition in a sly data"""
    try:
        data = await request.json()
    except Exception as e:
        raise HTTPException(status_code=422, detail="Body must be valid JSON") from e

    agent_def = data.get("agent_network_definition")
    if not isinstance(agent_def, dict):
        raise HTTPException(
            status_code=422,
            detail="Missing or invalid 'agent_network_definition' (dict required).",
        )

    try:
        utils = NsGrpcNetworkUtils()

        # Normalize keys so everyone sees 'down_chains'
        norm_def = utils.normalize_agent_def(agent_def)
        network_name = data.get("agent_network_name", "new_agent_network")

        details = utils.get_agent_details(
            agent_definition=norm_def,
            agent_name=agent_name,
            network_name=network_name,
            design_id=network_name,
        )

        if details is None:
            # selected agent neither defined nor referenced
            raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found.")

        return JSONResponse(content=details)

    except HTTPException:
        raise
    except Exception as e:
        logging.exception("Failed to build agent details: %s", e)
        raise HTTPException(status_code=500, detail="Failed to build agent details") from e


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
