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
from importlib.metadata import PackageNotFoundError, version

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from nsflow.backend.models.config_model import ConfigRequest
from nsflow.backend.utils.tools.auth_utils import AuthUtils
from nsflow.backend.utils.tools.ns_configs_registry import NsConfigsRegistry

router = APIRouter(prefix="/api/v1")


TRUTH_VALUES = ["1", "true", "yes", "on"]


def _env_bool(name: str, default: bool = False) -> bool:
    val = os.getenv(name)
    if val is None:
        return default
    return val.strip().lower() in TRUTH_VALUES


@router.get("/vite_config.json")
def get_runtime_config():
    """Router to enable variables for react app"""
    return JSONResponse(
        content={
            "NSFLOW_HOST": os.getenv("NSFLOW_HOST", "localhost"),
            "NSFLOW_PORT": os.getenv("NSFLOW_PORT", "4173"),
            "VITE_API_PROTOCOL": os.getenv("VITE_API_PROTOCOL", "http"),
            "VITE_WS_PROTOCOL": os.getenv("VITE_WS_PROTOCOL", "ws"),
            "VITE_USE_SPEECH": os.getenv("VITE_USE_SPEECH", True),
            "NSFLOW_WAND_NAME": os.getenv("NSFLOW_WAND_NAME", "agent_network_designer"),
            # NEW: feature flags (booleans)
            "NSFLOW_PLUGIN_CRUSE": _env_bool("NSFLOW_PLUGIN_CRUSE", True),
            "NSFLOW_PLUGIN_WAND": _env_bool("NSFLOW_PLUGIN_WAND", True),
            "NSFLOW_PLUGIN_MANUAL_EDITOR": _env_bool("NSFLOW_PLUGIN_MANUAL_EDITOR", False),
            "NSFLOW_PLUGIN_VQA_ENDPOINT": _env_bool("NSFLOW_PLUGIN_VQA_ENDPOINT", False),
        }
    )


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
                "config_id": updated_config.config_id,
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
                "config_id": current_config.config_id,
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
