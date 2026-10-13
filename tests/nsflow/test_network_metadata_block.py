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
"""Covers NetworkMetadataBlock, which reads a network's metadata block for the Editor."""

import unittest
from typing import Any
from typing import Dict
from typing import Optional

from pyhocon import ConfigFactory
from pyhocon import ConfigTree

from nsflow.backend.utils.agentutils.network_metadata_block import NetworkMetadataBlock

# Nested on purpose, so the copy has to reach every depth.
CATALOGUED_HOCON = """
metadata {
    description = "Plans trips."
    sample_queries = ["Book me a trip to Paris."]
    nested { notes = [{ author = "a" }] }
}
tools = []
"""


class TestNetworkMetadataBlock(unittest.TestCase):
    """
    Covers when a config has a block, and that the block comes out as plain JSON types.
    """

    def test_copies_a_config_tree_into_plain_dicts_and_lists(self) -> None:
        """
        pyhocon's ConfigTree becomes a dict at every depth, and lists stay lists.
        """
        config: ConfigTree = ConfigFactory.parse_string(CATALOGUED_HOCON)

        block: Optional[Dict[str, Any]] = NetworkMetadataBlock.from_config(config)

        self.assertEqual(
            block,
            {
                "description": "Plans trips.",
                "sample_queries": ["Book me a trip to Paris."],
                "nested": {"notes": [{"author": "a"}]},
            },
        )
        # assertIs on the type, because a ConfigTree is a dict subclass and assertEqual
        # alone cannot tell them apart.
        self.assertIs(type(block), dict)
        self.assertIs(type(block["nested"]), dict)
        self.assertIs(type(block["nested"]["notes"]), list)
        self.assertIs(type(block["nested"]["notes"][0]), dict)

    def test_turns_a_tuple_into_a_list(self) -> None:
        """
        A tuple is a list in JSON, so it comes out as one.
        """
        block: Optional[Dict[str, Any]] = NetworkMetadataBlock.from_config({"metadata": {"tags": ("a", "b")}})

        self.assertEqual(block, {"tags": ["a", "b"]})
        self.assertIs(type(block["tags"]), list)

    def test_shares_nothing_with_the_config(self) -> None:
        """
        Changing the block afterwards leaves the parsed config as it was.
        """
        config: Dict[str, Any] = {"metadata": {"sample_queries": ["q"], "nested": {"a": 1}}}

        block: Optional[Dict[str, Any]] = NetworkMetadataBlock.from_config(config)
        block["sample_queries"].append("changed")
        block["nested"]["a"] = 2

        self.assertEqual(config, {"metadata": {"sample_queries": ["q"], "nested": {"a": 1}}})

    def test_keeps_an_empty_block(self) -> None:
        """
        An empty block is still a block, so it comes back empty rather than as None.
        """
        self.assertEqual(NetworkMetadataBlock.from_config({"metadata": {}}), {})

    def test_returns_none_when_there_is_no_block(self) -> None:
        """
        No ``metadata``, a null one, or one that is not a dict, all mean no block.
        """
        configs: Dict[str, Dict[str, Any]] = {
            "absent": {"tools": []},
            "null": {"metadata": None},
            "string": {"metadata": "not a block"},
            "list": {"metadata": ["not", "a", "block"]},
        }
        for label, config in configs.items():
            with self.subTest(label):
                self.assertIsNone(NetworkMetadataBlock.from_config(config))
