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

"""Process management and status persistence for Network Consultant jobs."""

import asyncio
import json
import logging
import os
import sys
import tempfile
import uuid
from pathlib import Path
from typing import ClassVar

from pydantic import ValidationError

from nsflow.backend.models.network_consultant.active_job_response import ActiveJobResponse
from nsflow.backend.models.network_consultant.active_job_response import ConsultantJobOrigin
from nsflow.backend.models.network_consultant.consultant_progress_entry import ConsultantProgressEntry
from nsflow.backend.models.network_consultant.fixture_result import FixtureResult
from nsflow.backend.models.network_consultant.job_status_response import JobStatusResponse
from nsflow.backend.utils.consultant_job import ConsultantJob
from nsflow.backend.utils.job_not_found_error import JobNotFoundError
from nsflow.backend.utils.job_state_error import JobStateError

logger = logging.getLogger(__name__)


class ConsultantJobManager:
    """Start, inspect, and stop consultant processes for one target project."""

    STOP_GRACE_PERIOD_SECONDS = 5
    RESULT_FIELDS: ClassVar[set[str]] = {"passed", "message", "infrastructure_error"}
    SIDECAR_EXTENSIONS: ClassVar[dict[str, str]] = {"progress": "jsonl", "results": "json"}

    def __init__(self, project_root: str) -> None:
        """Create a manager for consultant jobs in one target project."""
        self._project_root = Path(project_root).resolve()
        self._jobs: dict[str, ConsultantJob] = {}
        self._job_owners: dict[str, str] = {}
        self._job_origins: dict[str, ConsultantJobOrigin] = {}
        self._start_lock = asyncio.Lock()

    async def start(
        self,
        args: list[str],
        agent_name: str,
        session_id: str,
        origin: ConsultantJobOrigin,
    ) -> str:
        """Start a job and return its generated identifier."""
        async with self._start_lock:
            job_id = uuid.uuid4().hex
            log_directory = self._log_directory()
            log_directory.mkdir(parents=True, exist_ok=True)
            await self._prune_finished_jobs(log_directory)
            owner = agent_name
            active_job_id = self._job_owners.get(owner)
            if active_job_id is not None:
                raise JobStateError(f"Job '{active_job_id}' is already running for this network.")
            log_path = log_directory / f"{job_id}.log"
            try:
                with log_path.open("wb") as log_file:
                    process = await asyncio.create_subprocess_exec(
                        sys.executable,
                        "-u",
                        "-m",
                        "neuro_san_studio",
                        "consultant",
                        *args,
                        cwd=self._project_root,
                        stdout=log_file,
                        stderr=asyncio.subprocess.STDOUT,
                        env={**os.environ, "NSFLOW_JOB_ID": job_id, "NSFLOW_JOB_DIR": str(log_directory)},
                        # Give the job its own process group, so Stop also reaches studio's worker process.
                        start_new_session=True,
                    )
            except OSError:
                self._remove_job_files(job_id)
                raise

            self.register(job_id, ConsultantJob(process, log_path, agent_name, session_id), owner, origin)
        logger.info("Started network_consultant job %s (pid=%s): %s", job_id, process.pid, args)
        return job_id

    def register(
        self,
        job_id: str,
        job: ConsultantJob,
        owner: str | None = None,
        origin: ConsultantJobOrigin | None = None,
    ) -> None:
        """Register a job for lifecycle and status operations."""
        self._jobs.update({job_id: job})
        if owner is not None:
            self._job_owners.update({owner: job_id})
        if origin is not None:
            self._job_origins.update({job_id: origin})

    def active_job(self, agent_name: str) -> ActiveJobResponse | None:
        """Return a network's running job and its origin, if present."""
        job_id = self._job_owners.get(agent_name)
        if job_id is None:
            return None
        job = self._jobs.get(job_id)
        origin = self._job_origins.get(job_id)
        if job is None or origin is None or not job.is_running():
            return None
        return ActiveJobResponse(job_id=job_id, origin=origin)

    async def status(self, job_id: str) -> JobStatusResponse:
        """Build a status response from process state and its sidecar files."""
        job_id = self._safe_job_id(job_id)
        job = self._job(job_id)
        log_directory = job.log_path().parent
        return JobStatusResponse(
            job_id=job_id,
            running=job.is_running(),
            returncode=job.exit_code(),
            pending_question=self._read_optional_text(job_id, log_directory, "question"),
            tool_issues=self._read_lines(job_id, log_directory, "tool_issues"),
            ungrounded=self._read_lines(job_id, log_directory, "ungrounded"),
            progress=self._read_progress(job_id, log_directory),
            results=self._read_results(job_id, log_directory),
        )

    def answer(self, job_id: str, answer: str) -> None:
        """Write an answer for a job waiting on clarification."""
        job_id = self._safe_job_id(job_id)
        job = self._job(job_id)
        if not job.is_running():
            raise JobStateError("Job has already finished.")
        directory = job.log_path().parent
        question_path = self._sidecar_path(job_id, directory, "question")
        if not question_path.is_file():
            raise JobStateError("This job isn't waiting on a clarification question.")
        answer_path = self._sidecar_path(job_id, directory, "answer")
        descriptor, temporary_path = tempfile.mkstemp(dir=directory)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as temporary_file:
                temporary_file.write(answer)
            os.replace(temporary_path, answer_path)
        except OSError:
            if os.path.exists(temporary_path):
                os.remove(temporary_path)
            raise

    async def stop(self, job_id: str) -> bool:
        """Stop a running job, returning False when it had already completed."""
        job_id = self._safe_job_id(job_id)
        job = self._job(job_id)
        return await job.stop(self.STOP_GRACE_PERIOD_SECONDS)

    async def shutdown(self) -> None:
        """Stop every registered job and release all manager-owned background work."""
        jobs = list(self._jobs.values())
        for job in jobs:
            try:
                await job.close(self.STOP_GRACE_PERIOD_SECONDS)
            except (OSError, RuntimeError) as error:
                logger.error("Could not close a Network Consultant job: %s", error)
        self._jobs.clear()
        self._job_owners.clear()
        self._job_origins.clear()

    def _job(self, job_id: str) -> ConsultantJob:
        """Return a registered job or report an unknown identifier."""
        job = self._jobs.get(job_id)
        if job is None:
            raise JobNotFoundError(job_id)
        return job

    @staticmethod
    def _safe_job_id(job_id: str) -> str:
        """Return a canonical generated job identifier or report it as unknown."""
        try:
            parsed_job_id = uuid.UUID(job_id).hex
        except ValueError as error:
            raise JobNotFoundError(job_id) from error
        if parsed_job_id != job_id:
            raise JobNotFoundError(job_id)
        return parsed_job_id

    async def _prune_finished_jobs(self, log_directory: Path) -> None:
        """Remove completed records and artifacts owned by this manager."""
        finished_job_ids: list[str] = []
        for job_id, job in self._jobs.items():
            if not job.is_running():
                try:
                    await job.close(self.STOP_GRACE_PERIOD_SECONDS)
                except (OSError, RuntimeError) as error:
                    logger.warning("Could not finish cleanup for Network Consultant job %s: %s", job_id, error)
                finished_job_ids.append(job_id)
        for job_id in finished_job_ids:
            self._jobs.pop(job_id, None)
            self._job_origins.pop(job_id, None)
        self._job_owners = {
            owner: job_id for owner, job_id in self._job_owners.items() if job_id not in finished_job_ids
        }

        for job_id in finished_job_ids:
            self._remove_job_files(job_id, log_directory)

    def _log_directory(self) -> Path:
        """Return the persistent Network Consultant job directory."""
        return self._project_root / "logs" / "network_consultant_jobs"

    def _remove_job_files(self, job_id: str, directory: Path | None = None) -> None:
        """Remove artifacts owned by one job."""
        for path in (directory or self._log_directory()).glob(f"{job_id}.*"):
            try:
                path.unlink()
            except OSError as error:
                logger.warning("Could not remove failed job file %s: %s", path.name, error)

    @staticmethod
    def _sidecar_path(job_id: str, directory: Path, suffix: str) -> Path:
        """Return the path for one job sidecar file."""
        extension = ConsultantJobManager.SIDECAR_EXTENSIONS.get(suffix, "txt")
        return directory / f"{job_id}.{suffix}.{extension}"

    def _read_optional_text(self, job_id: str, directory: Path, suffix: str) -> str | None:
        """Read optional sidecar text, returning None when absent or blank."""
        try:
            return self._sidecar_path(job_id, directory, suffix).read_text(encoding="utf-8").strip() or None
        except FileNotFoundError:
            return None

    def _read_lines(self, job_id: str, directory: Path, suffix: str) -> list[str]:
        """Read nonblank lines from an optional sidecar file."""
        text = self._read_optional_text(job_id, directory, suffix)
        return [line for line in (text or "").splitlines() if line]

    def _read_results(self, job_id: str, directory: Path) -> list[FixtureResult]:
        """Read valid per-fixture results from a job sidecar file."""
        try:
            recorded = json.loads(self._sidecar_path(job_id, directory, "results").read_text(encoding="utf-8"))
            if not isinstance(recorded, dict):
                return []
            return [
                FixtureResult(
                    fixture=name, **{key: value for key, value in verdict.items() if key in self.RESULT_FIELDS}
                )
                for name, verdict in sorted(recorded.items())
                if isinstance(name, str) and isinstance(verdict, dict)
            ]
        except FileNotFoundError:
            return []
        except (json.JSONDecodeError, OSError, UnicodeError, ValidationError) as error:
            logger.warning("Ignoring malformed results for job %s: %s", job_id, error)
            return []

    def _read_progress(self, job_id: str, directory: Path) -> list[ConsultantProgressEntry]:
        """Read valid progress objects from a job's JSON-lines sidecar."""
        progress_path = self._sidecar_path(job_id, directory, "progress")
        try:
            lines = progress_path.read_text(encoding="utf-8").splitlines()
        except FileNotFoundError:
            return []
        except (OSError, UnicodeError) as error:
            logger.warning(
                "Cannot read progress for Network Consultant job %s from %s: %s", job_id, progress_path, error
            )
            return []

        progress: list[ConsultantProgressEntry] = []
        for line in lines:
            try:
                entry = json.loads(line)
            except json.JSONDecodeError as error:
                logger.warning("Ignoring malformed progress JSON for job %s: %s", job_id, error)
                continue
            if not isinstance(entry, dict):
                logger.warning("Ignoring non-object progress entry for job %s", job_id)
                continue
            try:
                validated = ConsultantProgressEntry.model_validate(entry)
            except ValidationError as error:
                logger.warning("Ignoring malformed progress entry for job %s: %s", job_id, error)
                continue
            progress.append(validated)
        return progress
