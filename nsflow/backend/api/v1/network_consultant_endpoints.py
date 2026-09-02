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
import glob
import json
import logging
import os
import re
import sys
import tempfile
import uuid
from io import BytesIO
from typing import Dict
from typing import Optional

import matplotlib

matplotlib.use("Agg")
from fastapi import APIRouter
from fastapi import HTTPException
from matplotlib import pyplot as plt  # noqa: E402  (must follow matplotlib.use)
from matplotlib.ticker import MaxNLocator  # noqa: E402  (must follow matplotlib.use)
from pyhocon import ConfigFactory

from nsflow.backend.models.network_consultant_models import AnswerJobRequest
from nsflow.backend.models.network_consultant_models import Fixture
from nsflow.backend.models.network_consultant_models import FixtureDeleteResponse
from nsflow.backend.models.network_consultant_models import FixtureInteraction
from nsflow.backend.models.network_consultant_models import FixtureSaveRequest
from nsflow.backend.models.network_consultant_models import FixtureSaveResponse
from nsflow.backend.models.network_consultant_models import FixturesResponse
from nsflow.backend.models.network_consultant_models import GenerateTestsRequest
from nsflow.backend.models.network_consultant_models import ImproveNetworkRequest
from nsflow.backend.models.network_consultant_models import JobAnswerResponse
from nsflow.backend.models.network_consultant_models import JobStartResponse
from nsflow.backend.models.network_consultant_models import JobStatusResponse
from nsflow.backend.models.network_consultant_models import JobStopResponse
from nsflow.backend.models.network_consultant_models import SlyDataKeysResponse
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


def _fixtures_dir(network_name: str) -> str:
    """tests/fixtures/<network_name>/ under CONSULTANT_REPO_PATH -- resolved and containment-
    checked before any glob/open, since (unlike generate-tests/improve, which only ever pass
    network_name as a CLI arg to a subprocess that validates it itself) this endpoint reads
    files directly in this process, making network_name a new trust boundary."""
    allowed_root = os.path.realpath(os.path.join(CONSULTANT_REPO_PATH, "tests", "fixtures"))
    resolved = os.path.realpath(os.path.join(allowed_root, network_name))
    if resolved != allowed_root and not resolved.startswith(allowed_root + os.sep):
        raise HTTPException(status_code=400, detail="Invalid network_name.")
    return resolved


@router.get("/fixtures", response_model=FixturesResponse)
async def list_fixtures(network_name: str):
    """Parse every ANTeGen fixture already generated for a network, straight from
    tests/fixtures/<network_name>/*.hocon -- the same files run_all_tests reads. Read-only:
    never writes, edits, or re-runs anything. No fixtures yet is not an error -- just an empty
    list."""
    fixtures_dir = _fixtures_dir(network_name)
    fixtures = []
    for path in sorted(glob.glob(os.path.join(fixtures_dir, "*.hocon"))):
        with open(path, "r", encoding="utf-8") as fixture_file:
            raw = fixture_file.read()
        try:
            parsed = ConfigFactory.parse_file(path).as_plain_ordered_dict()
            interactions = [
                FixtureInteraction(
                    text=turn.get("text", ""),
                    timeout_in_seconds=turn.get("timeout_in_seconds"),
                    response_checks=(turn.get("response") or {}).get("text") or {},
                    sly_data=turn.get("sly_data") or {},
                )
                for turn in parsed.get("interactions", [])
            ]
            fixtures.append(
                Fixture(
                    name=os.path.basename(path),
                    agent=parsed.get("agent"),
                    success_ratio=parsed.get("success_ratio"),
                    connections=parsed.get("connections", []),
                    interactions=interactions,
                    raw_hocon=raw,
                )
            )
        except Exception as exc:  # pylint: disable=broad-exception-caught
            # A hand-edited or malformed fixture must never break the whole list -- flag it and
            # keep going; raw_hocon still lets the UI show its actual content.
            fixtures.append(Fixture(name=os.path.basename(path), raw_hocon=raw, parse_error=str(exc)))
    return FixturesResponse(network_name=network_name, fixtures=fixtures)


