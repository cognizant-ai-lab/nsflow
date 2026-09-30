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

import asyncio
from pathlib import Path
from types import SimpleNamespace

import pytest

from nsflow.backend.utils.network_consultant_jobs import ConsultantJobManager
from nsflow.backend.utils.network_consultant_jobs import JobNotFoundError
from nsflow.backend.utils.network_consultant_jobs import JobStateError


class FakeProcess:
    def __init__(self):
        self.terminated = False
        self.killed = False

    def terminate(self):
        self.terminated = True

    def kill(self):
        self.killed = True

    async def wait(self):
        return 0


def configured_manager(tmp_path: Path, returncode=None):
    manager = ConsultantJobManager(str(tmp_path))
    log_directory = tmp_path / "logs" / "network_consultant_jobs"
    log_directory.mkdir(parents=True)
    log_path = log_directory / "job-1.log"
    log_path.write_text("first\nsecond\n", encoding="utf-8")
    process = FakeProcess()
    manager.jobs["job-1"] = SimpleNamespace(
        process=process,
        log_path=log_path,
        agent_name="basic/coffee",
        returncode=returncode,
    )
    return manager, process, log_directory


def test_status_reads_results_and_sidecar_files(tmp_path: Path):
    manager, _, directory = configured_manager(tmp_path, returncode=0)
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


def test_answer_requires_a_running_job_with_a_question(tmp_path: Path):
    manager, _, directory = configured_manager(tmp_path)
    with pytest.raises(JobStateError):
        manager.answer("job-1", "answer")

    (directory / "job-1.question.txt").write_text("Which behavior?", encoding="utf-8")
    manager.answer("job-1", "Keep the current behavior")

    assert (directory / "job-1.answer.txt").read_text(encoding="utf-8") == "Keep the current behavior"


def test_stop_terminates_a_running_job(tmp_path: Path):
    manager, process, _ = configured_manager(tmp_path)

    assert asyncio.run(manager.stop("job-1")) is True
    assert process.terminated is True
    assert process.killed is False


def test_unknown_job_is_reported(tmp_path: Path):
    manager = ConsultantJobManager(str(tmp_path))

    with pytest.raises(JobNotFoundError):
        asyncio.run(manager.status("missing"))
