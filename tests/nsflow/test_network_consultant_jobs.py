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

"""Tests for Network Consultant job lifecycle and status."""

import asyncio
from pathlib import Path
from unittest.mock import AsyncMock
from unittest.mock import Mock

import pytest

from nsflow.backend.utils.consultant_job import ConsultantJob
from nsflow.backend.utils.consultant_job_manager import ConsultantJobManager
from nsflow.backend.utils.job_not_found_error import JobNotFoundError
from nsflow.backend.utils.job_state_error import JobStateError


class TestNetworkConsultantJobs:
    """Verify status sidecars, answers, stopping, and unknown identifiers."""

    @staticmethod
    def configured_manager(
        tmp_path: Path,
        returncode: int | None = None,
    ) -> tuple[ConsultantJobManager, Mock, Path]:
        """Return a manager containing one mocked consultant job."""
        manager = ConsultantJobManager(str(tmp_path))
        log_directory = tmp_path / "logs" / "network_consultant_jobs"
        log_directory.mkdir(parents=True)
        log_path = log_directory / "job-1.log"
        log_path.write_text("first\nsecond\n", encoding="utf-8")
        job = Mock(spec=ConsultantJob)
        job.log_path.return_value = log_path
        job.agent_name.return_value = "basic/coffee"
        job.exit_code.return_value = returncode
        job.is_running.return_value = returncode is None
        job.wait = AsyncMock(return_value=0)
        manager.register("job-1", job)
        return manager, job, log_directory

    @staticmethod
    def test_status_reads_results_and_sidecar_files(tmp_path: Path) -> None:
        """Read logs, version branch, and fixture results into status."""
        manager, _, directory = TestNetworkConsultantJobs.configured_manager(tmp_path, returncode=0)
        (directory / "job-1.results.json").write_text(
            '{"coffee.hocon": {"passed": false, "message": "missing coffee"}}',
            encoding="utf-8",
        )
        (directory / "job-1.git_branch.txt").write_text("consultant/run-1\n", encoding="utf-8")

        status = asyncio.run(manager.status("job-1"))

        assert status.running is False
        assert status.log_tail == ["first", "second"]
        assert status.git_branch == "consultant/run-1"
        assert status.results[0].fixture == "coffee.hocon"
        assert status.results[0].passed is False

    @staticmethod
    def test_answer_requires_a_running_job_with_a_question(tmp_path: Path) -> None:
        """Only accept an answer while a running job has a pending question."""
        manager, _, directory = TestNetworkConsultantJobs.configured_manager(tmp_path)
        with pytest.raises(JobStateError):
            manager.answer("job-1", "answer")

        (directory / "job-1.question.txt").write_text("Which behavior?", encoding="utf-8")
        manager.answer("job-1", "Keep the current behavior")

        assert (directory / "job-1.answer.txt").read_text(encoding="utf-8") == "Keep the current behavior"

    @staticmethod
    def test_stop_terminates_a_running_job(tmp_path: Path) -> None:
        """Terminate a running job without killing it when it exits promptly."""
        manager, job, _ = TestNetworkConsultantJobs.configured_manager(tmp_path)

        assert asyncio.run(manager.stop("job-1")) is True
        job.terminate.assert_called_once_with()
        job.kill.assert_not_called()

    @staticmethod
    def test_unknown_job_is_reported(tmp_path: Path) -> None:
        """Report an identifier that is not registered with the manager."""
        manager = ConsultantJobManager(str(tmp_path))

        with pytest.raises(JobNotFoundError):
            asyncio.run(manager.status("missing"))
