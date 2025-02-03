from fastapi import APIRouter
from .v1 import fast_websocket, agent_flows, export_notebook

router = APIRouter()

router.include_router(fast_websocket.router)
router.include_router(agent_flows.router)
router.include_router(export_notebook.router)
