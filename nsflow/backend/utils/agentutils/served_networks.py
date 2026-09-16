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
Turning an agent network name from a URL into a file, via the manifest.

Endpoints that read a network off disk get the name from the request, and a name from
the request must not be joined onto a directory: "../.." in it walks straight out of the
registry. The usual answer is to join first and then check the result stayed inside, but
that leaves user input in the path expression, which is both harder to prove correct and
what static analysis objects to.

This does it the other way around. The manifest already lists every network the server
serves, so the requested name is looked up in that list and the path comes from the
matching manifest entry. The name decides *which* entry, never how the path is spelled,
so a name that tries to climb out simply matches nothing.

That is also how neuro-san itself works. Its ``AgentNetworkRestorer`` takes a registry
directory but does not police what it is asked to open, and its ``AgentFileTreeMapper``
only converts between the two spellings of a name; neither rejects "..". They do not
need to, because in neuro-san a name always arrives from the manifest. Serving HTTP is
what broke that assumption, so this puts the manifest back in front.
"""

import os
from logging import getLogger
from pathlib import PurePosixPath
from typing import Any
from typing import Dict
from typing import Optional

from leaf_common.config.config_filter_chain import ConfigFilterChain
from neuro_san.internals.graph.persistence.manifest_dict_config_filter import ManifestDictConfigFilter
from neuro_san.internals.graph.persistence.manifest_key_config_filter import ManifestKeyConfigFilter
from neuro_san.internals.graph.persistence.raw_manifest_restorer import RawManifestRestorer
from neuro_san.internals.graph.persistence.served_manifest_config_filter import ServedManifestConfigFilter

from nsflow.backend.utils.agentutils.agent_network_utils import AGENT_MANIFEST_FILE
from nsflow.backend.utils.agentutils.agent_network_utils import REGISTRY_DIR

logger = getLogger(__name__)


def served_network_files() -> Dict[str, str]:
    """
    Every network the manifest serves, by the name the UI knows it as.

    Deliberately not cached. Generating a network writes a new manifest entry, and a
    cache here would mean the Editor could not open a network the user had just made
    until the process restarted. The manifest is a small file and the OS keeps it warm.

    :return: Network name ("generated/coffee") to its file name relative to the registry
             ("generated/coffee.hocon"). Empty when the manifest cannot be read, which
             callers should treat as "nothing to serve" rather than as an error.
    """
    manifest_file = AGENT_MANIFEST_FILE
    if not manifest_file or not os.path.isfile(manifest_file):
        logger.warning("Agent manifest %s not found; no networks can be read", manifest_file)
        return {}

    try:
        raw_manifest: Dict[str, Any] = RawManifestRestorer().restore(file_reference=manifest_file)
        if raw_manifest is None:
            return {}

        # The same chain the designer references use: strip quoted keys, normalise the
        # bool entries, then drop anything the manifest marks as not served. Built here
        # rather than with ManifestFilterChain, which keeps unserved entries.
        filter_chain = ConfigFilterChain()
        filter_chain.register(ManifestKeyConfigFilter(manifest_file))
        filter_chain.register(ManifestDictConfigFilter(manifest_file))
        filter_chain.register(ServedManifestConfigFilter(manifest_file, warn_on_skip=False, entry_for_skipped=False))
        served: Dict[str, Any] = filter_chain.filter_config(raw_manifest)
    except Exception as exc:  # pylint: disable=broad-except
        # neuro-san re-wraps HOCON parse errors as ValueError. Either way an unreadable
        # manifest means there is nothing to offer, not that the request was bad.
        logger.warning("Could not read agent manifest %s: %s", manifest_file, exc)
        return {}

    # Manifest keys are posix-style relative file names. The name the UI uses is the
    # same string without its suffix, which is what the sidebar and /api/v1/list show.
    return {PurePosixPath(key).with_suffix("").as_posix(): key for key in served}


def resolve_served_network(network_name: str) -> Optional[str]:
    """
    Find the file for a requested network, or nothing if it is not served.

    :param network_name: The name as it arrived from the request. Used only to select a
                         manifest entry, never to build a path.
    :return: Absolute path to the network's HOCON file, or None when no served network
             goes by that name. None covers a misspelling, a network that exists on disk
             but is switched off in the manifest, and a name trying to escape the
             registry, because none of the three is a key in the served list.
    """
    if not network_name:
        return None

    # Accept the name with or without its suffix: the UI holds "generated/coffee", while
    # some callers already carry the file name.
    candidates = (network_name, PurePosixPath(network_name).with_suffix("").as_posix())
    served = served_network_files()
    for candidate in candidates:
        relative_file = served.get(candidate)
        if relative_file is not None:
            return os.path.join(REGISTRY_DIR, relative_file)

    return None
