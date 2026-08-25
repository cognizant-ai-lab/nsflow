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
import base64
import json
import logging
import os
import sys
import uuid
from io import BytesIO
from typing import Dict
from typing import Optional

import matplotlib

matplotlib.use("Agg")  # headless -- this process has no display
from matplotlib import pyplot as plt  # noqa: E402  (must follow matplotlib.use)
from matplotlib.ticker import MaxNLocator  # noqa: E402  (must follow matplotlib.use)

from fastapi import APIRouter
from fastapi import HTTPException

from nsflow.backend.models.network_consultant_models import AnswerJobRequest
from nsflow.backend.models.network_consultant_models import GenerateTestsRequest
from nsflow.backend.models.network_consultant_models import ImproveNetworkRequest
from nsflow.backend.models.network_consultant_models import JobAnswerResponse
from nsflow.backend.models.network_consultant_models import JobStartResponse
from nsflow.backend.models.network_consultant_models import JobStatusResponse
from nsflow.backend.models.network_consultant_models import JobStopResponse
from nsflow.backend.utils.logutils.websocket_logs_registry import LogsRegistry

# Used when the UI's optional "direction" field is left blank -- runner.py requires
# --direction with --hocon-file so defects are never guessed from current behavior, so an
# empty UI field still needs to send *something* that doesn't imply a behavior change.
DEFAULT_DIRECTION = "Fix any currently failing tests without changing the network's intended behavior."

# How long to wait for a graceful SIGTERM exit before escalating to SIGKILL.
STOP_GRACE_PERIOD_SECONDS = 5

# How often the tailer re-reads a job's log file to mirror new lines into nsflow's shared,
# always-visible LogsPanel -- independent of the frontend's own job-status polling cadence.
TAIL_POLL_INTERVAL_SECONDS = 1.0

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

    def __init__(self, process: asyncio.subprocess.Process, log_path: str, agent_name: str, session_id: str):
        self.process = process
        self.log_path = log_path
        self.agent_name = agent_name
        # asyncio only updates Process.returncode once something awaits wait() -- keep our own
        # background waiter running so a status poll can read this without racing that.
        self.returncode: Optional[int] = None
        asyncio.create_task(self._wait())
        asyncio.create_task(self._tail_to_logs_panel(agent_name, session_id))

    async def _wait(self) -> None:
        self.returncode = await self.process.wait()

    async def _tail_to_logs_panel(self, agent_name: str, session_id: str) -> None:
        """Mirror new lines appended to this job's log file into nsflow's shared LogsPanel --
        the same WebsocketLogsManager channel chat/internal-chat logs already use -- instead of
        only being readable through this job's own status-poll response."""
        manager = LogsRegistry.register(agent_name, session_id)
        position = 0
        while True:
            new_lines: list = []
            try:
                with open(self.log_path, "r", encoding="utf-8", errors="replace") as log_file:
                    log_file.seek(position)
                    new_lines = log_file.readlines()
                    position = log_file.tell()
            except FileNotFoundError:
                pass
            for line in new_lines:
                line = line.rstrip("\n")
                if line:
                    await manager.log_event(line, source="NetworkConsultant")
            if self.returncode is not None:
                break
            await asyncio.sleep(TAIL_POLL_INTERVAL_SECONDS)


_JOBS: Dict[str, _Job] = {}


def _network_hocon_file(network_name: str) -> str:
    """'basic/coffee_finder' or 'basic/coffee_finder.hocon' -> 'basic/coffee_finder.hocon'."""
    return network_name if network_name.endswith(".hocon") else f"{network_name}.hocon"


# Mirrors the frontend's MUI theme (ThemeContext.tsx) so this server-rendered chart doesn't
# clash with either mode -- a plain white matplotlib default looks broken embedded in dark mode.
# red/yellow/green are a pass-rate traffic light: <20% passing, 20-80%, >=80% (see _bar_color).
_CHART_PALETTE = {
    "light": {"fg": "#475569", "grid": "#e2e8f0", "red": "#dc2626", "yellow": "#d97706", "green": "#16a34a"},
    "dark": {"fg": "#cbd5e1", "grid": "#334155", "red": "#f87171", "yellow": "#fbbf24", "green": "#4ade80"},
}


