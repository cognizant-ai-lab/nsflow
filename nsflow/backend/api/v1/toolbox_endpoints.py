# Copyright © 2026 Cognizant Technology Solutions Corp, www.cognizant.com.
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
Lists the tools available to drag onto the editor canvas.

There are two different toolboxes in play, and the editor wants the narrower one:

* ``AGENT_TOOLBOX_INFO_FILE`` is the *runtime* toolbox, overlaid on neuro-san's
  built-in set. It is what a running network resolves tool names against.
* ``AGENT_NETWORK_DESIGNER_TOOLBOX_INFO_FILE`` is a curated subset naming the tools
  the agent network designer may pick from when it authors a network.

Since every editor change is canonicalised by the designer, the palette offers the
designer's subset when that is configured, and falls back to the runtime toolbox
otherwise. This resolution deliberately mirrors the designer's own
``GetToolbox`` coded tool so the palette and the designer agree on what exists.

nsflow does not apply the designer file's directory-relative default the way
neuro-san-studio does; that default only resolves for an in-repo studio run, and
studio exports the resolved path into the env var, which is what is read here.

Both loads come from neuro-san rather than from a list nsflow maintains, so a tool
added to either file shows up without an nsflow change.
"""

import logging
import os
from typing import Any
from typing import Dict
from typing import List
from typing import Optional
from typing import Tuple

from fastapi import APIRouter
from fastapi import HTTPException
from fastapi.responses import JSONResponse
from neuro_san.internals.run_context.factory.master_toolbox_factory import MasterToolboxFactory
from neuro_san.internals.run_context.langchain.toolbox.toolbox_info_restorer import ToolboxInfoRestorer

router = APIRouter(prefix="/api/v1")

DESIGNER_TOOLBOX_ENV_VAR = "AGENT_NETWORK_DESIGNER_TOOLBOX_INFO_FILE"

# Resolving and parsing HOCON is done once per process rather than per request; a
# toolbox only changes when the server is reconfigured and restarted. Two slots:
# "designer" holds the curated tools once that load succeeds, and "factory" holds the
# runtime toolbox factory, whose own load() is a no-op after the first call.
#
# Only a successful designer load is final. Falling back is deliberately not cached,
# so a designer file that is missing when the first palette opens is picked up on a
# later request rather than pinning the wrong toolbox for the life of the process.
_TOOLBOX_CACHE: Dict[str, Any] = {}


def _load_designer_toolbox() -> Optional[Dict[str, Any]]:
    """
    Load the curated toolbox the agent network designer picks from.

    :return: The tool infos, or None when the env var is unset or the file is
             missing, empty, or unreadable, in which case the caller falls back to
             the runtime toolbox.
    """
    path: str = os.getenv(DESIGNER_TOOLBOX_ENV_VAR)
    if not path:
        return None

    try:
        infos: Dict[str, Any] = ToolboxInfoRestorer().restore(path)
    except Exception as exc:  # pylint: disable=broad-except
        # Not fatal: the runtime toolbox is still a usable palette.
        logging.warning("Could not read %s=%s: %s", DESIGNER_TOOLBOX_ENV_VAR, path, exc)
        return None

    if not infos:
        logging.warning("%s=%s yielded no tools", DESIGNER_TOOLBOX_ENV_VAR, path)
        return None
    return infos


def _load_runtime_toolbox() -> Dict[str, Any]:
    """
    Load the runtime toolbox: neuro-san's built-in set overlaid with
    ``AGENT_TOOLBOX_INFO_FILE``.

    The factory is asked for the merged view rather than the override file being read
    directly, since reading the file alone would miss the built-in tools.

    :return: The merged tool infos, keyed by tool name.
    """
    factory = _TOOLBOX_CACHE.get("factory")
    if factory is None:
        factory = MasterToolboxFactory.create_toolbox_factory({})
        _TOOLBOX_CACHE["factory"] = factory
    # Reusing the instance is what keeps this cheap: load() only does work on its
    # first call, so the HOCON is parsed once per process.
    factory.load()
    # toolbox_infos is a public attribute on ToolboxFactory rather than part of the
    # ContextTypeToolboxFactory interface, so it is semi-internal. It is still a far
    # better source than a hand-maintained list, which would drift the moment
    # neuro-san or a project ships a new tool.
    return getattr(factory, "toolbox_infos", {}) or {}


def _load_toolbox() -> Tuple[str, Dict[str, Any]]:
    """
    Return the toolbox the palette should offer, loading it on first use.

    :return: A (source, tool infos) pair, where source names which toolbox won.
    """
    cached: Optional[Dict[str, Any]] = _TOOLBOX_CACHE.get("designer")
    if cached:
        return "agent_network_designer", cached

    designer_infos: Optional[Dict[str, Any]] = _load_designer_toolbox()
    if designer_infos:
        _TOOLBOX_CACHE["designer"] = designer_infos
        return "agent_network_designer", designer_infos

    return "runtime", _load_runtime_toolbox()


@router.get(
    "/toolbox",
    summary="List the tools available from neuro-san's toolbox.",
    responses={
        200: {"description": "The tools the configured toolbox offers"},
        500: {"description": "The toolbox could not be loaded"},
    },
)
async def list_toolbox() -> JSONResponse:
    """
    List the toolbox tools, for the editor palette.

    Each entry carries the tool's name, its human-readable description, and whether
    it is a coded tool or a langchain tool, which is what the palette needs to group
    and label them.

    :return: ``{"source", "tools": [{"name", "description", "class", "display_as"}]}``
    """
    try:
        source, infos = _load_toolbox()
    except Exception as exc:
        logging.exception("Failed to load the neuro-san toolbox: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to load the neuro-san toolbox") from exc

    tools: List[Dict[str, Any]] = []
    for name, info in sorted(infos.items()):
        entry: Dict[str, Any] = info if isinstance(info, dict) else {}
        # A tool backed by a python class is a coded_tool; one backed by a langchain
        # toolkit is not. display_as matches the vocabulary connectivity already uses,
        # so a dragged tool renders like the same tool does on a generated network.
        has_class = bool(entry.get("class"))
        tools.append(
            {
                "name": name,
                "description": entry.get("description", ""),
                "class": entry.get("class"),
                "display_as": "coded_tool" if has_class else "langchain_tool",
            }
        )

    return JSONResponse(content={"source": source, "tools": tools})
