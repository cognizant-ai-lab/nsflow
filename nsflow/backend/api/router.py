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
