
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
import os
import unittest

from neuro_san.internals.utils.file_of_class import FileOfClass

from nsflow.backend.utils.agentutils.agent_network_utils import AgentNetworkUtils


THIS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(THIS_DIR)
FIXTURES_DIR = os.path.join(ROOT_DIR, "fixtures")


class TestAgentNetwork(unittest.TestCase):
    def setUp(self):
        """Setup test instance."""
        self.agent_utils = AgentNetworkUtils()
        self.test_hocon_path = os.path.join(FIXTURES_DIR, "test_network.hocon")

        # Show full diff, no truncation
        # self.maxDiff = None

    def test_extract_connectivity_info(self):
        """Test extracting connectivity info from an HOCON network file."""
        expected_output = {
                    "connectivity": [
                        {"origin": "Airline 360 Assistant",
                         "tools": ["Baggage_Handling", "Flights", "International_Travel"]},
                        {"origin": "Baggage_Handling",
                         "tools": ["Carry_On_Baggage", "Checked_Baggage", "Bag_Issues",
                                   "Special_Items", "Bag_Fee_Calculator"]},
                        {"origin": "Carry_On_Baggage", "tools": ["ExtractPdf", "URLProvider"]},
                        {"origin": "Checked_Baggage", "tools": ["ExtractPdf", "URLProvider"]},
                        {"origin": "Bag_Issues", "tools": ["ExtractPdf", "URLProvider"]},
                        {"origin": "Special_Items", "tools": ["ExtractPdf", "URLProvider"]},
                        {"origin": "Bag_Fee_Calculator", "tools": ["URLProvider"]},
                        {"origin": "Flights",
                         "tools": ["Military_Personnel", "Basic_Economy_Restrictions", "Mileage_Plus"]},
                        {"origin": "Military_Personnel", "tools": ["ExtractPdf", "URLProvider"]},
                        {"origin": "Basic_Economy_Restrictions", "tools": ["ExtractPdf", "URLProvider"]},
                        {"origin": "Mileage_Plus", "tools": ["ExtractPdf"]},
                        {"origin": "International_Travel", "tools": ["International_Checked_Baggage", "Embargoes"]},
                        {"origin": "International_Checked_Baggage", "tools": ["ExtractPdf", "URLProvider"]},
                        {"origin": "Embargoes", "tools": ["ExtractPdf", "URLProvider"]},
                        {"origin": "extract_pdf.ExtractPdf"},
                        {"origin": "url_provider.URLProvider"}
                    ]
                }

        result = self.agent_utils.extract_connectivity_info(self.test_hocon_path)
        self.assertEqual(result, expected_output)


if __name__ == "__main__":
    unittest.main()
