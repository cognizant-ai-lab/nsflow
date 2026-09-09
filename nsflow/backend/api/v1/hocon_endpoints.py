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
Turns an uploaded agent network HOCON into a definition the editor can open.

Only import lives here. Export needs no endpoint: the agent network designer already
emits the finished file as ``agent_network_hocon_text`` in sly_data, the editor store
keeps it, and the browser downloads that text directly. Assembling a second HOCON
writer in nsflow would be a second answer to a question the designer already answers,
and the two would drift.

Parsing is delegated to neuro-san's own ``AgentNetworkRestorer`` rather than to a
direct pyhocon call, so an uploaded file resolves ``include`` directives and
``${substitutions}`` exactly as it would when neuro-san loads it for real. The
restorer is directory-based, so the upload is written into a temporary directory and
restored from there; nothing touches the served registry.

The definition comes back in the designer's DICT shape, which the editor already
normalises. Entries are built on the PRESENCE of keys, not their truthiness: an entry
with no ``instructions`` and no ``description`` is a toolbox tool, and one that has
them (even empty) is an LLM agent. Copying only truthy values would silently
reclassify an agent whose instructions are blank.
"""

import logging
import os
import re
import tempfile
from typing import Any
from typing import Dict
from typing import List

from fastapi import APIRouter
from fastapi import File
from fastapi import HTTPException
from fastapi import UploadFile
from fastapi.responses import JSONResponse
from neuro_san.internals.graph.persistence.agent_network_restorer import AgentNetworkRestorer

from nsflow.backend.utils.agentutils.agent_network_utils import REGISTRY_DIR

router = APIRouter(prefix="/api/v1")

logger = logging.getLogger(__name__)

# A network HOCON is prose and structure, not data. Real ones run to a few tens of
# kilobytes; this is generous while still refusing something that is not a network.
MAX_UPLOAD_BYTES = 2 * 1024 * 1024

# What neuro-san will load. Anything else cannot be restored, so reject it by name
# rather than after a confusing parse failure.
ALLOWED_SUFFIXES = (".hocon", ".json")


# Where generated and imported networks live, relative to the registry. Read rather
# than assumed, and mirrors the variable neuro-san-studio uses.
def _designer_subdirectory() -> str:
    return os.getenv("AGENT_NETWORK_DESIGNER_SUBDIRECTORY", "generated")


# neuro-san's own agent name rule. A name that fails this cannot be saved later, so
# it is better to sanitise it now than to let the first edit fail.
SAFE_NAME_PATTERN = re.compile(r"[^a-zA-Z0-9_-]+")


def _network_name_from(filename: str) -> str:
    """Derive a usable network name from the uploaded filename."""
    stem = os.path.splitext(os.path.basename(filename or ""))[0]
    safe = SAFE_NAME_PATTERN.sub("_", stem).strip("_")
    return safe or "imported_network"


def _definition_from_tools(tools: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Build the designer's dict definition from a network's ``tools`` list.

    Keyed by agent name, because that is the shape the designer emits and the editor
    reads. Duplicate names keep the first, matching how neuro-san resolves a name to
    the first tool that declares it.
    """
    definition: Dict[str, Any] = {}

    for tool in tools:
        name = tool.get("name")
        if not name or name in definition:
            continue

        entry: Dict[str, Any] = {}

        # Presence, not truthiness. See the module docstring.
        if "instructions" in tool:
            entry["instructions"] = tool["instructions"]

        # A network HOCON carries the description under `function`, but the designer's
        # own shape has it at the top level, so accept either.
        if "description" in tool:
            entry["description"] = tool["description"]
        else:
            function = tool.get("function")
            if isinstance(function, dict) and "description" in function:
                entry["description"] = function["description"]

        down_chain = tool.get("tools")
        if down_chain:
            entry["tools"] = list(down_chain)

        definition[name] = entry

    return definition


def _name_is_taken(network_name: str) -> bool:
    """
    Whether saving this import would replace an existing generated network.

    Only the designer's subdirectory is checked, because that is the only place an
    import can land. A network of the same name elsewhere in the registry, say
    ``registries/music_nerd.hocon``, is served under a different path and is not at
    risk, so warning about it would be a false alarm.

    Checked here rather than in the client because the registry is a server concern,
    and because the name is derived from the filename by this module: asking the client
    to reproduce that derivation would be two copies of one rule, free to disagree.

    ``AGENT_NETWORK_DESIGNER_SUBDIRECTORY`` is read rather than assumed, and mirrors
    the variable neuro-san-studio uses, so nsflow and the designer agree on where
    generated networks live even when studio is embedded in another project.
    """
    candidate = os.path.join(REGISTRY_DIR, _designer_subdirectory(), f"{network_name}.hocon")
    return os.path.isfile(candidate)


