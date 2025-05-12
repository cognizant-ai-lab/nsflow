
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

from fastapi import HTTPException
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from nsflow.backend.utils.agentutils.agent_network_utils import AgentNetworkUtils
from nsflow.backend.utils.agentutils.ns_grpc_network_utils import NsGrpcNetworkUtils
from nsflow.backend.utils.tools.auth_utils import AuthUtils
from nsflow.backend.models.config_model import ConfigRequest
from nsflow.backend.utils.tools.ns_configs_registry import NsConfigsRegistry
from nsflow.backend.utils.agentutils.ns_grpc_ws_utils import NsGrpcWsUtils

logging.basicConfig(level=logging.INFO)

router = APIRouter(prefix="/api/v1")
agent_utils = AgentNetworkUtils()  # Instantiate utility class


@router.post("/set_ns_config")
async def set_config(config_req: ConfigRequest, _=Depends(AuthUtils.allow_all)):
    """Sets the configuration for the Neuro-SAN server."""
    try:
        connection_type = str(config_req.NEURO_SAN_CONNECTION_TYPE).strip()
        host = str(config_req.NEURO_SAN_SERVER_HOST).strip()
        port = int(config_req.NEURO_SAN_SERVER_PORT)

        if not connection_type or not host or not port:
            raise HTTPException(status_code=400, detail="Missing connectivity type, host or port")

        updated_config = NsConfigsRegistry.set_current(connection_type, host, port)
        return JSONResponse(
            content={
                "message": "Config updated successfully",
                "config": updated_config.to_dict(),
                "config_id": updated_config.config_id
            }
        )

    except Exception as e:
        logging.exception("Failed to set config")
        raise HTTPException(status_code=500, detail="Failed to set config") from e


@router.get("/get_ns_config")
async def get_config(_=Depends(AuthUtils.allow_all)):
    """Returns the current configuration of the Neuro-SAN server."""
    try:
        current_config = NsConfigsRegistry.get_current()
        return JSONResponse(
            content={
                "message": "Config retrieved successfully",
                "config": current_config.to_dict(),
                "config_id": current_config.config_id
            }
        )

    except RuntimeError as e:
        logging.error("Failed to retrieve config: %s", e)
        raise HTTPException(status_code=500, detail="No config has been set yet.") from e


@router.get("/ping", tags=["Health"])
async def health_check():
    """Health check endpoint to verify if the API is alive."""
    return JSONResponse(content={"status": "ok", "message": "API is alive"})


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


@router.get("/compact_connectivity/{network_name}", responses={200: {"description": "Connectivity Info"},
                                                       404: {"description": "HOCON file not found"}})
def get_connectivity_info(network_name: str):
    """Retrieves the network structure for a given local HOCON based agent network."""
    file_path = agent_utils.get_network_file_path(network_name)
    logging.info("file_path: %s", file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Network name '{network_name}' not found.")
    return agent_utils.parse_agent_network(file_path)


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