def _registry_hocon_path(network_name: str) -> str:
    """Resolved, containment-checked path to registries/<network_name>.hocon -- read directly
    in this process (same trust-boundary reasoning as _fixtures_dir above)."""
    allowed_root = os.path.realpath(os.path.join(CONSULTANT_REPO_PATH, "registries"))
    resolved = os.path.realpath(os.path.join(allowed_root, _network_hocon_file(network_name)))
    if resolved != allowed_root and not resolved.startswith(allowed_root + os.sep):
        raise HTTPException(status_code=400, detail="Invalid network_name.")
    return resolved


# Matches both hocon styles seen in this repo's network files: bare `class = "..."` and
# JSON-style `"class": "..."`. A raw-text scan rather than a real hocon parse -- network files
# routinely use ${...} substitutions (shared instruction blocks, etc.) that only resolve inside
# neuro-san's own loader, so pyhocon.ConfigFactory.parse_file() raises on them standalone. The
# "class" value itself is always a literal string, never a substitution, so this is safe.
_CLASS_REF_PATTERN = re.compile(r'(?:"class"\s*:|class\s*=)\s*"([^"]+)"')


def _resolve_class_file(class_ref: str, network_name: str) -> Optional[str]:
    """Best-effort mapping from a hocon "class" reference to its coded_tools/**.py file --
    mirrors neuro-san's own resolver closely enough for this repo's layout without importing its
    internals: try the string as a fully-dotted path under coded_tools/ first (the form used for
    a tool shared across networks), then as relative to this network's own coded_tools/<network>/
    directory (the common short form), then relative to coded_tools/ directly (a shared tool
    referenced by its short form). Every candidate is containment-checked against coded_tools/
    before being read."""
    parts = class_ref.replace("\\", "/").split(".")
    if len(parts) < 2 or any(part in {"", ".", ".."} for part in parts):
        return None
    module_parts = parts[:-1]
    coded_tools_root = os.path.realpath(os.path.join(CONSULTANT_REPO_PATH, "coded_tools"))

    candidates = []
    if class_ref.startswith("coded_tools."):
        candidates.append(os.path.join(CONSULTANT_REPO_PATH, *module_parts) + ".py")
    else:
        candidates.append(os.path.join(coded_tools_root, *network_name.split("/"), *module_parts) + ".py")
        candidates.append(os.path.join(coded_tools_root, *module_parts) + ".py")

    for candidate in candidates:
        resolved = os.path.realpath(candidate)
        if resolved.startswith(coded_tools_root + os.sep) and os.path.isfile(resolved):
            return resolved
    return None


_SLY_DATA_GET_PATTERN = re.compile(r"sly_data\.get\(\s*[\"']([^\"']+)[\"']")
_SLY_DATA_ITEM_PATTERN = re.compile(r"sly_data\[\s*[\"']([^\"']+)[\"']\s*\]")


def _sly_data_keys_from_file(path: str) -> set:
    """Every sly_data.get("...")/sly_data["..."] literal in one coded tool's source -- the keys
    a test's sly_data can override for that tool. Static text scan, not execution: a key built
    dynamically (string concatenation, a variable) won't be found."""
    try:
        with open(path, "r", encoding="utf-8") as source_file:
            text = source_file.read()
    except OSError:
        return set()
    return set(_SLY_DATA_GET_PATTERN.findall(text)) | set(_SLY_DATA_ITEM_PATTERN.findall(text))


