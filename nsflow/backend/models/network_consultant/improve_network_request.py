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

"""Request model for improving a network."""

from typing import Literal

from pydantic import BaseModel
from pydantic import Field


class ImproveNetworkRequest(BaseModel):
    """Request to run the iterative generate, test, diagnose, and repair loop."""

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
