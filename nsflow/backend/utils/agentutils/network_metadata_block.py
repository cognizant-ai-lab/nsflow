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
from collections.abc import Mapping
from typing import Any
from typing import Dict
from typing import List
from typing import Optional


class NetworkMetadataBlock:
    """
    Reads the top-level ``metadata`` block of a parsed agent network config.

    The Editor holds this block for each network and sends it back on every save as
    ``agent_network_metadata``. Studio's designer then writes it as sent. Without it,
    an opened or imported network loses its sample queries on the next save.

    The block is copied into plain dicts and lists at every depth. The response then
    holds only JSON types, whichever parser built the config (leaf_common hands back
    dicts, pyhocon its ConfigTree), and never shares objects with it.
    """

    @staticmethod
    def from_config(config: Mapping[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Return the config's metadata block as a plain dict.

        :param config: the parsed agent network config.
        :return: the block as plain JSON, or None when the config has no dict ``metadata``.
        """
        block: Any = config.get("metadata")
        if not isinstance(block, Mapping):
            return None
        return NetworkMetadataBlock.to_plain(block)

    @staticmethod
    def to_plain(value: Any) -> Any:
        """
        Copy a parsed HOCON value into plain dicts and lists, at every depth.

        :param value: a value read from a parsed config.
        :return: the same value, with every mapping a dict and every list or tuple a list.
        """
        if isinstance(value, Mapping):
            plain_dict: Dict[str, Any] = {}
            for key, item in value.items():
                plain_dict[str(key)] = NetworkMetadataBlock.to_plain(item)
            return plain_dict
        if isinstance(value, (list, tuple)):
            plain_list: List[Any] = []
            for item in value:
                plain_list.append(NetworkMetadataBlock.to_plain(item))
            return plain_list
        return value