@router.get("/sly_data_keys", response_model=SlyDataKeysResponse)
async def list_sly_data_keys(network_name: str):
    """Best-effort discovery of the sly_data override keys a network's own coded tools actually
    read, so the test-fixture editor can offer them as a dropdown instead of free-text. A
    network with no coded tools (a pure-LLM network) or one whose tools don't read sly_data at
    all simply returns an empty list -- not an error."""
    hocon_path = _registry_hocon_path(network_name)
    if not os.path.isfile(hocon_path):
        return SlyDataKeysResponse(network_name=network_name, keys=[])

    with open(hocon_path, "r", encoding="utf-8") as hocon_file:
        hocon_text = hocon_file.read()

    keys: set = set()
    for class_ref in _CLASS_REF_PATTERN.findall(hocon_text):
        resolved = _resolve_class_file(class_ref, network_name)
        if resolved:
            keys |= _sly_data_keys_from_file(resolved)
    return SlyDataKeysResponse(network_name=network_name, keys=sorted(keys))


# The complete set of stock tests neuro-san's AgentEvaluatorFactory recognizes under
# response.text -- mirrors coded_tools/agent_network_test_generator/validate_test_fixture.py's
# _VALID_STOCK_TESTS. Duplicated here (rather than imported) because this endpoint file already
# parses/writes the fixture format independently of that agent-facing CodedTool, same as
# list_fixtures above.
_STOCK_TEST_KEYS = frozenset(
    {
        "gist", "not_gist",
        "keywords", "not_keywords",
        "value", "not_value",
        "less", "not_less",
        "greater", "not_greater",
    }
)

_SUCCESS_RATIO_PATTERN = re.compile(r"^\d+/\d+$")

# Same header persist_test_fixture.py's CodedTool writes, so a hand-saved fixture and an
# LLM-generated one look identical on disk.
_FIXTURE_REFERENCE_COMMENT = (
    "# This file defines everything necessary for a data-driven test.\n"
    "# The schema specifications for this file are documented here:\n"
    "# https://github.com/cognizant-ai-lab/neuro-san/blob/main/docs/test_case_hocon_reference.md\n"
)


def _safe_fixture_file_name(fixture_name: str) -> str:
    """'foo' or 'foo.hocon' -> 'foo.hocon', with anything that isn't a word char/dot/hyphen
    (including path separators) replaced -- so this can never resolve outside fixtures_dir."""
    safe_name = fixture_name if fixture_name.endswith(".hocon") else f"{fixture_name}.hocon"
    return re.sub(r"[^\w.\-]", "_", safe_name)


def _validate_fixture_for_save(fixture: dict) -> list:
    """Structural check before overwriting a fixture on disk. The UI's check-type dropdown
    already constrains values to _STOCK_TEST_KEYS, so this only needs to catch what free-text
    fields (agent, success_ratio, interaction text) could still get wrong."""
    errors: list = []
    if not isinstance(fixture.get("agent"), str) or not fixture["agent"].strip():
        errors.append("'agent' must be a non-empty string.")
    ratio = fixture.get("success_ratio")
    if not isinstance(ratio, str) or not _SUCCESS_RATIO_PATTERN.match(ratio):
        errors.append("'success_ratio' must be a string in 'N/M' format, e.g. '1/1'.")
    interactions = fixture.get("interactions")
    if not isinstance(interactions, list) or not interactions:
        errors.append("'interactions' must be a non-empty list.")
        return errors
    for idx, interaction in enumerate(interactions):
        prefix = f"interactions[{idx}]"
        if not isinstance(interaction, dict) or not str(interaction.get("text", "")).strip():
            errors.append(f"{prefix}: 'text' is required.")
            continue
        checks = ((interaction.get("response") or {}).get("text")) or {}
        if not isinstance(checks, dict) or not checks:
            errors.append(f"{prefix}: at least one response check is required.")
        for key in checks:
            if key not in _STOCK_TEST_KEYS:
                errors.append(f"{prefix}: '{key}' is not a valid check type.")
    return errors


