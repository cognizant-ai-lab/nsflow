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


class ImproveNetworkRequest(BaseModel):
    """Request to run the iterative generate/test/diagnose/repair loop against a network."""

    network_name: str = Field(..., description="Network name relative to registries/, e.g. 'basic/coffee_finder'.")
    direction: str = Field(..., description="What the user wants -- the intended behavior to fix/improve toward.")
    test_level: Literal["minimum", "normal", "max"] = "normal"
    max_iterations: int = Field(default=20, ge=1, le=100)
    success_ratio: str = Field(default="3/3", pattern=r"^\d+/\d+$")


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


class JobStopResponse(BaseModel):
    """Returned after a stop request."""

    job_id: str
    stopped: bool
    message: str
