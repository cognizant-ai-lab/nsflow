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

"""Tests for Network Consultant chart rendering."""

import unittest
from typing import Any

from nsflow.backend.utils.network_consultant_chart import NetworkConsultantChart


class TestNetworkConsultantChart(unittest.TestCase):
    """Verify progress normalization, labels, colors, and PNG output."""

    def test_before_and_after_use_eighty_percent_threshold(self) -> None:
        """Use red below 80 percent and green at or above it."""
        colors = NetworkConsultantChart.PALETTE.get("light", {})
        self.assertEqual(NetworkConsultantChart.threshold_color(7, 10, colors), colors.get("red"))
        self.assertEqual(NetworkConsultantChart.threshold_color(8, 10, colors), colors.get("green"))
        self.assertEqual(NetworkConsultantChart.threshold_color(10, 10, colors), colors.get("green"))

    def test_generate_tests_bar_is_named_and_threshold_colored(self) -> None:
        """Name a generated full-suite result Test run and render it as a PNG."""
        progress: list[dict[str, Any]] = [
            {"check": 1, "checkpoint": "generated", "passed": 3, "total": 4, "segments": [3]}
        ]
        self.assertEqual(NetworkConsultantChart.x_labels(progress), ["Test run"])
        self.assertEqual(NetworkConsultantChart.normalized_segments(progress[0]), [3])
        self.assertTrue(NetworkConsultantChart.png_bytes(progress, "light").startswith(b"\x89PNG\r\n\x1a\n"))

    def test_labels_support_repeated_after_checkpoints(self) -> None:
        """Label repeated full-suite checkpoints without losing iteration numbers."""
        progress: list[dict[str, Any]] = [
            {"checkpoint": "before", "check": 1},
            {"checkpoint": "iteration", "check": 2, "improvement_iteration": 1},
            {"checkpoint": "after", "check": 3},
            {"checkpoint": "iteration", "check": 4, "improvement_iteration": 2},
            {"checkpoint": "after", "check": 5},
        ]
        self.assertEqual(NetworkConsultantChart.x_labels(progress), ["Before", "1", "After", "2", "After"])

    def test_iteration_segments_are_clamped_to_passed_total(self) -> None:
        """Clamp stacked segments so their sum cannot exceed the passed count."""
        entry: dict[str, Any] = {"checkpoint": "iteration", "passed": 5, "segments": [2, 2, 99]}
        self.assertEqual(NetworkConsultantChart.normalized_segments(entry), [2, 2, 1])

    def test_chart_renders_png_for_stacked_iterations(self) -> None:
        """Render mixed full-suite and stacked iteration checkpoints."""
        progress: list[dict[str, Any]] = [
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
        self.assertTrue(NetworkConsultantChart.png_bytes(progress, "dark").startswith(b"\x89PNG\r\n\x1a\n"))