@router.put("/fixtures", response_model=FixtureSaveResponse)
async def save_fixture(
    network_name: str,
    fixture_name: str,
    request: FixtureSaveRequest,
    original_fixture_name: Optional[str] = None,
):
    """Overwrite (or create) tests/fixtures/<network_name>/<fixture_name>.hocon with a
    hand-edited fixture from the UI. fixture_name is sanitized/suffixed the same way
    persist_test_fixture.py's CodedTool does, so a manually-saved fixture and an
    LLM-generated one land under the exact same rules.

    original_fixture_name, if given and different from the resolved fixture_name, is treated as
    a rename: the old file is removed once the new one is written -- e.g. "New test" (no
    original) creates a fresh file, while editing an existing fixture always passes its current
    on-disk name here so a rename doesn't leave the old file behind."""
    fixtures_dir = _fixtures_dir(network_name)
    errors = _validate_fixture_for_save(request.fixture)
    if errors:
        raise HTTPException(status_code=422, detail={"errors": errors})

    safe_name = _safe_fixture_file_name(fixture_name)
    os.makedirs(fixtures_dir, exist_ok=True)
    output_path = os.path.join(fixtures_dir, safe_name)

    content = _FIXTURE_REFERENCE_COMMENT + "\n" + json.dumps(request.fixture, indent=4, ensure_ascii=False) + "\n"
    descriptor, tmp_path = tempfile.mkstemp(dir=fixtures_dir)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as tmp_file:
            tmp_file.write(content)
        os.replace(tmp_path, output_path)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Could not write fixture: {exc}") from exc

    if original_fixture_name:
        old_safe_name = _safe_fixture_file_name(original_fixture_name)
        if old_safe_name != safe_name:
            old_path = os.path.join(fixtures_dir, old_safe_name)
            if os.path.isfile(old_path):
                os.remove(old_path)

    return FixtureSaveResponse(message=f"Saved {safe_name}.")


@router.delete("/fixtures", response_model=FixtureDeleteResponse)
async def delete_fixture(network_name: str, fixture_name: str):
    """Permanently remove tests/fixtures/<network_name>/<fixture_name>.hocon."""
    fixtures_dir = _fixtures_dir(network_name)
    safe_name = _safe_fixture_file_name(fixture_name)
    path = os.path.join(fixtures_dir, safe_name)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail=f"Fixture '{safe_name}' not found.")
    os.remove(path)
    return FixtureDeleteResponse(message=f"Deleted {safe_name}.")


# Validated against the data-viz palette rather than picked by eye, on the surfaces this chart
# actually renders on (the Network Consultant panel: info.main at 4% over MUI's paper).
#
# `blues` is an ORDINAL ramp -- one hue, monotone lightness, dark at the bottom of a stack and
# lightening upward, so a segment's shade says when that cohort started passing and the newest
# progress is always the pale cap. Both directions pass the ordinal gates (monotone L, adjacent
# dL >= 0.06, light end >= 2:1 vs surface); the dark ramp starts at step 500 rather than 600
# because MUI's slate paper is lighter than the palette's own dark surface and 600 fell to 1.8:1.
# Step 450 (#2a78d6) is the agent-node blue to the eye, and sits mid-ramp.
#
# `red`/`green` are the palette's fixed status steps -- critical and good -- deliberately NOT
# themed. They flag the authoritative full-suite bars against the 80% threshold. Red-vs-green is
# the one pair colour-vision deficiency collapses (deutan dE 4.1), so it is never the only
# channel here: every bar carries its own "n/m (x%)" label and the bookends are named on the
# x-axis, which is the icon+label pairing the palette requires of a status colour.
_CHART_PALETTE = {
    "light": {
        "fg": "#0b0b0b",
        "grid": "#e1e0d9",
        "axis": "#c3c2b7",
        "surface": "#f5fafd",
        "red": "#d03b3b",
        "green": "#0ca30c",
        "blues": ["#104281", "#1c5cab", "#2a78d6", "#5598e7", "#86b6ef"],
    },
    "dark": {
        "fg": "#ffffff",
        "grid": "#2c2c2a",
        "axis": "#383835",
        "surface": "#1e2f42",
        "red": "#d03b3b",
        "green": "#0ca30c",
        "blues": ["#256abf", "#3987e5", "#6da7ec", "#9ec5f4", "#cde2fb"],
    },
}
CHARTS_DIR_NAME = "network_consultant_charts"


