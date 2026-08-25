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

from typing import List
from typing import Literal
from typing import Optional

from pydantic import BaseModel
from pydantic import Field


class GenerateTestsRequest(BaseModel):
    """Request to generate ANTeGen test fixtures for a network, with no fix loop."""

    network_name: str = Field(..., description="Network name relative to registries/, e.g. 'basic/coffee_finder'.")
    test_level: Literal["minimum", "normal", "max"] = "normal"
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
    session_id: str = Field(
        default="global", description="Chat session ID -- job logs are mirrored to this session's LogsPanel channel."
    )


class JobStartResponse(BaseModel):
    """Returned immediately after starting a background job."""

    job_id: str
    message: str


class JobStatusResponse(BaseModel):
    """Polled by the frontend to show live progress."""

    job_id: str
    running: bool
    returncode: Optional[int] = None
    log_tail: List[str] = Field(default_factory=list)
    pending_question: Optional[str] = Field(
        default=None,
        description="A NEEDS_CLARIFICATION question consultant_editor is currently blocked on, if any -- "
        "submit it via POST /jobs/{job_id}/answer to let the job continue.",
    )
    tool_issues: List[str] = Field(
        default_factory=list,
        description="TOOL_ISSUE lines consultant_editor reported before stopping the run -- a broken coded "
        "tool needs a human code fix; not something an answer can resolve.",
    )
    progress_chart: Optional[str] = Field(
        default=None,
        description="'data:image/png;base64,...' bar chart of tests passing per iteration so far, rendered "
        "server-side with matplotlib; None until at least one iteration has completed.",
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
