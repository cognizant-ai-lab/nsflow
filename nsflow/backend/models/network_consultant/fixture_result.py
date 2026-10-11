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

"""Result model for one Network Consultant fixture."""

from pydantic import BaseModel
from pydantic import Field


class FixtureResult(BaseModel):
    """One fixture's verdict from the most recent round that ran it."""

    fixture: str
    passed: bool
    message: str | None = Field(
        default=None, description="Why it failed -- the assertion text, verbatim. None when it passed."
    )
    infrastructure_error: bool = Field(
        default=False,
        description="True when the run could not reach a verdict -- a timeout or an API-key fault, not a "
        "defect in the network. Worth showing differently: treating these as defects is what sends the "
        "consultant rewriting agents that were never at fault.",
    )
