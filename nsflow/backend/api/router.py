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
from fastapi import APIRouter

from .v1 import agent_flows
from .v1 import app_configs
from .v1 import audio_endpoints
from .v1 import export_endpoints
from .v1 import fast_websocket
from .v1 import fastapi_grpc_endpoints
from .v1 import vqa_endpoints
from .v1 import andeditor

router = APIRouter()

router.include_router(app_configs.router, tags=["App Configs"])
router.include_router(fast_websocket.router, tags=["WebSocket API"])
router.include_router(agent_flows.router, tags=["Agent Flows"])
router.include_router(export_endpoints.router, tags=["Notebook Export"])
router.include_router(fastapi_grpc_endpoints.router, tags=["Concierge Endpoints"])
router.include_router(audio_endpoints.router, tags=["Audio Processing"])
router.include_router(vqa_endpoints.router, tags=["Visual Question Answering"])
router.include_router(andeditor.router, tags=["Agent Network Designer"])
