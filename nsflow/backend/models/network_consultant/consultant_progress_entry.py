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

"""Validated progress checkpoint emitted by a Network Consultant process."""

from typing import Annotated
from typing import Literal

from pydantic import BaseModel
from pydantic import ConfigDict
from pydantic import Field


class ConsultantProgressEntry(BaseModel):
    """One safe chart checkpoint parsed from a consultant JSON-lines sidecar."""

    model_config = ConfigDict(extra="ignore", strict=True)

    check: int | None = Field(default=None, ge=0)
    checkpoint: Literal["before", "after", "generated", "iteration"] = "iteration"
    improvement_iteration: int | None = Field(default=None, ge=0)
    passed: int = Field(default=0, ge=0)
    total: int = Field(default=0, ge=0)
    segments: list[Annotated[int, Field(ge=0)]] | None = None
