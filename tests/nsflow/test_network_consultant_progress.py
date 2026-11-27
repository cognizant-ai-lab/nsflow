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

"""Tests for persisted Network Consultant progress."""

import unittest
import uuid
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from nsflow.backend.utils.consultant_job_manager import ConsultantJobManager


class TestNetworkConsultantProgress(unittest.TestCase):
    """Verify progress-file failures remain actionable."""

    def test_logs_unreadable_progress_file(self) -> None:
        """Explain why existing progress could not be restored instead of failing silently."""
        with TemporaryDirectory() as directory:
            manager = ConsultantJobManager(directory)
            with (
                patch.object(Path, "read_text", side_effect=UnicodeError("invalid encoding")),
                self.assertLogs("nsflow.backend.utils.consultant_job_manager", level="WARNING") as recorded,
            ):
                progress = manager._read_progress(  # pylint: disable=protected-access
                    uuid.uuid4().hex,
                    Path(directory),
                )

        self.assertEqual(progress, [])
        self.assertIn("invalid encoding", recorded.output[0])
