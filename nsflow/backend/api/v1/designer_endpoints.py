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
Lists what the agent network designer will accept as an external reference.

This is deliberately NOT the same as what the server serves. The designer validates
references against a curated subset, and a network the server hosts but the designer
does not know is rejected with

    Agent 'frontman' references an unrecognized URL or path tool '/basic/coffee_finder'

which is not a plain error: the designer responds by invoking its LLM to repair the
network, restructuring what the user drew and taking half a minute per edit. Offering
the editor's palette anything outside this set therefore poisons every subsequent edit
until the reference is removed, so the palette has to be fed from the same two sources
the designer itself reads:

* ``AGENT_NETWORK_DESIGNER_MANIFEST_FILE`` for other agent networks. Distinct from
  ``AGENT_MANIFEST_FILE`` on purpose, so the designer's pool can be narrower than what
  the server hosts.
* ``MCP_SERVERS_INFO_FILE`` for MCP servers. Also distinct from the OAuth connection
  store: a server can be connected without being offered to the designer, and vice
  versa.

Both are read through neuro-san's own restorers and manifest filters rather than by
re-reading the files here, so manifest semantics (``include`` composition, quoted
keys, the ``serve`` flag) cannot drift from the server's.
"""

import logging
import os
from typing import Any
from typing import Dict
from typing import List

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from leaf_common.config.config_filter_chain import ConfigFilterChain
from neuro_san.internals.graph.persistence.manifest_dict_config_filter import ManifestDictConfigFilter
from neuro_san.internals.graph.persistence.manifest_key_config_filter import ManifestKeyConfigFilter
from neuro_san.internals.graph.persistence.raw_manifest_restorer import RawManifestRestorer
from neuro_san.internals.graph.persistence.registry_manifest_restorer import RegistryManifestRestorer
from neuro_san.internals.graph.persistence.served_manifest_config_filter import ServedManifestConfigFilter
from neuro_san.internals.run_context.langchain.mcp.mcp_servers_info_restorer import McpServersInfoRestorer

router = APIRouter(prefix="/api/v1/designer")

DESIGNER_MANIFEST_ENV_VAR = "AGENT_NETWORK_DESIGNER_MANIFEST_FILE"
MCP_SERVERS_ENV_VAR = "MCP_SERVERS_INFO_FILE"

# What neuro-san-studio ships as the designer's manifest when the env var is unset.
# Only resolves for an in-repo run, which is why studio exports the resolved path.
DEFAULT_DESIGNER_MANIFEST = os.path.join("registries", "manifest_and.hocon")


def _designer_manifest_file() -> str:
    """
    :return: The manifest naming the networks the designer may reference.
    """
    return os.getenv(DESIGNER_MANIFEST_ENV_VAR) or DEFAULT_DESIGNER_MANIFEST


def _referenceable_networks() -> List[str]:
    """
    Read the external network names the designer accepts, as "/<name>".

    Mirrors the designer's own ``GetSubnetwork``: neuro-san's manifest filters strip
    quoted keys, normalise bool entries, and drop anything not served, then its
    registry restorer derives the external names.

    :return: The names, or an empty list when the manifest is missing or unparseable.
    """
    manifest_file = _designer_manifest_file()

    try:
        # Missing file comes back as None rather than raising.
        raw_manifest: Dict[str, Any] = RawManifestRestorer().restore(file_reference=manifest_file)
        if raw_manifest is None:
            logging.warning("Designer manifest %s not found; no networks can be referenced", manifest_file)
            return []

        # Assembled rather than using ManifestFilterChain, which keeps unserved
        # entries and warns per entry. Here they should be dropped silently.
        filter_chain = ConfigFilterChain()
        filter_chain.register(ManifestKeyConfigFilter(manifest_file))
        filter_chain.register(ManifestDictConfigFilter(manifest_file))
        filter_chain.register(ServedManifestConfigFilter(manifest_file, warn_on_skip=False, entry_for_skipped=False))
        one_manifest: Dict[str, Any] = filter_chain.filter_config(raw_manifest)

        restorer = RegistryManifestRestorer(manifest_files=manifest_file)
        return list(restorer.find_external_network_names(one_manifest))
    except Exception as exc:  # pylint: disable=broad-except
        # neuro-san re-wraps HOCON parse errors as ValueError. Whatever the cause, an
        # unreadable manifest means "nothing to offer", not a failed request: the
        # toolbox and MCP halves of the palette are still usable.
        logging.warning("Could not read designer manifest %s: %s", manifest_file, exc)
        return []


def _referenceable_mcp_servers() -> List[str]:
    """
    Read the MCP server URLs the designer accepts.

    :return: The URLs, or an empty list when no info file is configured or readable.
    """
    mcp_info_file = os.getenv(MCP_SERVERS_ENV_VAR)
    if not mcp_info_file:
        # No fallback path is guessed here: unlike the designer, nsflow does not know
        # where a given project keeps its bundled copy.
        return []

    try:
        info: Dict[str, Any] = McpServersInfoRestorer().restore(file_reference=mcp_info_file)
        return list(info.keys()) if info else []
    except Exception as exc:  # pylint: disable=broad-except
        logging.warning("Could not read %s=%s: %s", MCP_SERVERS_ENV_VAR, mcp_info_file, exc)
        return []


@router.get(
    "/references",
    summary="List what the agent network designer accepts as an external reference.",
    responses={200: {"description": "The networks and MCP servers the designer recognises"}},
)
async def list_references() -> JSONResponse:
    """
    List the external references the editor palette may offer.

    :return: ``{"networks": ["/industry/foo", ...], "mcp_servers": ["https://...", ...]}``
    """
    return JSONResponse(
        content={
            "networks": _referenceable_networks(),
            "mcp_servers": _referenceable_mcp_servers(),
        }
    )
