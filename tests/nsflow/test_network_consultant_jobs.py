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
import os
from pathlib import Path
from unittest.mock import AsyncMock
from unittest.mock import Mock
from unittest.mock import patch

import pytest
from pydantic import ValidationError

from nsflow.backend.models.network_consultant.answer_job_request import AnswerJobRequest
from nsflow.backend.utils import consultant_job_manager as consultant_job_manager_module
from nsflow.backend.utils.consultant_job import ConsultantJob
from nsflow.backend.utils.consultant_job_manager import ConsultantJobManager
from nsflow.backend.utils.job_not_found_error import JobNotFoundError
from nsflow.backend.utils.job_state_error import JobStateError


class TestNetworkConsultantJobs:
    """Verify status sidecars, answers, stopping, and unknown identifiers."""

    JOB_ID = "11111111111111111111111111111111"

    @staticmethod
    def configured_manager(
        tmp_path: Path,
        returncode: int | None = None,
    ) -> tuple[ConsultantJobManager, Mock, Path]:
        """Return a manager containing one mocked consultant job."""
        manager = ConsultantJobManager(str(tmp_path))
        log_directory = tmp_path / "logs" / "network_consultant_jobs"
        log_directory.mkdir(parents=True)
        log_path = log_directory / f"{TestNetworkConsultantJobs.JOB_ID}.log"
        log_path.write_text("first\nsecond\n", encoding="utf-8")
        job = Mock(spec=ConsultantJob)
        job.log_path.return_value = log_path
        job.exit_code.return_value = returncode
        job.is_running.return_value = returncode is None
        job.wait = AsyncMock(return_value=0)
        job.stop = AsyncMock(return_value=returncode is None)
        job.close = AsyncMock()
        manager.register(TestNetworkConsultantJobs.JOB_ID, job, "basic/coffee", "improve")
        return manager, job, log_directory

    @staticmethod
    def test_active_job_returns_a_running_job(tmp_path: Path) -> None:
        """Return the active job and the action that started it."""
        manager, _, _ = TestNetworkConsultantJobs.configured_manager(tmp_path)

        active_job = manager.active_job("basic/coffee")

        assert active_job is not None
        assert active_job.job_id == TestNetworkConsultantJobs.JOB_ID
        assert active_job.origin == "improve"

    @staticmethod
    def test_active_job_ignores_a_finished_job(tmp_path: Path) -> None:
        """Do not restore a completed job that still owns its network entry."""
        manager, _, _ = TestNetworkConsultantJobs.configured_manager(tmp_path, returncode=0)

        assert manager.active_job("basic/coffee") is None

    @staticmethod
    def test_active_job_returns_none_for_an_unknown_network(tmp_path: Path) -> None:
        """Return no job when a network has never started one."""
        manager = ConsultantJobManager(str(tmp_path))

        assert manager.active_job("basic/missing") is None

    @staticmethod
    def test_status_reads_results_and_sidecar_files(tmp_path: Path) -> None:
        """Read logs and fixture results into status."""
        manager, _, directory = TestNetworkConsultantJobs.configured_manager(tmp_path, returncode=0)
        (directory / f"{TestNetworkConsultantJobs.JOB_ID}.results.json").write_text(
            '{"coffee.hocon": {"passed": false, "message": "missing coffee"}}',
            encoding="utf-8",
        )
        status = asyncio.run(manager.status(TestNetworkConsultantJobs.JOB_ID))

        assert status.running is False
        assert status.results[0].fixture == "coffee.hocon"
        assert status.results[0].passed is False

    @staticmethod
    def test_status_returns_structured_progress(tmp_path: Path) -> None:
        """Return validated checkpoints for client-side chart rendering."""
        manager, _, directory = TestNetworkConsultantJobs.configured_manager(tmp_path, returncode=0)
        (directory / f"{TestNetworkConsultantJobs.JOB_ID}.progress.jsonl").write_text(
            '{"check": 1, "checkpoint": "before", "passed": 1, "total": 2}\n',
            encoding="utf-8",
        )

        status = asyncio.run(manager.status(TestNetworkConsultantJobs.JOB_ID))

        assert len(status.progress) == 1
        assert status.progress[0].checkpoint == "before"
        assert status.progress[0].passed == 1
        assert status.progress[0].total == 2

    @staticmethod
    def test_answer_requires_a_running_job_with_a_question(tmp_path: Path) -> None:
        """Only accept an answer while a running job has a pending question."""
        manager, _, directory = TestNetworkConsultantJobs.configured_manager(tmp_path)
        with pytest.raises(JobStateError):
            manager.answer(TestNetworkConsultantJobs.JOB_ID, "answer")

        (directory / f"{TestNetworkConsultantJobs.JOB_ID}.question.txt").write_text(
            "Which behavior?", encoding="utf-8"
        )
        manager.answer(TestNetworkConsultantJobs.JOB_ID, "Keep the current behavior")

        answer_path = directory / f"{TestNetworkConsultantJobs.JOB_ID}.answer.txt"
        assert answer_path.read_text(encoding="utf-8") == "Keep the current behavior"

    @staticmethod
    def test_answer_is_published_atomically(tmp_path: Path) -> None:
        """Publish a complete clarification answer through an atomic replacement."""
        manager, _, directory = TestNetworkConsultantJobs.configured_manager(tmp_path)
        (directory / f"{TestNetworkConsultantJobs.JOB_ID}.question.txt").write_text(
            "Which behavior?", encoding="utf-8"
        )
        with patch("nsflow.backend.utils.consultant_job_manager.os.replace", wraps=os.replace) as replace:
            manager.answer(TestNetworkConsultantJobs.JOB_ID, "Keep the current behavior")

        replace.assert_called_once()
        answer_path = directory / f"{TestNetworkConsultantJobs.JOB_ID}.answer.txt"
        assert answer_path.read_text(encoding="utf-8") == "Keep the current behavior"

    @staticmethod
    def test_blank_answer_is_rejected() -> None:
        """Reject clarification answers that contain no visible text."""
        with pytest.raises(ValidationError):
            AnswerJobRequest(answer="   \n")

    @staticmethod
    def test_stop_terminates_a_running_job(tmp_path: Path) -> None:
        """Terminate a running job without killing it when it exits promptly."""
        manager, job, _ = TestNetworkConsultantJobs.configured_manager(tmp_path)

        assert asyncio.run(manager.stop(TestNetworkConsultantJobs.JOB_ID)) is True
        job.stop.assert_awaited_once_with(manager.STOP_GRACE_PERIOD_SECONDS)

    @staticmethod
    def test_malformed_progress_does_not_break_status(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
        """Warn about malformed checkpoints and return the rest of the job status."""
        manager, _, directory = TestNetworkConsultantJobs.configured_manager(tmp_path, returncode=0)
        (directory / f"{TestNetworkConsultantJobs.JOB_ID}.progress.jsonl").write_text(
            '{"passed": {}, "total": "broken", "segments": [1, null]}\nnot-json\n',
            encoding="utf-8",
        )

        status = asyncio.run(manager.status(TestNetworkConsultantJobs.JOB_ID))

        assert status.running is False
        assert status.progress == []
        assert "Ignoring malformed progress" in caplog.text

    @staticmethod
    def test_malformed_results_are_reported(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
        """Warn when a results sidecar cannot be decoded."""
        manager, _, directory = TestNetworkConsultantJobs.configured_manager(tmp_path, returncode=0)
        (directory / f"{TestNetworkConsultantJobs.JOB_ID}.results.json").write_text("not-json", encoding="utf-8")

        status = asyncio.run(manager.status(TestNetworkConsultantJobs.JOB_ID))

        assert status.results == []
        assert "Ignoring malformed results" in caplog.text

    @staticmethod
    def test_releasing_finished_job_preserves_its_files(tmp_path: Path) -> None:
        """Release a completed in-memory job without deleting its persisted output."""
        manager, job, directory = TestNetworkConsultantJobs.configured_manager(tmp_path, returncode=0)

        asyncio.run(manager._release_finished_jobs())  # pylint: disable=protected-access

        job.close.assert_awaited_once_with(manager.STOP_GRACE_PERIOD_SECONDS)
        log_path = directory / f"{TestNetworkConsultantJobs.JOB_ID}.log"
        assert log_path.read_text(encoding="utf-8") == "first\nsecond\n"
        with pytest.raises(JobNotFoundError):
            asyncio.run(manager.status(TestNetworkConsultantJobs.JOB_ID))

    @staticmethod
    def test_latest_job_and_results_survive_manager_restart(
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Discover the latest persisted run and its results in a new manager."""
        process = Mock(pid=123)
        create_process = AsyncMock(return_value=process)
        job = Mock(spec=ConsultantJob)
        job.is_running.return_value = True
        monkeypatch.setattr(consultant_job_manager_module.asyncio, "create_subprocess_exec", create_process)
        monkeypatch.setattr(consultant_job_manager_module, "ConsultantJob", Mock(return_value=job))
        manager = ConsultantJobManager(str(tmp_path))

        job_id = asyncio.run(manager.start([], "basic/coffee", "session", "tests"))
        directory = tmp_path / "logs" / "network_consultant_jobs"
        (directory / f"{job_id}.results.json").write_text(
            '{"coffee.hocon": {"passed": true}}',
            encoding="utf-8",
        )

        restored_manager = ConsultantJobManager(str(tmp_path))
        latest = restored_manager.latest_job("basic/coffee")
        status = asyncio.run(restored_manager.status(job_id))

        assert latest is not None
        assert latest.job_id == job_id
        assert latest.origin == "tests"
        assert status.running is False
        assert status.results[0].fixture == "coffee.hocon"
        assert status.results[0].passed is True

    @staticmethod
    def test_shutdown_closes_jobs_and_clears_the_registry(tmp_path: Path) -> None:
        """Release every registered job when the owning application shuts down."""
        manager, job, _ = TestNetworkConsultantJobs.configured_manager(tmp_path)

        asyncio.run(manager.shutdown())

        job.close.assert_awaited_once_with(manager.STOP_GRACE_PERIOD_SECONDS)
        with pytest.raises(JobNotFoundError):
            asyncio.run(manager.status(TestNetworkConsultantJobs.JOB_ID))

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
        asyncio.run(
            manager.start(
                ["--hocon-file", "basic/coffee.hocon"],
                "basic/coffee",
                "session",
                "tests",
            )
        )

        command = create_process.await_args.args
        options = create_process.await_args.kwargs
        assert command[:5] == (
            consultant_job_manager_module.sys.executable,
            "-u",
            "-m",
            "neuro_san_studio",
            "consultant",
        )
        assert options.get("start_new_session") is True

    @staticmethod
    def test_duplicate_network_cannot_start_two_jobs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Reject a second running job for the same network after the browser session changes."""
        process = Mock(pid=123)
        create_process = AsyncMock(return_value=process)
        job = Mock(spec=ConsultantJob)
        job.is_running.return_value = True
        monkeypatch.setattr(consultant_job_manager_module.asyncio, "create_subprocess_exec", create_process)
        monkeypatch.setattr(consultant_job_manager_module, "ConsultantJob", Mock(return_value=job))
        manager = ConsultantJobManager(str(tmp_path))

        asyncio.run(manager.start([], "basic/coffee", "session", "improve"))
        with pytest.raises(JobStateError):
            asyncio.run(manager.start([], "basic/coffee", "reloaded-session", "improve"))

        assert create_process.await_count == 1
