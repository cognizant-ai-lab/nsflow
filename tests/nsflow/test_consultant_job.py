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

"""Tests for ownership of one Network Consultant subprocess and its log task."""

import asyncio
import unittest
from functools import partial
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import AsyncMock
from unittest.mock import Mock
from unittest.mock import patch

from nsflow.backend.utils.consultant_job import ConsultantJob


class TestConsultantJob(unittest.IsolatedAsyncioTestCase):
    """Verify subprocess completion, final log delivery, and forced shutdown."""

    async def test_close_awaits_completion_and_final_log_delivery(self) -> None:
        """Keep owned tasks alive until the process and log tail have both completed."""
        process = Mock()
        process.wait = AsyncMock(return_value=0)
        log_manager = Mock()
        log_manager.log_event = AsyncMock()
        with TemporaryDirectory() as directory:
            log_path = Path(directory) / "job.log"
            log_path.write_text("final line\n", encoding="utf-8")
            with patch(
                "nsflow.backend.utils.consultant_job.LogsRegistry.register",
                return_value=log_manager,
            ):
                job = ConsultantJob(process, log_path, "basic/coffee", "session")
                await job.close(0.1)

        self.assertFalse(job.is_running())
        self.assertEqual(job.exit_code(), 0)
        log_manager.log_event.assert_awaited_once_with("final line", source="NetworkConsultant")

    async def test_close_kills_a_process_that_ignores_terminate(self) -> None:
        """Force-kill a process after its graceful shutdown deadline expires."""
        completion = asyncio.get_running_loop().create_future()
        process = Mock()
        process.wait = AsyncMock(side_effect=partial(self._wait_for_completion, completion))
        process.kill.side_effect = partial(self._complete_process, completion, 9)
        log_manager = Mock()
        log_manager.log_event = AsyncMock()
        with TemporaryDirectory() as directory:
            log_path = Path(directory) / "job.log"
            log_path.write_text("", encoding="utf-8")
            with (
                patch.object(ConsultantJob, "TAIL_POLL_INTERVAL_SECONDS", 0),
                patch(
                    "nsflow.backend.utils.consultant_job.LogsRegistry.register",
                    return_value=log_manager,
                ),
            ):
                job = ConsultantJob(process, log_path, "basic/coffee", "session")
                await job.close(0.001)

        process.terminate.assert_called_once_with()
        process.kill.assert_called_once_with()
        self.assertEqual(job.exit_code(), 9)

    @staticmethod
    async def _wait_for_completion(completion: asyncio.Future[int]) -> int:
        """Wait for a test-controlled process completion value."""
        return await completion

    @staticmethod
    def _complete_process(completion: asyncio.Future[int], returncode: int) -> None:
        """Resolve a test-controlled process completion value."""
        completion.set_result(returncode)
