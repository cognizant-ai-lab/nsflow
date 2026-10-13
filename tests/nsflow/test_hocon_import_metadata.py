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
"""Covers the metadata block POST /api/v1/hocon/import hands the Editor."""

import os
import tempfile
import unittest
from typing import Any
from typing import Dict
from unittest.mock import patch

from fastapi.testclient import TestClient

from nsflow.backend.api.v1 import hocon_endpoints
from nsflow.backend.main import app

# The block lives at the top level of the file, beside `tools`, as the designer writes it.
CATALOGUED_NETWORK = """{
    "metadata": {
        "description": "Plans trips.",
        "sample_queries": ["Imported query.", "Another imported query."],
        "tags": ["travel"]
    },
    "tools": [
        {"name": "frontman", "instructions": "You are the front man.", "tools": ["helper"]},
        {"name": "helper", "instructions": "You help."}
    ]
}
"""

UNCATALOGUED_NETWORK = """{
    "tools": [
        {"name": "frontman", "instructions": "You are the front man.", "tools": ["helper"]},
        {"name": "helper", "instructions": "You help."}
    ]
}
"""

MISFILED_METADATA_NETWORK = """{
    "metadata": ["not", "a", "block"],
    "tools": [{"name": "frontman", "instructions": "You are the front man."}]
}
"""


class TestHoconImportMetadata(unittest.TestCase):
    """
    Covers the ``metadata`` key of the import response.

    Importing replaces the network, so the Editor sends the file's block on the import
    save. When the file has none it sends an empty block, which only works if the
    response tells "no block" apart from a block. These tests pin down both answers,
    and that the rest of the response did not change to make room.
    """

    def setUp(self) -> None:
        """
        Point the registry at an empty directory, so no real network can be called taken.
        """
        # Not a with block: the directory has to outlive setUp, so addCleanup removes it.
        staging = tempfile.TemporaryDirectory()  # pylint: disable=consider-using-with
        self.addCleanup(staging.cleanup)

        registry_patch = patch.object(hocon_endpoints, "REGISTRY_DIR", staging.name)
        registry_patch.start()
        self.addCleanup(registry_patch.stop)
        env_patch = patch.dict(os.environ, {"AGENT_NETWORK_DESIGNER_SUBDIRECTORY": "generated"})
        env_patch.start()
        self.addCleanup(env_patch.stop)

        self.client: TestClient = TestClient(app)

    def import_file(self, body: str, filename: str = "travel.hocon") -> Dict[str, Any]:
        """
        Upload a file to the real app, so route registration is covered too.

        :param body: the file's text.
        :param filename: the uploaded file's name, which names the network.
        :return: the response body.
        """
        # Any, because the class it returns depends on whether starlette's TestClient
        # found httpx2 or httpx installed.
        response: Any = self.client.post("/api/v1/hocon/import", files={"file": (filename, body, "text/plain")})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_returns_the_metadata_block_of_the_file(self) -> None:
        """
        The file's block comes back under ``metadata``, list values included.
        """
        self.assertEqual(
            self.import_file(CATALOGUED_NETWORK)["metadata"],
            {
                "description": "Plans trips.",
                "sample_queries": ["Imported query.", "Another imported query."],
                "tags": ["travel"],
            },
        )

    def test_returns_null_when_the_file_has_no_block(self) -> None:
        """
        No block is null, not a missing key and not an empty block.
        """
        body: Dict[str, Any] = self.import_file(UNCATALOGUED_NETWORK)

        self.assertIn("metadata", body)
        self.assertIsNone(body["metadata"])

    def test_returns_null_when_the_metadata_is_not_a_block(self) -> None:
        """
        A ``metadata`` that is not a dict is not a block, so it is reported as none.
        """
        self.assertIsNone(self.import_file(MISFILED_METADATA_NETWORK)["metadata"])

    def test_changes_nothing_else_in_the_response(self) -> None:
        """
        The block is one more key. The name, the clash answer, the definition and the text
        come back as before.
        """
        body: Dict[str, Any] = self.import_file(CATALOGUED_NETWORK)

        self.assertEqual(set(body), {"network_name", "name_is_taken", "definition", "hocon", "metadata"})
        self.assertEqual(body["network_name"], "travel")
        self.assertIs(body["name_is_taken"], False)
        self.assertEqual(
            body["definition"],
            {
                "frontman": {"instructions": "You are the front man.", "tools": ["helper"]},
                "helper": {"instructions": "You help."},
            },
        )
        self.assertEqual(body["hocon"], CATALOGUED_NETWORK)
