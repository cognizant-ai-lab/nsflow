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

"""Per-network HOCON schema cache that maps each entry name to its kind."""

import logging
import threading
from typing import Dict, Optional

from nsflow.backend.utils.agentutils.agent_network_utils import AgentNetworkUtils

# Kind strings match the TraceKind union on the frontend.
KIND_AGENT = "agent"
KIND_SUB_NETWORK = "sub_network"
KIND_TOOL = "tool"

_logger = logging.getLogger(__name__)
_cache_lock = threading.Lock()
_cache: Dict[str, Dict[str, str]] = {}


def _classify_entry(entry: Dict[str, object]) -> str:
    """Classify a HOCON `tools[...]` entry: entries with class/toolbox are tools."""
    if "class" in entry or "toolbox" in entry:
        return KIND_TOOL
    return KIND_AGENT


def _load_schema(network_name: str) -> Dict[str, str]:
    """Parse the HOCON for `network_name` and return a name->kind map."""
    utils = AgentNetworkUtils()
    try:
        agent_network = utils.get_agent_network(network_name)
    except Exception as exc:  # pylint: disable=broad-except
        _logger.warning("Could not load HOCON for network '%s': %s", network_name, exc)
        return {}

    config = agent_network.get_config() if agent_network else {}
    schema: Dict[str, str] = {}
    for entry in config.get("tools", []) or []:
        name = entry.get("name") if isinstance(entry, dict) else None
        if not name:
            continue
        schema[name] = _classify_entry(entry)
    return schema


def get_kind(network_name: str, agent_name: str) -> Optional[str]:
    """Return the kind for `agent_name` within `network_name`, or None if unknown."""
    if not network_name or not agent_name:
        return None

    # External network references look like "/foo/bar".
    if isinstance(agent_name, str) and agent_name.startswith("/"):
        return KIND_SUB_NETWORK

    with _cache_lock:
        schema = _cache.get(network_name)
        if schema is None:
            schema = _load_schema(network_name)
            _cache[network_name] = schema
    return schema.get(agent_name)


def invalidate(network_name: Optional[str] = None) -> None:
    """Drop the cached schema for `network_name`, or all networks if None."""
    with _cache_lock:
        if network_name is None:
            _cache.clear()
        else:
            _cache.pop(network_name, None)
