from fastapi import APIRouter
from .v1 import fast_websocket, agent_flows

router = APIRouter()

router.include_router(fast_websocket.router)
router.include_router(agent_flows.router)
