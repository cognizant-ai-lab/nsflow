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

"""Model for a Network Consultant fixture."""

from pydantic import BaseModel
from pydantic import Field

from nsflow.backend.models.network_consultant.fixture_interaction import FixtureInteraction


class Fixture(BaseModel):
    """One parsed tests/fixtures/<network>/<name>.hocon file."""

    name: str
    agent: str | None = None
    success_ratio: str | None = None
    connections: list[str] = Field(default_factory=list)
    interactions: list[FixtureInteraction] = Field(default_factory=list)
    raw_hocon: str
    parse_error: str | None = Field(
        default=None, description="Set instead of the parsed fields above if this file failed to parse."
    )
