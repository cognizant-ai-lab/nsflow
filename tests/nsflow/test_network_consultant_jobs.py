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
from unittest.mock import patch

import pytest

from nsflow.backend.utils import consultant_job_manager as consultant_job_manager_module
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
        job.exit_code.return_value = returncode
        job.is_running.return_value = returncode is None
        job.wait = AsyncMock(return_value=0)
        job.stop = AsyncMock(return_value=returncode is None)
        job.close = AsyncMock()
        manager.register("job-1", job)
        return manager, job, log_directory

    @staticmethod
    def test_status_reads_results_and_sidecar_files(tmp_path: Path) -> None:
        """Read logs and fixture results into status."""
        manager, _, directory = TestNetworkConsultantJobs.configured_manager(tmp_path, returncode=0)
        (directory / "job-1.results.json").write_text(
            '{"coffee.hocon": {"passed": false, "message": "missing coffee"}}',
            encoding="utf-8",
        )
        status = asyncio.run(manager.status("job-1"))

        assert status.running is False
        assert status.results[0].fixture == "coffee.hocon"
        assert status.results[0].passed is False

    @staticmethod
    def test_status_returns_chart_without_writing_an_unused_snapshot(tmp_path: Path) -> None:
        """Return the rendered chart directly without accumulating an unserved PNG file."""
        manager, _, directory = TestNetworkConsultantJobs.configured_manager(tmp_path, returncode=0)
        (directory / "job-1.progress.jsonl").write_text(
            '{"check": 1, "checkpoint": "before", "passed": 1, "total": 2}\n',
            encoding="utf-8",
        )

        with patch.object(consultant_job_manager_module.NetworkConsultantChart, "png_bytes", return_value=b"png"):
            status = asyncio.run(manager.status("job-1"))

        assert status.progress_chart == "data:image/png;base64,cG5n"
        assert not (tmp_path / "logs" / "network_consultant_charts").exists()

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
        job.stop.assert_awaited_once_with(manager.STOP_GRACE_PERIOD_SECONDS)

    @staticmethod
    def test_malformed_progress_does_not_break_status(tmp_path: Path) -> None:
        """Ignore malformed checkpoints and return the rest of the job status."""
        manager, _, directory = TestNetworkConsultantJobs.configured_manager(tmp_path, returncode=0)
        (directory / "job-1.progress.jsonl").write_text(
            '{"passed": {}, "total": "broken", "segments": [1, null]}\nnot-json\n',
            encoding="utf-8",
        )

        status = asyncio.run(manager.status("job-1"))

        assert status.running is False
        assert status.progress_chart is None

    @staticmethod
    def test_chart_failure_does_not_break_status(tmp_path: Path) -> None:
        """Return status without a chart when the renderer rejects otherwise valid progress."""
        manager, _, directory = TestNetworkConsultantJobs.configured_manager(tmp_path, returncode=0)
        (directory / "job-1.progress.jsonl").write_text(
            '{"checkpoint": "before", "passed": 1, "total": 2}\n',
            encoding="utf-8",
        )

        with patch.object(
            consultant_job_manager_module.NetworkConsultantChart,
            "png_bytes",
            side_effect=ValueError("bad chart"),
        ):
            status = asyncio.run(manager.status("job-1"))

        assert status.progress_chart is None

    @staticmethod
    def test_pruning_removes_finished_files_and_job_record(tmp_path: Path) -> None:
        """Remove a completed job from storage and memory as one lifecycle operation."""
        manager, job, directory = TestNetworkConsultantJobs.configured_manager(tmp_path, returncode=0)

        asyncio.run(manager._prune_finished_jobs(directory))  # pylint: disable=protected-access

        job.close.assert_awaited_once_with(manager.STOP_GRACE_PERIOD_SECONDS)
        assert not (directory / "job-1.log").exists()
        with pytest.raises(JobNotFoundError):
            asyncio.run(manager.status("job-1"))

    @staticmethod
    def test_shutdown_closes_jobs_and_clears_the_registry(tmp_path: Path) -> None:
        """Release every registered job when the owning application shuts down."""
        manager, job, _ = TestNetworkConsultantJobs.configured_manager(tmp_path)

        asyncio.run(manager.shutdown())

        job.close.assert_awaited_once_with(manager.STOP_GRACE_PERIOD_SECONDS)
        with pytest.raises(JobNotFoundError):
            asyncio.run(manager.status("job-1"))

    @staticmethod
    def test_unknown_job_is_reported(tmp_path: Path) -> None:
        """Report an identifier that is not registered with the manager."""
        manager = ConsultantJobManager(str(tmp_path))

        with pytest.raises(JobNotFoundError):
            asyncio.run(manager.status("missing"))

    @staticmethod
    def test_start_uses_the_installed_studio_module(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Launch the consultant from the installable neuro_san_studio package."""
        process = Mock(pid=123)
        create_process = AsyncMock(return_value=process)
        monkeypatch.setattr(consultant_job_manager_module.asyncio, "create_subprocess_exec", create_process)
        monkeypatch.setattr(consultant_job_manager_module, "ConsultantJob", Mock())

        manager = ConsultantJobManager(str(tmp_path))
        asyncio.run(manager.start(["--hocon-file", "basic/coffee.hocon"], "basic/coffee", "session"))

        command = create_process.await_args.args
        assert command[:5] == (
            consultant_job_manager_module.sys.executable,
            "-u",
            "-m",
            "neuro_san_studio",
            "consultant",
        )

    @staticmethod
    def test_duplicate_owner_cannot_start_two_jobs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Reject a second running job for the same network and browser session."""
        process = Mock(pid=123)
        create_process = AsyncMock(return_value=process)
        job = Mock(spec=ConsultantJob)
        job.is_running.return_value = True
        monkeypatch.setattr(consultant_job_manager_module.asyncio, "create_subprocess_exec", create_process)
        monkeypatch.setattr(consultant_job_manager_module, "ConsultantJob", Mock(return_value=job))
        manager = ConsultantJobManager(str(tmp_path))

        asyncio.run(manager.start([], "basic/coffee", "session"))
        with pytest.raises(JobStateError):
            asyncio.run(manager.start([], "basic/coffee", "session"))

        assert create_process.await_count == 1
