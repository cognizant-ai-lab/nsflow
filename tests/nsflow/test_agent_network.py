import os
import unittest
from pathlib import Path
from nsflow.backend.utils.agent_network_utils import AgentNetworkUtils

ROOT_DIR = os.getcwd()
FIXTURES_DIR = os.path.join(ROOT_DIR, "tests", "fixtures")


class TestAgentNetwork(unittest.TestCase):
    def setUp(self):
        """Setup test instance."""
        self.agent_utils = AgentNetworkUtils()
        self.test_hocon_path = Path(os.path.join(FIXTURES_DIR, "test_network.hocon"))

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
