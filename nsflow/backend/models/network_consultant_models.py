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

from typing import Any
from typing import Dict
from typing import List
from typing import Literal
from typing import Optional

from pydantic import BaseModel
from pydantic import Field


class GenerateTestsRequest(BaseModel):
    """Request to generate ANTeGen test fixtures for a network, with no fix loop."""

    network_name: str = Field(..., description="Network name relative to registries/, e.g. 'basic/coffee_finder'.")
    test_level: Literal["minimum", "normal", "max"] = "normal"
    test_guidance: str = Field(
        default="",
        description="Free text steering what the generator writes tests ABOUT, e.g. 'the vendor onboarding "
        "path'. Distinct from ImproveNetworkRequest.direction, which states the network's intended behavior "
        "for the consultant and is never read by the generator.",
    )
    session_id: str = Field(
        default="global", description="Chat session ID -- job logs are mirrored to this session's LogsPanel channel."
    )


class RunTestsRequest(BaseModel):
    """Request to run a network's existing test fixtures once, with no generation and no fix loop."""

    network_name: str = Field(..., description="Network name relative to registries/, e.g. 'basic/coffee_finder'.")
    fixture_name: Optional[str] = Field(
        default=None,
        description="Run only this fixture (a basename such as 'order_lookup.hocon'). Omit to run the whole "
        "suite. A single-fixture run reports through the per-fixture results only -- it is not a full-suite "
        "measurement, so it neither draws a chart bar nor seeds a later Self-Improve run's baseline.",
    )
    session_id: str = Field(
        default="global", description="Chat session ID -- job logs are mirrored to this session's LogsPanel channel."
    )


class ImproveNetworkRequest(BaseModel):
    """Request to run the iterative generate/test/diagnose/repair loop against a network."""

    network_name: str = Field(..., description="Network name relative to registries/, e.g. 'basic/coffee_finder'.")
    direction: str = Field(
        default="",
        description="What the user wants -- the intended behavior to fix/improve toward. Optional; if omitted, "
        "the run just fixes currently failing tests without changing existing behavior.",
    )
    test_level: Literal["minimum", "normal", "max"] = "normal"
    max_iterations: int = Field(default=10, ge=1, le=100)
    success_ratio: str = Field(default="3/3", pattern=r"^\d+/\d+$")
    git_versions: bool = Field(
        default=False,
        description="Commit the network hocon to a dedicated consultant-versions/<network>/<run-id> branch and "
        "push it to origin at each test checkpoint, preserving every version tried in git history. Off by "
        "default -- this pushes to the repo's 'origin' remote repeatedly during the run.",
    )
    session_id: str = Field(
        default="global", description="Chat session ID -- job logs are mirrored to this session's LogsPanel channel."
    )


class JobStartResponse(BaseModel):
    """Returned immediately after starting a background job."""

    job_id: str
    message: str


class FixtureResult(BaseModel):
    """One fixture's verdict from the most recent round that ran it."""

    fixture: str
    passed: bool
    message: Optional[str] = Field(
        default=None, description="Why it failed -- the assertion text, verbatim. None when it passed."
    )
    infrastructure_error: bool = Field(
        default=False,
        description="True when the run could not reach a verdict -- a timeout or an API-key fault, not a "
        "defect in the network. Worth showing differently: treating these as defects is what sends the "
        "consultant rewriting agents that were never at fault.",
    )


class JobStatusResponse(BaseModel):
    """Polled by the frontend to show live progress."""

    job_id: str
    running: bool
    returncode: Optional[int] = None
    log_tail: List[str] = Field(default_factory=list)
    pending_question: Optional[str] = Field(
        default=None,
        description="A NEEDS_CLARIFICATION question consultant is currently blocked on, if any -- "
        "submit it via POST /jobs/{job_id}/answer to let the job continue.",
    )
    tool_issues: List[str] = Field(
        default_factory=list,
        description="TOOL_ISSUE lines consultant reported before stopping the run -- a broken coded "
        "tool needs a human code fix; not something an answer can resolve.",
    )
    ungrounded: List[str] = Field(
        default_factory=list,
        description="UNGROUNDED lines: criteria asking for a fact no tool in the network can supply, "
        "because something it depends on returns no data. Not an agent defect and not a broken tool -- "
        "no instruction rewrite can satisfy one, so they need a data source wired up or the criteria "
        "removed.",
    )
    progress_chart: Optional[str] = Field(
        default=None,
        description="A data:image/png;base64 URI for the tests-passing chart, or None before the first test "
        "checkpoint completes.",
    )
    git_branch: Optional[str] = Field(
        default=None,
        description="The consultant-versions/<network>/<run-id> branch --git-versions is committing this run's "
        "hocon snapshots to, if the request asked for it and versioning started successfully; None otherwise.",
    )
    results: List[FixtureResult] = Field(
        default_factory=list,
        description="Per-fixture pass/fail for this job. A fixture the latest round did not re-run keeps the "
        "verdict from the last round that did, so this always describes the whole suite.",
    )


class JobStopResponse(BaseModel):
    """Returned after a stop request."""

    job_id: str
    stopped: bool
    message: str


class AnswerJobRequest(BaseModel):
    """Request to answer a job's currently pending NEEDS_CLARIFICATION question."""

    answer: str = Field(..., description="The human's answer to the job's current pending_question.")


class JobAnswerResponse(BaseModel):
    """Returned after successfully submitting an answer."""

    job_id: str
    message: str


class FixtureInteraction(BaseModel):
    """One turn of a (possibly multi-turn) fixture conversation."""

    text: str
    timeout_in_seconds: Optional[int] = None
    response_checks: Dict[str, Any] = Field(
        default_factory=dict,
        description="interactions[].response.text verbatim -- one entry per assertion neuro-san's "
        "AgentEvaluatorFactory supports (gist/not_gist, value/not_value, keywords/not_keywords, "
        "greater/not_greater, less/not_less), keyed by assertion type. Passed through as-is rather than "
        "assuming 'gist' is the only shape -- a fixture can use any of these.",
    )
    sly_data: dict = Field(default_factory=dict)


class Fixture(BaseModel):
    """One parsed tests/fixtures/<network>/<name>.hocon file."""

    name: str
    agent: Optional[str] = None
    success_ratio: Optional[str] = None
    connections: List[str] = Field(default_factory=list)
    interactions: List[FixtureInteraction] = Field(default_factory=list)
    raw_hocon: str
    parse_error: Optional[str] = Field(
        default=None, description="Set instead of the parsed fields above if this file failed to parse."
    )


class FixturesResponse(BaseModel):
    """Every ANTeGen fixture currently generated for a network."""

    network_name: str
    fixtures: List[Fixture] = Field(default_factory=list)


class FixtureSaveRequest(BaseModel):
    """A hand-edited fixture to write to disk, replacing (or creating) one file."""

    fixture: Dict[str, Any] = Field(
        ..., description="Full fixture object: agent, success_ratio, connections, interactions."
    )


class FixtureSaveResponse(BaseModel):
    """Returned after a fixture is written to disk."""

    message: str


class FixtureDeleteResponse(BaseModel):
    """Returned after a fixture is removed from disk."""

    message: str


class SlyDataKeysResponse(BaseModel):
    """Best-effort sly_data override keys discovered from a network's own coded tools."""

    network_name: str
    keys: List[str] = Field(default_factory=list)
