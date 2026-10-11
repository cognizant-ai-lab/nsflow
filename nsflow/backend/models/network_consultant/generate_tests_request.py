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

"""Request model for generating Network Consultant fixtures."""

from typing import Literal

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
