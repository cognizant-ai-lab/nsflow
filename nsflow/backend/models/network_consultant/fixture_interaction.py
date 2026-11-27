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

"""Interaction model for a Network Consultant fixture."""

from typing import Any

from pydantic import BaseModel
from pydantic import Field


class FixtureInteraction(BaseModel):
    """One turn of a possibly multi-turn fixture conversation."""

    text: str
    timeout_in_seconds: int | None = None
    response_checks: dict[str, Any] = Field(
        default_factory=dict,
        description="interactions[].response.text verbatim -- one entry per assertion neuro-san's "
        "AgentEvaluatorFactory supports, keyed by assertion type.",
    )
    sly_data: dict[str, Any] = Field(default_factory=dict)
