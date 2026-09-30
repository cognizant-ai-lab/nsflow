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

"""Process lifecycle and status persistence for Network Consultant jobs."""

import asyncio
import base64
import json
import logging
import os
import sys
import uuid
from pathlib import Path
from typing import Optional

from pydantic import ValidationError

from nsflow.backend.models.network_consultant_models import FixtureResult
from nsflow.backend.models.network_consultant_models import JobStatusResponse
from nsflow.backend.utils.logutils.websocket_logs_registry import LogsRegistry
from nsflow.backend.utils.network_consultant_chart import chart_png_bytes

LOG_TAIL_LINES = 200
STOP_GRACE_PERIOD_SECONDS = 5
TAIL_POLL_INTERVAL_SECONDS = 1.0
RESULT_FIELDS = {"passed", "message", "infrastructure_error"}

logger = logging.getLogger(__name__)


class JobNotFoundError(KeyError):
    """Raised when a consultant job ID is unknown to this server process."""


class JobStateError(RuntimeError):
    """Raised when an operation is invalid for a job's current state."""


class ConsultantJob:
    """One running or completed consultant subprocess."""

    def __init__(self, process: asyncio.subprocess.Process, log_path: Path, agent_name: str, session_id: str):
        self.process = process
        self.log_path = log_path
        self.agent_name = agent_name
        self.returncode: Optional[int] = None
        asyncio.create_task(self._wait())
        asyncio.create_task(self._tail_to_logs_panel(session_id))

    async def _wait(self) -> None:
        self.returncode = await self.process.wait()

    async def _tail_to_logs_panel(self, session_id: str) -> None:
        manager = LogsRegistry.register(self.agent_name, session_id)
        position = 0
        while True:
            lines, position = self._read_new_log_lines(position)
            for line in lines:
                stripped_line = line.rstrip("\n")
                if stripped_line:
                    await manager.log_event(stripped_line, source="NetworkConsultant")
            if self.returncode is not None:
                break
            await asyncio.sleep(TAIL_POLL_INTERVAL_SECONDS)

    def _read_new_log_lines(self, position: int) -> tuple[list[str], int]:
        try:
            with self.log_path.open("r", encoding="utf-8", errors="replace") as log_file:
                log_file.seek(position)
                lines = log_file.readlines()
                return lines, log_file.tell()
        except FileNotFoundError:
            return [], position


