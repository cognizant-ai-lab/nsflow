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
import unittest

from nsflow.backend.api.v1.network_consultant_endpoints import _validate_fixture_for_save


def _valid_fixture():
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


class TestValidateFixtureForSave(unittest.TestCase):
    """Covers the hand-edit save-path validator's branches -- every check the UI's own dropdown
    doesn't already prevent (free-text agent/success_ratio/interaction text, and a defensive
    check-type check in case a stale client ever sends one outside the known set)."""

    def test_valid_fixture_has_no_errors(self):
        self.assertEqual(_validate_fixture_for_save(_valid_fixture()), [])

    def test_missing_agent(self):
        fixture = _valid_fixture()
        fixture["agent"] = "   "
        errors = _validate_fixture_for_save(fixture)
        self.assertTrue(any("agent" in e for e in errors))

    def test_bad_success_ratio(self):
        fixture = _valid_fixture()
        fixture["success_ratio"] = "one out of one"
        errors = _validate_fixture_for_save(fixture)
        self.assertTrue(any("success_ratio" in e for e in errors))

    def test_interaction_missing_text(self):
        fixture = _valid_fixture()
        fixture["interactions"][0]["text"] = ""
        errors = _validate_fixture_for_save(fixture)
        self.assertTrue(any("'text' is required" in e for e in errors))

    def test_unknown_check_type_rejected(self):
        fixture = _valid_fixture()
        fixture["interactions"][0]["response"]["text"] = {"regex": ["nope"]}
        errors = _validate_fixture_for_save(fixture)
        self.assertTrue(any("not a valid check type" in e for e in errors))

    def test_empty_interactions_short_circuits(self):
        fixture = _valid_fixture()
        fixture["interactions"] = []
        errors = _validate_fixture_for_save(fixture)
        self.assertEqual(errors, ["'interactions' must be a non-empty list."])


if __name__ == "__main__":
    unittest.main()