def _bar_color(passed: int, total: int, colors: dict) -> str:
    """Red below 20% of tests passing, green at 80%+ passing, yellow in between."""
    pct = passed / total if total else 0.0
    if pct >= 0.8:
        return colors["green"]
    if pct < 0.2:
        return colors["red"]
    return colors["yellow"]


# Every iteration's chart is saved here (keyed by network + job + iteration) so past runs stay
# browsable even after network_consultant_jobs/ gets cleared out for the next job.
CHARTS_DIR_NAME = "network_consultant_charts"


def _chart_png_bytes(progress: list, theme: str = "light") -> bytes:
    """Bar chart of tests passing per iteration, rendered as raw PNG bytes."""
    colors = _CHART_PALETTE.get(theme, _CHART_PALETTE["light"])
    iterations = [entry["iteration"] for entry in progress]
    passed = [entry["passed"] for entry in progress]
    total = progress[-1]["total"]

    fig, ax = plt.subplots(figsize=(max(4.5, len(iterations) * 0.7), 3.2), dpi=130)
    fig.patch.set_alpha(0)
    ax.set_facecolor("none")

    bar_colors = [_bar_color(p, total, colors) for p in passed]
    bars = ax.bar(iterations, passed, color=bar_colors, width=0.5, zorder=3)
    pct_labels = [f"{p}/{total} ({round(100 * p / total) if total else 0}%)" for p in passed]
    ax.bar_label(bars, labels=pct_labels, padding=3, color=colors["fg"], fontsize=9)

    fig.suptitle("Tests Passing Per Iteration", color=colors["fg"], fontsize=12, fontweight="bold")
    # Fixed x-margin around the bars (rather than matplotlib's auto range) so a single
    # iteration doesn't get stretched into a full-width bar with no visible whitespace.
    ax.set_xlim(min(iterations) - 0.6, max(iterations) + 0.6)
    ax.set_ylim(0, total * 1.2 if total else 1)
    ax.set_xticks(iterations)
    ax.yaxis.set_major_locator(MaxNLocator(integer=True, nbins=min(total, 8) or 1))
    ax.set_xlabel("Iteration", color=colors["fg"], fontsize=10)
    ax.set_ylabel(f"Tests Passed (of {total})", color=colors["fg"], fontsize=10)
    ax.tick_params(colors=colors["fg"], labelsize=9, length=0)
    ax.grid(axis="y", color=colors["grid"], linewidth=0.8, zorder=0)
    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)
    ax.spines["left"].set_color(colors["grid"])
    ax.spines["bottom"].set_color(colors["grid"])
    fig.tight_layout(rect=(0, 0, 1, 0.92))

    buffer = BytesIO()
    fig.savefig(buffer, format="png", transparent=True)
    plt.close(fig)
    return buffer.getvalue()


def _save_chart_snapshot(agent_name: str, job_id: str, progress: list, png_bytes: bytes) -> None:
    """Persist this iteration's chart under logs/network_consultant_charts/ -- a no-op if
    already saved (only the theme of the first poll to reach this iteration is kept)."""
    charts_dir = os.path.join(CONSULTANT_REPO_PATH, "logs", CHARTS_DIR_NAME)
    os.makedirs(charts_dir, exist_ok=True)
    latest_iteration = progress[-1]["iteration"]
    safe_name = agent_name.replace("/", "_")
    path = os.path.join(charts_dir, f"{safe_name}_{job_id}_iter{latest_iteration:03d}.png")
    if not os.path.exists(path):
        with open(path, "wb") as png_file:
            png_file.write(png_bytes)


def _clear_finished_job_files(log_dir: str) -> None:
    """Delete leftover files (log, question, answer, tool_issues) from previous jobs that have
    already finished, so this directory doesn't just accumulate forever across runs. Leaves
    alone any job still tracked as running -- its files may be actively read/written."""
    for name in os.listdir(log_dir):
        existing_job_id = name.split(".", 1)[0]
        job = _JOBS.get(existing_job_id)
        if job is not None and job.returncode is None:
            continue
        try:
            os.remove(os.path.join(log_dir, name))
        except OSError as exc:
            logger.warning("Could not remove leftover job file %s: %s", name, exc)


