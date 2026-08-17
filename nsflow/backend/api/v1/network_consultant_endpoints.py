# Copyright © 2025 Cognizant Technology Solutions Corp, www.cognizant.com.
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
"""
Runs apps.network_consultant.runner (from the neuro-san-studio-style project nsflow is pointed
at -- the same project whose registries/ AGENT_MANIFEST_FILE etc. this backend process was
started with) as a background job, so the frontend can trigger test generation or the full
generate/test/diagnose/repair loop and poll its progress without blocking a request.

Only ever shells out to that one script -- this endpoint doesn't reimplement any of its
iteration/plateau/ratio logic, so the two stay in sync automatically.
"""

import asyncio
import logging
import os
import sys
import uuid
from typing import Dict
from typing import Optional

from fastapi import APIRouter
from fastapi import HTTPException

from nsflow.backend.models.network_consultant_models import GenerateTestsRequest
from nsflow.backend.models.network_consultant_models import ImproveNetworkRequest
from nsflow.backend.models.network_consultant_models import JobStartResponse
from nsflow.backend.models.network_consultant_models import JobStatusResponse
from nsflow.backend.models.network_consultant_models import JobStopResponse

# How long to wait for a graceful SIGTERM exit before escalating to SIGKILL.
STOP_GRACE_PERIOD_SECONDS = 5

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/network_consultant")

# The project directory apps.network_consultant.runner lives in -- defaults to this backend
# process's cwd, since that's already required to be the target project root for
# AGENT_MANIFEST_FILE's relative path to resolve (see that project's own runner.py).
CONSULTANT_REPO_PATH = os.getenv("NSFLOW_NETWORK_CONSULTANT_REPO", os.getcwd())

# Log tail length returned per status poll -- enough context without an unbounded response.
LOG_TAIL_LINES = 200


class _Job:
    """One running or finished apps.network_consultant.runner invocation."""

    def __init__(self, process: asyncio.subprocess.Process, log_path: str):
        self.process = process
        self.log_path = log_path
        # asyncio only updates Process.returncode once something awaits wait() -- keep our own
        # background waiter running so a status poll can read this without racing that.
        self.returncode: Optional[int] = None
        asyncio.create_task(self._wait())

    async def _wait(self) -> None:
        self.returncode = await self.process.wait()


_JOBS: Dict[str, _Job] = {}


def _network_hocon_file(network_name: str) -> str:
    """'basic/coffee_finder' or 'basic/coffee_finder.hocon' -> 'basic/coffee_finder.hocon'."""
    return network_name if network_name.endswith(".hocon") else f"{network_name}.hocon"


async def _start_job(args: list) -> JobStartResponse:
    """Launch `python -m apps.network_consultant.runner <args>` as a background process,
    redirecting its combined output to a per-job log file under CONSULTANT_REPO_PATH/logs/."""
    job_id = uuid.uuid4().hex
    log_dir = os.path.join(CONSULTANT_REPO_PATH, "logs", "network_consultant_jobs")
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, f"{job_id}.log")

    with open(log_path, "wb") as log_file:
        try:
            process = await asyncio.create_subprocess_exec(
                sys.executable,
                "-u",  # unbuffered stdout/stderr -- without this, Python fully buffers output
                # when it's redirected to a file instead of a TTY, so the log file would stay
                # empty for a long time (or until exit) even while the job is actively running.
                "-m",
                "apps.network_consultant.runner",
                *args,
                cwd=CONSULTANT_REPO_PATH,
                stdout=log_file,
                stderr=asyncio.subprocess.STDOUT,
            )
        except OSError as exc:
            logger.error("Failed to start network_consultant job: %s", exc)
            raise HTTPException(status_code=500, detail=f"Failed to start job: {exc}") from exc

    _JOBS[job_id] = _Job(process, log_path)
    logger.info("Started network_consultant job %s (pid=%s): %s", job_id, process.pid, args)
    return JobStartResponse(job_id=job_id, message="Job started.")


@router.post("/generate-tests", response_model=JobStartResponse)
async def generate_tests(request: GenerateTestsRequest):
    """Generate ANTeGen test fixtures for a network, with no fix loop -- max_iterations=0 makes
    the runner do its normal generate-tests-if-missing step, one full test run for a baseline
    pass/fail read, then stop before ever calling consultant_editor."""
    hocon_file = _network_hocon_file(request.network_name)
    return await _start_job(
        [
            "--hocon-file",
            hocon_file,
            "--direction",
            "Generate tests only -- no fix loop requested.",
            "--test-level",
            request.test_level,
            "--max-iterations",
            "0",
        ]
    )


@router.post("/improve", response_model=JobStartResponse)
async def improve_network(request: ImproveNetworkRequest):
    """Run the full iterative generate/test/diagnose/repair loop toward `direction`."""
    hocon_file = _network_hocon_file(request.network_name)
    return await _start_job(
        [
            "--hocon-file",
            hocon_file,
            "--direction",
            request.direction,
            "--test-level",
            request.test_level,
            "--max-iterations",
            str(request.max_iterations),
            "--success-ratio",
            request.success_ratio,
        ]
    )


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """Poll a job's running state and the tail of its combined stdout/stderr log, live while
    it's still running."""
    job = _JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")

    returncode = job.returncode
    running = returncode is None

    log_tail: list = []
    try:
        with open(job.log_path, "r", encoding="utf-8", errors="replace") as log_file:
            log_tail = log_file.readlines()[-LOG_TAIL_LINES:]
    except FileNotFoundError:
        pass

    return JobStatusResponse(
        job_id=job_id,
        running=running,
        returncode=returncode,
        log_tail=[line.rstrip("\n") for line in log_tail],
    )


@router.post("/jobs/{job_id}/stop", response_model=JobStopResponse)
async def stop_job(job_id: str):
    """Stop a running job: SIGTERM first, escalating to SIGKILL if it hasn't exited within
    STOP_GRACE_PERIOD_SECONDS. A no-op (not an error) if the job already finished on its own."""
    job = _JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")

    if job.returncode is not None:
        return JobStopResponse(job_id=job_id, stopped=False, message="Job had already finished.")

    job.process.terminate()
    try:
        await asyncio.wait_for(job.process.wait(), timeout=STOP_GRACE_PERIOD_SECONDS)
    except asyncio.TimeoutError:
        logger.warning("Job %s did not exit within %ss of SIGTERM; sending SIGKILL.", job_id, STOP_GRACE_PERIOD_SECONDS)
        job.process.kill()
        await job.process.wait()

    logger.info("Stopped network_consultant job %s (returncode=%s).", job_id, job.returncode)
    return JobStopResponse(job_id=job_id, stopped=True, message="Job stopped.")
