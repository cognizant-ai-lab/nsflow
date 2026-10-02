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

"""Status response model for a Network Consultant job."""

from pydantic import BaseModel
from pydantic import Field

from nsflow.backend.models.network_consultant.fixture_result import FixtureResult


class JobStatusResponse(BaseModel):
    """Polled by the frontend to show live progress."""

    job_id: str
    running: bool
    returncode: int | None = None
    log_tail: list[str] = Field(default_factory=list)
    pending_question: str | None = Field(
        default=None,
        description="A NEEDS_CLARIFICATION question consultant is currently blocked on, if any -- "
        "submit it via POST /jobs/{job_id}/answer to let the job continue.",
    )
    tool_issues: list[str] = Field(
        default_factory=list,
        description="TOOL_ISSUE lines consultant reported before stopping the run -- a broken coded "
        "tool needs a human code fix; not something an answer can resolve.",
    )
    ungrounded: list[str] = Field(
        default_factory=list,
        description="UNGROUNDED lines: criteria asking for a fact no tool in the network can supply, "
        "because something it depends on returns no data. Not an agent defect and not a broken tool -- "
        "no instruction rewrite can satisfy one, so they need a data source wired up or the criteria removed.",
    )
    progress_chart: str | None = Field(
        default=None,
        description="A data:image/png;base64 URI for the tests-passing chart, or None before the first test "
        "checkpoint completes.",
    )
    git_branch: str | None = Field(
        default=None,
        description="The consultant-versions/<network>/<run-id> branch --git-versions is committing this run's "
        "hocon snapshots to, if the request asked for it and versioning started successfully; None otherwise.",
    )
    results: list[FixtureResult] = Field(
        default_factory=list,
        description="Per-fixture pass/fail for this job. A fixture the latest round did not re-run keeps the "
        "verdict from the last round that did, so this always describes the whole suite.",
    )
