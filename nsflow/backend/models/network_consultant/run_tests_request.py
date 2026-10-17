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

"""Request model for running Network Consultant fixtures."""

from pydantic import BaseModel
from pydantic import Field


class RunTestsRequest(BaseModel):
    """Request to run a network's existing test fixtures once."""

    network_name: str = Field(..., description="Network name relative to registries/, e.g. 'basic/coffee_finder'.")
    fixture_name: str | None = Field(
        default=None,
        description="Run only this fixture (a basename such as 'order_lookup.hocon'). Omit to run the whole "
        "suite. A single-fixture run reports through the per-fixture results only -- it is not a full-suite "
        "measurement, so it neither draws a chart bar nor seeds a later Self-Improve run's baseline.",
    )
    session_id: str = Field(
        default="global", description="Chat session ID -- job logs are mirrored to this session's LogsPanel channel."
    )