def _threshold_color(passed: int, total: int, colors: dict) -> str:
    """Green at 80% or higher, red below 80%; an empty result is red."""
    return colors["green"] if total > 0 and passed / total >= 0.8 else colors["red"]


def _chart_x_labels(progress: list) -> list[str]:
    """Use the reference's compact 1, 2, ... ticks, with named full-suite bookends."""
    labels = []
    for entry in progress:
        checkpoint = entry.get("checkpoint", "iteration")
        if checkpoint == "before":
            labels.append("Before")
        elif checkpoint == "after":
            labels.append("After")
        elif checkpoint == "generated":
            # Generate Tests names its single bar for what it is. Not "Before" -- that name is the
            # Self-Improve run's, and this run creates the very fixtures it measures.
            labels.append("Test run")
        else:
            labels.append(str(entry.get("improvement_iteration") or entry.get("check") or len(labels) + 1))
    return labels


def _normalized_segments(entry: dict) -> list[int]:
    """Return stack segments that exactly sum to `passed`, tolerating older progress rows."""
    passed = max(int(entry.get("passed", 0)), 0)
    if entry.get("checkpoint") != "iteration":
        return [passed]
    raw_segments = entry.get("segments")
    if not isinstance(raw_segments, list):
        return [passed]

    remaining = passed
    segments = []
    for value in raw_segments:
        segment = min(max(int(value), 0), remaining)
        segments.append(segment)
        remaining -= segment
    if remaining:
        segments.append(remaining)
    return segments or [0]


def _chart_png_bytes(progress: list, theme: str = "light") -> bytes:
    """Render the requested tests-passing chart as a transparent PNG."""
    colors = _CHART_PALETTE.get(theme, _CHART_PALETTE["light"])
    x_positions = list(range(1, len(progress) + 1))
    passed = [max(int(entry.get("passed", 0)), 0) for entry in progress]
    totals = [max(int(entry.get("total", 0)), 0) for entry in progress]
    max_total = max(totals, default=1) or 1
    row_segments = [_normalized_segments(entry) for entry in progress]
    max_levels = max((len(segments) for segments in row_segments), default=1)

    fig, ax = plt.subplots(figsize=(max(4.5, len(progress) * 0.85), 3.2), dpi=130)
    fig.patch.set_alpha(0)
    ax.set_facecolor("none")

    for level in range(max_levels):
        heights = [segments[level] if level < len(segments) else 0 for segments in row_segments]
        bottoms = [sum(segments[:level]) for segments in row_segments]
        bar_colors = []
        for entry, passed_count, total_count in zip(progress, passed, totals):
            checkpoint = entry.get("checkpoint", "iteration")
            if checkpoint in {"generated", "before", "after"}:
                bar_colors.append(_threshold_color(passed_count, total_count, colors))
            else:
                blue_ramp = colors["blues"]
                bar_colors.append(blue_ramp[min(level, len(blue_ramp) - 1)])
        ax.bar(
            x_positions,
            heights,
            bottom=bottoms,
            color=bar_colors,
            width=0.55,
            edgecolor=colors["surface"],
            linewidth=1.2,
            zorder=3,
        )

    for x_position, passed_count, total_count in zip(x_positions, passed, totals):
        percentage = round(100 * passed_count / total_count) if total_count else 0
        ax.text(
            x_position,
            passed_count + max_total * 0.03,
            f"{passed_count}/{total_count} ({percentage}%)",
            ha="center",
            va="bottom",
            color=colors["fg"],
            fontsize=9,
        )

    # Generate Tests charts a single full-suite bar with no fix loop behind it, so naming
    # iterations there (in the title or on the x-axis) describes something that didn't happen.
    has_iterations = any(entry.get("checkpoint", "iteration") == "iteration" for entry in progress)
    fig.suptitle(
        "Tests Passing Per Iteration" if has_iterations else "Tests Passing",
        color=colors["fg"],
        fontsize=12,
        fontweight="bold",
    )
    ax.set_xlim(0.4, len(progress) + 0.6)
    ax.set_ylim(0, max_total * 1.2)
    ax.set_xticks(x_positions)
    ax.set_xticklabels(
        _chart_x_labels(progress),
        rotation=30 if len(progress) > 6 else 0,
        ha="right" if len(progress) > 6 else "center",
    )
    ax.yaxis.set_major_locator(MaxNLocator(integer=True, nbins=min(max_total, 8) or 1))
    ax.set_xlabel("Improvement Iterations" if has_iterations else "", color=colors["fg"], fontsize=10)
    ax.set_ylabel("Tests Passed", color=colors["fg"], fontsize=10)
    ax.tick_params(colors=colors["fg"], labelsize=9, length=0)
    ax.grid(axis="y", color=colors["grid"], linewidth=0.8, zorder=0)
    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)
    ax.spines["left"].set_color(colors["axis"])
    ax.spines["bottom"].set_color(colors["axis"])
    fig.tight_layout(rect=(0, 0, 1, 0.92))

    buffer = BytesIO()
    fig.savefig(buffer, format="png", transparent=True)
    plt.close(fig)
    return buffer.getvalue()


