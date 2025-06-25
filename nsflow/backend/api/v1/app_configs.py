
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
from importlib.metadata import version
from importlib.metadata import PackageNotFoundError

from fastapi import HTTPException
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from nsflow.backend.utils.agentutils.agent_network_utils import AgentNetworkUtils
from nsflow.backend.utils.tools.auth_utils import AuthUtils
from nsflow.backend.models.config_model import ConfigRequest
from nsflow.backend.utils.tools.ns_configs_registry import NsConfigsRegistry

logging.basicConfig(level=logging.INFO)

router = APIRouter(prefix="/api/v1")
agent_utils = AgentNetworkUtils()  # Instantiate utility class


@router.get("/vite_config.json")
def get_runtime_config():
    """Router to enable variables for react app"""
    return JSONResponse(content={
        "NSFLOW_HOST": os.getenv("NSFLOW_HOST", "localhost"),
        "NSFLOW_PORT": os.getenv("NSFLOW_PORT", "4173"),
        "VITE_API_PROTOCOL": os.getenv("VITE_API_PROTOCOL", "http"),
        "VITE_WS_PROTOCOL": os.getenv("VITE_WS_PROTOCOL", "ws"),
    })


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


def get_version(package_name: str):
    """Get the version from installed package"""
    try:
        # Fetch version from installed package
        return version(package_name)
    except PackageNotFoundError as e:
        logging.error("Package '%s' not found: %s", package_name, e)
        return "not found"


@router.get("/version/{package_name}")
async def fetch_version(package_name: str):
    """Get the version from installed package"""
    return {"version": get_version(package_name)}