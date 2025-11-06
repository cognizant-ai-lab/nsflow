
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

from importlib.metadata import version as actual_version
from fastapi.testclient import TestClient
from nsflow.backend.main import app

client = TestClient(app)


def test_fetch_version_nsflow_matches_actual():
    """Ensure the version returned from the endpoint matches importlib metadata"""
    expected = actual_version("nsflow")
    response = client.get("/api/v1/version/nsflow")

    assert response.status_code == 200
    returned_version = response.json()["version"]
    assert returned_version == expected
