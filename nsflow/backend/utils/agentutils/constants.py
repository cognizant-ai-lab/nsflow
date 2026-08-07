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

"""
Lightweight, dependency-free constants shared across the backend.

Kept deliberately import-cheap: modules such as the runtime-config API endpoint
import from here without dragging in the heavier agent/log-processing stack
(neuro_san message types, RaiService, registries, ...).
"""

import os

# The Agent Network Designer (the "wand") network name. The designer builds
# *other* networks, so several places key off this exact value: the log
# processor (rendering its copilot state updates), the MCP token injector
# (ns_websocket_utils, which sends the designer every connected token), and the
# runtime-config endpoint (app_configs, which serves the same value to the UI).
# Defining it once means the network the frontend routes to and the one the
# backend treats as the designer can never silently drift. Read once at import
# time, matching how the backend logic consumes it.
AGENT_NETWORK_DESIGNER_NAME = os.getenv("NSFLOW_WAND_NAME", "agent_network_designer")