def _save_chart_snapshot(agent_name: str, job_id: str, progress: list, png_bytes: bytes) -> None:
    """Keep the latest complete graph from each checkpoint under logs/ for later review."""
    charts_dir = os.path.join(CONSULTANT_REPO_PATH, "logs", CHARTS_DIR_NAME)
    os.makedirs(charts_dir, exist_ok=True)
    safe_name = agent_name.replace("/", "_")
    check_number = int(progress[-1].get("check", len(progress)))
    path = os.path.join(charts_dir, f"{safe_name}_{job_id}_check{check_number:03d}.png")
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
    the runner do its normal generate-tests-if-missing step, then stop: the fix loop itself
    never executes."""
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
            *(["--git-versions"] if request.git_versions else []),
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

    git_branch: Optional[str] = None
    branch_path = os.path.join(job_dir, f"{job_id}.git_branch.txt")
    try:
        with open(branch_path, "r", encoding="utf-8") as branch_file:
            git_branch = branch_file.read().strip() or None
    except FileNotFoundError:
        pass

    progress: list = []
    progress_path = os.path.join(job_dir, f"{job_id}.progress.jsonl")
    try:
        with open(progress_path, "r", encoding="utf-8") as progress_file:
            for line in progress_file:
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    # The subprocess may be between writes during a poll; the next poll will
                    # receive the complete line.
                    continue
                if isinstance(entry, dict):
                    progress.append(entry)
    except FileNotFoundError:
        pass

    progress_chart: Optional[str] = None
    if progress:
        png_bytes = await asyncio.to_thread(_chart_png_bytes, progress, theme)
        await asyncio.to_thread(_save_chart_snapshot, job.agent_name, job_id, progress, png_bytes)
        progress_chart = f"data:image/png;base64,{base64.b64encode(png_bytes).decode('ascii')}"

    return JobStatusResponse(
        job_id=job_id,
        running=running,
        returncode=returncode,
        log_tail=[line.rstrip("\n") for line in log_tail],
        pending_question=pending_question,
        tool_issues=tool_issues,
        progress_chart=progress_chart,
        git_branch=git_branch,
    )


@router.post("/jobs/{job_id}/answer", response_model=JobAnswerResponse)
async def answer_job(job_id: str, request: AnswerJobRequest):
    """Answer a NEEDS_CLARIFICATION question the job's consultant is currently blocked
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
        logger.warning(
            "Job %s did not exit within %ss of SIGTERM; sending SIGKILL.", job_id, STOP_GRACE_PERIOD_SECONDS
        )
        job.process.kill()
        await job.process.wait()

    logger.info("Stopped network_consultant job %s (returncode=%s).", job_id, job.returncode)
    return JobStopResponse(job_id=job_id, stopped=True, message="Job stopped.")