@router.post("/hocon/import")
async def import_hocon(file: UploadFile = File(...)) -> Dict[str, Any]:
    """Parse an uploaded agent network HOCON and return it as an editable definition."""
    filename = file.filename or ""
    if not filename.lower().endswith(ALLOWED_SUFFIXES):
        raise HTTPException(
            status_code=400,
            detail=f"Expected a {' or '.join(ALLOWED_SUFFIXES)} file, got '{filename}'.",
        )

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"The file is larger than {MAX_UPLOAD_BYTES // 1024} KB.",
        )

    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise HTTPException(status_code=400, detail="The file is not valid UTF-8 text.") from error

    # A temporary directory, so the restorer's include resolution is rooted at the
    # upload and can never reach into the served registry.
    with tempfile.TemporaryDirectory() as staging_dir:
        suffix = os.path.splitext(filename)[1] or ".hocon"
        staged_name = f"imported{suffix}"
        with open(os.path.join(staging_dir, staged_name), "w", encoding="utf-8") as staged:
            staged.write(text)

        try:
            agent_network = AgentNetworkRestorer(staging_dir).restore(staged_name)
        except Exception as error:  # noqa: BLE001  pyhocon raises a wide range here
            logger.info("Rejected an unparseable agent network upload: %s", error)
            raise HTTPException(status_code=400, detail=f"Could not parse the HOCON: {error}") from error

        config: Dict[str, Any] = agent_network.get_config() or {}

    tools = config.get("tools")
    if not isinstance(tools, list) or not tools:
        raise HTTPException(
            status_code=400,
            detail="The file parsed but declares no `tools`, so it is not an agent network.",
        )

    definition = _definition_from_tools(tools)
    if not definition:
        raise HTTPException(status_code=400, detail="No named agents found under `tools`.")

    network_name = _network_name_from(filename)

    return {
        "network_name": network_name,
        # Whether saving this import would replace a network that already exists. The
        # client asks before overwriting, and the filename is what decides it, so the
        # answer belongs with the code that derives the name.
        "name_is_taken": _name_is_taken(network_name),
        "definition": definition,
        # The original text, so the editor can offer it straight back for export
        # before the designer has echoed a canonical version.
        "hocon": text,
    }


def _generated_network_path(network_name: str) -> str:
    """
    Resolve a generated network's file, refusing anything outside its directory.

    The name arrives from the URL, so it can try to climb out with ``..``. A plain
    ``../`` is normalised away by the HTTP layer and never reaches here, but a
    percent-encoded one arrives intact, so containment is checked after resolving,
    which also catches a symlink.

    Deletion is scoped to the designer's subdirectory on purpose. Networks elsewhere in
    the registry are part of the deployment, not something a user generated, and are not
    nsflow's to remove.
    """
    root = os.path.realpath(os.path.join(REGISTRY_DIR, _designer_subdirectory()))
    candidate = os.path.realpath(os.path.join(root, f"{network_name}.hocon"))
    if not candidate.startswith(root + os.sep):
        raise HTTPException(status_code=404, detail=f"Agent network '{network_name}' not found.")
    return candidate


def _drop_from_generated_manifest(network_name: str) -> bool:
    """
    Remove the network's line from the generated manifest.

    Line-based rather than parse-and-rewrite: the manifest is hand-editable and carries
    comments, and pyhocon's writer would drop both. Only the matching entry is touched,
    so anything else in the file survives untouched.

    :return: whether an entry was actually removed.
    """
    subdirectory = _designer_subdirectory()
    manifest_path = os.path.join(REGISTRY_DIR, subdirectory, "manifest.hocon")
    if not os.path.isfile(manifest_path):
        return False

    entry = f'"{subdirectory}/{network_name}.hocon"'
    with open(manifest_path, "r", encoding="utf-8") as handle:
        lines = handle.readlines()

    kept = [line for line in lines if entry not in line]
    if len(kept) == len(lines):
        return False

    with open(manifest_path, "w", encoding="utf-8") as handle:
        handle.writelines(kept)
    return True


@router.delete("/hocon/generated/{network_name:path}")
async def delete_generated_network(network_name: str) -> JSONResponse:
    """Delete a generated agent network and drop it from the generated manifest."""
    # Strip the subdirectory if the caller included it: the sidebar knows networks by
    # their served path ("generated/foo"), and accepting both spellings is kinder than
    # a 404 that looks like the network is missing.
    prefix = f"{_designer_subdirectory()}/"
    bare_name = network_name[len(prefix) :] if network_name.startswith(prefix) else network_name

    file_path = _generated_network_path(bare_name)
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail=f"Agent network '{bare_name}' not found.")

    os.remove(file_path)
    # After the file, so a failure to edit the manifest leaves a stale entry pointing at
    # nothing (which neuro-san tolerates) rather than an orphaned network still served.
    manifest_updated = _drop_from_generated_manifest(bare_name)

    logger.info("Deleted generated agent network %s (manifest updated: %s)", bare_name, manifest_updated)
    return JSONResponse(content={"deleted": bare_name, "manifest_updated": manifest_updated})
