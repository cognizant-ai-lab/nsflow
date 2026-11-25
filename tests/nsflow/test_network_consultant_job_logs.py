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

"""Tests for persisted Network Consultant job output."""

import unittest
import uuid
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import Mock
from unittest.mock import patch

from nsflow.backend.utils.consultant_job_manager import ConsultantJobManager


class TestNetworkConsultantJobLogs(unittest.TestCase):
    """Verify incremental log reads and actionable progress-file failures."""

    def test_reads_only_new_log_content(self) -> None:
        """Return a cursor that retrieves only content appended after the first read."""
        with TemporaryDirectory() as directory:
            root = Path(directory)
            manager = ConsultantJobManager(directory)
            job_id = uuid.uuid4().hex
            manager.register(job_id, Mock())
            log_directory = root / "logs" / "network_consultant_jobs"
            log_directory.mkdir(parents=True)
            log_path = log_directory / f"{job_id}.log"
            log_path.write_text("first line\n", encoding="utf-8")

            first = manager.log(job_id)
            with log_path.open("a", encoding="utf-8") as log_file:
                log_file.write("second line\n")
            second = manager.log(job_id, first.next_offset)

        self.assertEqual(first.content, "first line\n")
        self.assertEqual(second.content, "second line\n")
        self.assertEqual(second.start_offset, first.next_offset)

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