async def _start_job(args: list, agent_name: str, session_id: str) -> JobStartResponse:
    """Launch `python -m apps.network_consultant.runner <args>` as a background process,
    redirecting its combined output to a per-job log file under CONSULTANT_REPO_PATH/logs/."""
    job_id = uuid.uuid4().hex
    log_dir = os.path.join(CONSULTANT_REPO_PATH, "logs", "network_consultant_jobs")
    os.makedirs(log_dir, exist_ok=True)
    _clear_finished_job_files(log_dir)
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
                # This subprocess has no interactive stdin, so runner.py can't use input() to ask
                # a NEEDS_CLARIFICATION question -- these two vars tell it to exchange the
                # question/answer via files in log_dir instead (see get_job_status/answer_job).
                env={**os.environ, "NSFLOW_JOB_ID": job_id, "NSFLOW_JOB_DIR": log_dir},
            )
        except OSError as exc:
            logger.error("Failed to start network_consultant job: %s", exc)
            raise HTTPException(status_code=500, detail=f"Failed to start job: {exc}") from exc

    _JOBS[job_id] = _Job(process, log_path, agent_name, session_id)
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
        ],
        agent_name=request.network_name,
        session_id=request.session_id,
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
            request.direction.strip() or DEFAULT_DIRECTION,
            "--test-level",
            request.test_level,
            "--max-iterations",
            str(request.max_iterations),
            "--success-ratio",
            request.success_ratio,
        ],
        agent_name=request.network_name,
        session_id=request.session_id,
    )


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str, theme: str = "light"):
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

    job_dir = os.path.dirname(job.log_path)

    pending_question: Optional[str] = None
    question_path = os.path.join(job_dir, f"{job_id}.question.txt")
    try:
        with open(question_path, "r", encoding="utf-8") as question_file:
            pending_question = question_file.read()
    except FileNotFoundError:
        pass

    tool_issues: list = []
    issues_path = os.path.join(job_dir, f"{job_id}.tool_issues.txt")
    try:
        with open(issues_path, "r", encoding="utf-8") as issues_file:
            tool_issues = [line for line in issues_file.read().splitlines() if line]
    except FileNotFoundError:
        pass

    progress: list = []
    progress_path = os.path.join(job_dir, f"{job_id}.progress.jsonl")
    try:
        with open(progress_path, "r", encoding="utf-8") as progress_file:
            for line in progress_file:
                line = line.strip()
                if not line:
                    continue
                try:
                    progress.append(json.loads(line))
                except json.JSONDecodeError:
                    # A torn read of the last line while runner.py is mid-append -- it'll be
                    # complete on the next poll, so just skip it here rather than error out.
                    continue
    except FileNotFoundError:
        pass

    progress_chart: Optional[str] = None
    if progress:
        png_bytes = _chart_png_bytes(progress, theme)
        _save_chart_snapshot(job.agent_name, job_id, progress, png_bytes)
        progress_chart = f"data:image/png;base64,{base64.b64encode(png_bytes).decode('ascii')}"

    return JobStatusResponse(
        job_id=job_id,
        running=running,
        returncode=returncode,
        log_tail=[line.rstrip("\n") for line in log_tail],
        pending_question=pending_question,
        tool_issues=tool_issues,
        progress_chart=progress_chart,
    )


@router.post("/jobs/{job_id}/answer", response_model=JobAnswerResponse)
async def answer_job(job_id: str, request: AnswerJobRequest):
    """Answer a NEEDS_CLARIFICATION question the job's consultant_editor is currently blocked
    on (see runner.py's _ask_headless) -- a no-op error if it isn't actually waiting on one."""
    job = _JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
    if job.returncode is not None:
        raise HTTPException(status_code=400, detail="Job has already finished.")

    job_dir = os.path.dirname(job.log_path)
    question_path = os.path.join(job_dir, f"{job_id}.question.txt")
    if not os.path.isfile(question_path):
        raise HTTPException(status_code=400, detail="This job isn't waiting on a clarification question.")

    answer_path = os.path.join(job_dir, f"{job_id}.answer.txt")
    with open(answer_path, "w", encoding="utf-8") as answer_file:
        answer_file.write(request.answer)

    return JobAnswerResponse(job_id=job_id, message="Answer submitted.")


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
