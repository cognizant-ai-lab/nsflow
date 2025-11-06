
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
import os

from fastapi import APIRouter

from .v1 import agent_flows
from .v1 import app_configs
from .v1 import audio_endpoints
from .v1 import export_endpoints
from .v1 import fast_websocket
from .v1 import fastapi_grpc_endpoints
from .v1 import vqa_endpoints
from .v1 import editor_endpoints

NSFLOW_PLUGIN_VQA_ENDPOINT = os.getenv("NSFLOW_PLUGIN_VQA_ENDPOINT", None)

router = APIRouter()

router.include_router(app_configs.router, tags=["App Configs"])
router.include_router(fast_websocket.router, tags=["WebSocket API"])
router.include_router(agent_flows.router, tags=["Agent Flows"])
router.include_router(export_endpoints.router, tags=["Notebook Export"])
router.include_router(fastapi_grpc_endpoints.router, tags=["Concierge Endpoints"])
router.include_router(audio_endpoints.router, tags=["Audio Processing"])
router.include_router(editor_endpoints.router, tags=["Agent Network Designer"])
if NSFLOW_PLUGIN_VQA_ENDPOINT:
    router.include_router(vqa_endpoints.router, tags=["Visual Question Answering"])
