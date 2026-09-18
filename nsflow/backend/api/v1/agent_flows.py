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
from typing import Any
from typing import Dict

from fastapi import APIRouter
from fastapi import HTTPException
from fastapi.responses import JSONResponse
from leaf_common.persistence.easy.easy_hocon_persistence import EasyHoconPersistence

from nsflow.backend.utils.agentutils.agent_network_utils import AgentNetworkUtils
from nsflow.backend.utils.agentutils.ns_network_utils import NsNetworkUtils
from nsflow.backend.utils.agentutils.ns_websocket_utils import NsWebsocketUtils
from nsflow.backend.utils.agentutils.served_networks import resolve_served_network

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
    "/network_definition/{network_name:path}",
    responses={
        200: {"description": "Network definition found"},
        400: {"description": "Invalid network name"},
        404: {"description": "Network not found"},
    },
)
async def get_network_definition(network_name: str):
    """Converts a HOCON agent network into an agent_network_definition dict for the editor."""
    # Looked up in the manifest rather than joined onto a directory. The old path was
    # the literal "registries/<name>.hocon", which is relative and so only resolved when
    # the server happened to be started from a project root with a registries/ beside
    # it. Everywhere else this 404d, and since the Editor fills its canvas from here,
    # every existing network opened blank.
    #
    # Going through the manifest fixes where it looks and what it will open in one go:
    # the name selects a manifest entry and the path comes from that entry, so a name
    # from the URL is never part of the path and cannot walk out of the registry.
    hocon_path = resolve_served_network(network_name)
    if hocon_path is None:
        raise HTTPException(status_code=404, detail=f"Network '{network_name}' not found")

    try:
        hocon = EasyHoconPersistence(full_ref=hocon_path, must_exist=True)
        config = hocon.restore()
    except (FileNotFoundError, TypeError) as e:
        raise HTTPException(status_code=404, detail=f"Network '{network_name}' not found") from e
    except Exception as e:
        logging.exception("Failed to load network '%s': %s", network_name, e)
        raise HTTPException(status_code=500, detail="Failed to load network definition") from e

    tools = config.get("tools", [])

    agent_network_definition: Dict[str, Any] = {}
    for tool in tools:
        if not isinstance(tool, dict) or "name" not in tool:
            continue

        name = tool["name"]
        has_class = "class" in tool
        has_toolbox = "toolbox" in tool

        if has_toolbox or has_class:
            # Toolbox tools and coded tools: empty dict in sly_data
            # (same as AND's CreateNetwork for is_tool=True)
            agent_network_definition[name] = {}
        else:
            # Agent nodes: include instructions and use "tools" key for children
            # (matches AND's UpdateAgent which sets network_def[agent]["tools"])
            agent_def: Dict[str, Any] = {
                "instructions": tool.get("instructions", ""),
            }
            child_tools = tool.get("tools", [])
            if child_tools:
                agent_def["tools"] = child_tools
            agent_network_definition[name] = agent_def

    return JSONResponse(
        content={
            "agent_network_definition": agent_network_definition,
            "agent_network_name": network_name,
        }
    )


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
