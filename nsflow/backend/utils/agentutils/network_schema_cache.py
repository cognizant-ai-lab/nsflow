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
Per-network schema cache: maps each agent/tool name declared in a HOCON
network to its kind (agent / sub_network / tool). This lets the trace UI
classify steps from authoritative configuration instead of guessing from
runtime signals.
"""

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
    """
    Decide what a single top-level HOCON `tools[...]` entry represents.

    A coded function/tool is anything that delegates execution outside the
    LLM loop: it carries either a `class` (Python module path) or a
    `toolbox` key. Everything else with a `function` block is an LLM-backed
    agent. External-network references (leaf names like "/industry/macys")
    are not entries in this list; they're handled at lookup time.
    """
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
    """
    Return the kind for `agent_name` within `network_name`, loading and
    caching the network schema on first miss. Returns None if the name is
    not in the network (e.g. an external sub-network reference or a
    runtime-generated agent).
    """
    if not network_name or not agent_name:
        return None

    # External agent network references are always shaped as "/foo/bar".
    if isinstance(agent_name, str) and agent_name.startswith("/"):
        return KIND_SUB_NETWORK

    with _cache_lock:
        schema = _cache.get(network_name)
        if schema is None:
            schema = _load_schema(network_name)
            _cache[network_name] = schema
    return schema.get(agent_name)


def invalidate(network_name: Optional[str] = None) -> None:
    """
    Drop the cache for `network_name` (or all networks). Useful for the
    agent_network_designer flow where HOCONs are rewritten in-place.
    """
    with _cache_lock:
        if network_name is None:
            _cache.clear()
        else:
            _cache.pop(network_name, None)
