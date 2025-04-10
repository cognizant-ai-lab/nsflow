
# Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
# All Rights Reserved.
# Issued under the Academic Public License.
#
# You can be released from the terms, and requirements of the Academic Public
# License by purchasing a commercial license.
# Purchase of a commercial license is mandatory for any use of the
# ENN-release SDK Software in commercial settings.
#
# END COPYRIGHT
from fastapi import APIRouter
from .v1 import (
    export_endpoints,
    fast_websocket,
    agent_flows,
    fastapi_grpc_endpoints,
    version_info)

router = APIRouter()

router.include_router(fast_websocket.router, tags=["WebSocket API"])
router.include_router(agent_flows.router, tags=["Agent Flows"])
router.include_router(export_endpoints.router, tags=["Notebook Export"])
router.include_router(version_info.router, tags=["Version Info"])
router.include_router(fastapi_grpc_endpoints.router, tags=["gRPC Endpoints"])
