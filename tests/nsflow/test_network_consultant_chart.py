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

from nsflow.backend.api.v1.network_consultant_endpoints import _CHART_PALETTE
from nsflow.backend.api.v1.network_consultant_endpoints import _chart_png_bytes
from nsflow.backend.api.v1.network_consultant_endpoints import _chart_x_labels
from nsflow.backend.api.v1.network_consultant_endpoints import _normalized_segments
from nsflow.backend.api.v1.network_consultant_endpoints import _threshold_color


class TestNetworkConsultantChart(unittest.TestCase):
    def test_before_and_after_use_eighty_percent_threshold(self):
        colors = _CHART_PALETTE["light"]
        self.assertEqual(_threshold_color(7, 10, colors), colors["red"])
        self.assertEqual(_threshold_color(8, 10, colors), colors["green"])
        self.assertEqual(_threshold_color(10, 10, colors), colors["green"])

    def test_generate_tests_bar_is_named_and_threshold_coloured(self):
        """Generate Tests charts one full-suite bar of its own, labelled "Test run". It is not
        "Before" -- that name is the Self-Improve run's -- but it is a real-ratio result, so it
        is red/green, not blue."""
        progress = [{"check": 1, "checkpoint": "generated", "passed": 3, "total": 4, "segments": [3]}]
        self.assertEqual(_chart_x_labels(progress), ["Test run"])
        self.assertEqual(_normalized_segments(progress[0]), [3])
        self.assertTrue(_chart_png_bytes(progress, "light").startswith(b"\x89PNG\r\n\x1a\n"))

    def test_labels_support_repeated_after_checkpoints(self):
        progress = [
            {"checkpoint": "before", "check": 1},
            {"checkpoint": "iteration", "check": 2, "improvement_iteration": 1},
            {"checkpoint": "after", "check": 3},
            {"checkpoint": "iteration", "check": 4, "improvement_iteration": 2},
            {"checkpoint": "after", "check": 5},
        ]
        self.assertEqual(_chart_x_labels(progress), ["Before", "1", "After", "2", "After"])

    def test_iteration_segments_are_clamped_to_passed_total(self):
        entry = {"checkpoint": "iteration", "passed": 5, "segments": [2, 2, 99]}
        self.assertEqual(_normalized_segments(entry), [2, 2, 1])

    def test_chart_renders_png_for_stacked_iterations(self):
        progress = [
            {"check": 1, "checkpoint": "before", "passed": 2, "total": 5, "segments": [2]},
            {
                "check": 2,
                "checkpoint": "iteration",
                "improvement_iteration": 1,
                "passed": 4,
                "total": 5,
                "segments": [2, 2],
            },
            {"check": 3, "checkpoint": "after", "passed": 4, "total": 5, "segments": [4]},
        ]
        self.assertTrue(_chart_png_bytes(progress, "dark").startswith(b"\x89PNG\r\n\x1a\n"))


if __name__ == "__main__":
    unittest.main()
