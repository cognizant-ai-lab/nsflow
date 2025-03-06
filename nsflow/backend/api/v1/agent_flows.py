# nsflow/backend/api/v1/agent_flows.py

import os
import logging
from pathlib import Path
from fastapi import APIRouter
from nsflow.backend.utils.agent_network_utils import AgentNetworkUtils

logging.basicConfig(level=logging.INFO)

router = APIRouter(prefix="/api/v1")
agent_utils = AgentNetworkUtils()  # Instantiate utility class


@router.get("/networks/")
def get_networks():
    """Returns a list of available agent networks."""
    return agent_utils.list_available_networks()


@router.get("/network/{network_name}")
def get_agent_network(network_name: str):
    """Retrieves the network structure for a given agent network."""
    file_path = Path(os.path.join(agent_utils.registry_dir, f"{network_name}.hocon"))
    logging.info("file_path: %s", file_path)
    return agent_utils.parse_agent_network(file_path)


@router.get("/connectivity/{network_name}")
def get_connectivity_info(network_name: str):
    """Retrieves connectivity details from an HOCON network configuration file."""
    file_path = Path(os.path.join(agent_utils.registry_dir, f"{network_name}.hocon"))
    return agent_utils.extract_connectivity_info(file_path)
