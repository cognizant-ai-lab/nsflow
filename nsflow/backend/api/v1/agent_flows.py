
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
import os
import logging
from typing import Dict, Any

from fastapi import HTTPException
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from nsflow.backend.utils.agent_network_utils import AgentNetworkUtils
from nsflow.backend.utils.ns_grpc_service_utils import NsGrpcServiceUtils
from nsflow.backend.utils.ns_grpc_network_utils import NsGrpcNetworkUtils
from nsflow.backend.utils.auth_utils import AuthUtils
from nsflow.backend.models.set_config_model import ConfigRequest
from nsflow.backend.utils.ns_configs_registry import NsConfigsRegistry

logging.basicConfig(level=logging.INFO)

router = APIRouter(prefix="/api/v1")
agent_utils = AgentNetworkUtils()  # Instantiate utility class


@router.post("/set_ns_config")
async def set_config(config_req: ConfigRequest, _=Depends(AuthUtils.allow_all)):
    """Sets the configuration for the Neuro-SAN server."""
    try:
        # Validate the input
        if not config_req.NS_SERVER_HOST or not config_req.NS_SERVER_PORT:
            raise HTTPException(status_code=400, detail="Invalid host or port")
    except ValueError as e:
        logging.error("Invalid host or port: %s", e)
        raise HTTPException(status_code=400, detail="Invalid host or port") from e
    # Set the configuration
    try:
        updated_config = NsConfigsRegistry.set_current(str(config_req.NS_SERVER_HOST), config_req.NS_SERVER_PORT)
        return JSONResponse(content={"message": "Config updated successfully", "config": updated_config.config})
    except RuntimeError as e:
        logging.error("Failed to set config: %s", e)
        raise HTTPException(status_code=500, detail="Failed to set config") from e


@router.get("/get_ns_config")
async def get_config(_=Depends(AuthUtils.allow_all)):
    """Returns the current configuration of the Neuro-SAN server."""
    try:
        config = NsConfigsRegistry.get_current().config
        return JSONResponse(content={"message": "Config retrieved successfully", "config": config})
    except RuntimeError as e:
        logging.error("Failed to retrieve config: %s", e)
        raise HTTPException(status_code=500, detail="Failed to retrieve config") from e


@router.get("/ping", tags=["Health"])
async def health_check():
    """Health check endpoint to verify if the API is alive."""
    return JSONResponse(content={"status": "ok", "message": "API is alive"})


@router.get("/networks/")
def get_networks():
    """Returns a list of available agent networks."""
    return agent_utils.list_available_networks()


@router.get("/network/{network_name}", responses={200: {"description": "Agent Network found"},
                                                  404: {"description": "Agent Network not found"}})
async def get_agent_network(network_name: str):
    """Retrieves the network structure for a given agent network."""
    # file_path = agent_utils.get_network_file_path(network_name)
    # logging.info("file_path: %s", file_path)
    # return agent_utils.parse_agent_network(file_path)
    grpc_service_utils = NsGrpcServiceUtils(agent_name=network_name)
    try:
        # Extract metadata from headers
        metadata: Dict[str, Any] = {}
        # Delegate to utility function
        result = await grpc_service_utils.get_connectivity(metadata, network_name)

    except Exception as e:
        logging.exception("Failed to retrieve connectivity info: %s", e)
        raise HTTPException(status_code=500, detail="Failed to retrieve connectivity info") from e
    
    grpc_network_utils = NsGrpcNetworkUtils()
    res = grpc_network_utils.build_nodes_and_edges(result)
    return JSONResponse(content=res)


@router.get("/connectivity/{network_name}", responses={200: {"description": "Connectivity Info"},
                                                       404: {"description": "HOCON file not found"}})
def get_connectivity_info(network_name: str):
    """Retrieves connectivity details from a HOCON network configuration file."""
    file_path = agent_utils.get_network_file_path(network_name)
    logging.info("file_path: %s", file_path)
    return agent_utils.extract_connectivity_info(file_path)


@router.get("/networkconfig/{network_name}", responses={200: {"description": "Connectivity Info"},
                                                        404: {"description": "HOCON file not found"}})
def get_networkconfig(network_name: str):
    """Retrieves the entire details from a HOCON network configuration file."""
    file_path = agent_utils.get_network_file_path(network_name)
    logging.info("file_path: %s", file_path)
    return agent_utils.load_hocon_config(file_path)


@router.get("/networkconfig/{network_name}/agent/{agent_name}", responses={200: {"description": "Agent Info found"},
                                                                           404: {"description": "Info not found"}})
def fetch_agent_info(network_name: str, agent_name: str):
    """Retrieves the entire details of an Agent from a HOCON network configuration file."""
    file_path = agent_utils.get_network_file_path(network_name)
    logging.info("file_path: %s, agent_name: %s", file_path, agent_name)
    return agent_utils.get_agent_details(file_path, agent_name)