class ConsultantJobManager:
    """Start, inspect and stop consultant processes for one target project."""

    def __init__(self, project_root: str):
        self.project_root = Path(project_root).resolve()
        self.jobs: dict[str, ConsultantJob] = {}

    async def start(self, args: list[str], agent_name: str, session_id: str) -> str:
        """Start a job and return its generated identifier."""
        job_id = uuid.uuid4().hex
        log_directory = self.project_root / "logs" / "network_consultant_jobs"
        log_directory.mkdir(parents=True, exist_ok=True)
        self._clear_finished_job_files(log_directory)
        log_path = log_directory / f"{job_id}.log"

        with log_path.open("wb") as log_file:
            process = await asyncio.create_subprocess_exec(
                sys.executable,
                "-u",
                "-m",
                "apps.network_consultant.run",
                *args,
                cwd=self.project_root,
                stdout=log_file,
                stderr=asyncio.subprocess.STDOUT,
                env={**os.environ, "NSFLOW_JOB_ID": job_id, "NSFLOW_JOB_DIR": str(log_directory)},
            )

        self.jobs[job_id] = ConsultantJob(process, log_path, agent_name, session_id)
        logger.info("Started network_consultant job %s (pid=%s): %s", job_id, process.pid, args)
        return job_id

    async def status(self, job_id: str, theme: str = "light") -> JobStatusResponse:
        """Build a status response from process state and its sidecar files."""
        job = self._job(job_id)
        progress = self._read_progress(job_id, job.log_path.parent)
        progress_chart = await self._render_progress_chart(job_id, job, progress, theme)
        return JobStatusResponse(
            job_id=job_id,
            running=job.returncode is None,
            returncode=job.returncode,
            log_tail=self._read_log_tail(job.log_path),
            pending_question=self._read_optional_text(job_id, job.log_path.parent, "question"),
            tool_issues=self._read_lines(job_id, job.log_path.parent, "tool_issues"),
            ungrounded=self._read_lines(job_id, job.log_path.parent, "ungrounded"),
            progress_chart=progress_chart,
            git_branch=self._read_optional_text(job_id, job.log_path.parent, "git_branch"),
            results=self._read_results(job_id, job.log_path.parent),
        )

    def answer(self, job_id: str, answer: str) -> None:
        """Write an answer for a job waiting on clarification."""
        job = self._job(job_id)
        if job.returncode is not None:
            raise JobStateError("Job has already finished.")
        question_path = self._sidecar_path(job_id, job.log_path.parent, "question")
        if not question_path.is_file():
            raise JobStateError("This job isn't waiting on a clarification question.")
        self._sidecar_path(job_id, job.log_path.parent, "answer").write_text(answer, encoding="utf-8")

    async def stop(self, job_id: str) -> bool:
        """Stop a running job, returning False when it had already completed."""
        job = self._job(job_id)
        if job.returncode is not None:
            return False

        job.process.terminate()
        try:
            await asyncio.wait_for(job.process.wait(), timeout=STOP_GRACE_PERIOD_SECONDS)
        except asyncio.TimeoutError:
            logger.warning("Job %s did not stop after %ss; killing it.", job_id, STOP_GRACE_PERIOD_SECONDS)
            job.process.kill()
            await job.process.wait()
        return True

    def _job(self, job_id: str) -> ConsultantJob:
        try:
            return self.jobs[job_id]
        except KeyError as error:
            raise JobNotFoundError(job_id) from error

    def _clear_finished_job_files(self, log_directory: Path) -> None:
        for path in log_directory.iterdir():
            job = self.jobs.get(path.name.split(".", 1)[0])
            if job is not None and job.returncode is None:
                continue
            try:
                path.unlink()
            except OSError as error:
                logger.warning("Could not remove leftover job file %s: %s", path.name, error)

    @staticmethod
    def _read_log_tail(log_path: Path) -> list[str]:
        try:
            lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
            return [line.rstrip("\n") for line in lines[-LOG_TAIL_LINES:]]
        except FileNotFoundError:
            return []

    @staticmethod
    def _sidecar_path(job_id: str, directory: Path, suffix: str) -> Path:
        extension = "json" if suffix == "results" else "jsonl" if suffix == "progress" else "txt"
        return directory / f"{job_id}.{suffix}.{extension}"

    def _read_optional_text(self, job_id: str, directory: Path, suffix: str) -> Optional[str]:
        try:
            return self._sidecar_path(job_id, directory, suffix).read_text(encoding="utf-8").strip() or None
        except FileNotFoundError:
            return None

    def _read_lines(self, job_id: str, directory: Path, suffix: str) -> list[str]:
        text = self._read_optional_text(job_id, directory, suffix)
        return [line for line in (text or "").splitlines() if line]

    def _read_results(self, job_id: str, directory: Path) -> list[FixtureResult]:
        try:
            recorded = json.loads(self._sidecar_path(job_id, directory, "results").read_text(encoding="utf-8"))
            if not isinstance(recorded, dict):
                return []
            return [
                FixtureResult(fixture=name, **{key: value for key, value in verdict.items() if key in RESULT_FIELDS})
                for name, verdict in sorted(recorded.items())
                if isinstance(verdict, dict)
            ]
        except (FileNotFoundError, json.JSONDecodeError, ValidationError):
            return []

    def _read_progress(self, job_id: str, directory: Path) -> list[dict]:
        try:
            lines = self._sidecar_path(job_id, directory, "progress").read_text(encoding="utf-8").splitlines()
        except FileNotFoundError:
            return []

        progress: list[dict] = []
        for line in lines:
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(entry, dict):
                progress.append(entry)
        return progress

    async def _render_progress_chart(
        self,
        job_id: str,
        job: ConsultantJob,
        progress: list[dict],
        theme: str,
    ) -> Optional[str]:
        if not progress:
            return None
        png_bytes = await asyncio.to_thread(chart_png_bytes, progress, theme)
        await asyncio.to_thread(self._save_chart_snapshot, job.agent_name, job_id, progress, png_bytes)
        return f"data:image/png;base64,{base64.b64encode(png_bytes).decode('ascii')}"

    def _save_chart_snapshot(self, agent_name: str, job_id: str, progress: list[dict], png_bytes: bytes) -> None:
        charts_directory = self.project_root / "logs" / "network_consultant_charts"
        charts_directory.mkdir(parents=True, exist_ok=True)
        safe_name = agent_name.replace("/", "_")
        check_number = int(progress[-1].get("check", len(progress)))
        path = charts_directory / f"{safe_name}_{job_id}_check{check_number:03d}.png"
        if not path.exists():
            path.write_bytes(png_bytes)
