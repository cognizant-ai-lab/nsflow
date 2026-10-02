# Copyright © 2025-2026 Cognizant Technology Solutions Corp, www.cognizant.com.
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

"""Tests for Network Consultant fixture validation."""

import unittest
from typing import Any

from nsflow.backend.utils.fixture_repository import FixtureRepository


class TestNetworkConsultantFixtureValidation(unittest.TestCase):
    """Cover each validation branch in the fixture save path."""

    @staticmethod
    def valid_fixture() -> dict[str, Any]:
        """Return a valid editable fixture."""
        return {
            "agent": "basic/coffee_finder",
            "success_ratio": "1/1",
            "connections": ["direct"],
            "interactions": [
                {
                    "text": "Where can I get coffee?",
                    "timeout_in_seconds": 400,
                    "response": {"text": {"gist": ["Names at least one coffee shop"]}},
                    "sly_data": {},
                }
            ],
        }

    def test_valid_fixture_has_no_errors(self) -> None:
        """Accept a complete valid fixture."""
        self.assertEqual(FixtureRepository.validate_fixture(self.valid_fixture()), [])

    def test_missing_agent(self) -> None:
        """Reject a blank agent name."""
        fixture = self.valid_fixture()
        fixture.update({"agent": "   "})
        errors = FixtureRepository.validate_fixture(fixture)
        self.assertTrue(any("agent" in error for error in errors))

    def test_bad_success_ratio(self) -> None:
        """Reject a success ratio outside N/M format."""
        fixture = self.valid_fixture()
        fixture.update({"success_ratio": "one out of one"})
        errors = FixtureRepository.validate_fixture(fixture)
        self.assertTrue(any("success_ratio" in error for error in errors))

    def test_interaction_missing_text(self) -> None:
        """Reject an interaction with blank input text."""
        fixture = self.valid_fixture()
        interactions = fixture.get("interactions", [])
        interaction = interactions[0]
        interaction.update({"text": ""})
        errors = FixtureRepository.validate_fixture(fixture)
        self.assertTrue(any("'text' is required" in error for error in errors))

    def test_unknown_check_type_rejected(self) -> None:
        """Reject response assertion types unknown to the fixture runner."""
        fixture = self.valid_fixture()
        interactions = fixture.get("interactions", [])
        interaction = interactions[0]
        response = interaction.get("response", {})
        response.update({"text": {"regex": ["nope"]}})
        errors = FixtureRepository.validate_fixture(fixture)
        self.assertTrue(any("not a valid check type" in error for error in errors))

    def test_empty_interactions_short_circuits(self) -> None:
        """Report an empty interaction list without inspecting its elements."""
        fixture = self.valid_fixture()
        fixture.update({"interactions": []})
        errors = FixtureRepository.validate_fixture(fixture)
        self.assertEqual(errors, ["'interactions' must be a non-empty list."])
