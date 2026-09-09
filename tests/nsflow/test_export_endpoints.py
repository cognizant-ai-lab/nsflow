# Copyright © 2026 Cognizant Technology Solutions Corp, www.cognizant.com.
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
"""Covers HOCON export: where it looks, what it will serve, and what it refuses."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from nsflow.backend.api.v1 import export_endpoints
from nsflow.backend.main import app


@pytest.fixture(name="registry")
def registry_fixture(tmp_path: Path, monkeypatch) -> Path:
    """A registry laid out like a real one, including a nested network."""
    (tmp_path / "top_level.hocon").write_text('{"tools": []}', encoding="utf-8")
    (tmp_path / "generated").mkdir()
    (tmp_path / "generated" / "made_by_designer.hocon").write_text('{"tools": []}', encoding="utf-8")
    monkeypatch.setattr(export_endpoints, "REGISTRY_DIR", tmp_path)
    return tmp_path


@pytest.fixture(name="client")
def client_fixture() -> TestClient:
    return TestClient(app)


def test_serves_a_network_from_the_configured_registry(client: TestClient, registry: Path):
    """The registry comes from AGENT_MANIFEST_FILE, not from the process working directory."""
    response = client.get("/api/v1/export/agent_network/top_level")
    assert response.status_code == 200
    assert response.text == '{"tools": []}'


def test_serves_a_nested_network(client: TestClient, registry: Path):
    """Networks are listed by their path in the registry, so the route has to accept one."""
    response = client.get("/api/v1/export/agent_network/generated/made_by_designer")
    assert response.status_code == 200
    # The leaf, because a browser silently drops a slash in a download name.
    assert "made_by_designer.hocon" in response.headers.get("content-disposition", "")


@pytest.mark.parametrize(
    "name",
    [
        # Percent-encoded, deliberately. A plain "../" is normalised away by the HTTP
        # layer and 404s at routing without ever reaching the handler, so testing that
        # form proves nothing about the guard. Encoded, it arrives intact as "../".
        "%2e%2e%2fsecret",
        "generated%2f%2e%2e%2f%2e%2e%2fsecret",
        "does_not_exist",
    ],
    ids=["climbs out, encoded", "climbs out via a subdirectory, encoded", "absent"],
)
def test_refuses_anything_outside_the_registry(client: TestClient, registry: Path, name: str):
    """
    The name arrives from the URL, so it has to be proven to stay inside the registry.

    Verified non-vacuous: removing the `is_relative_to` check makes the two encoded
    cases return 200 with the contents of a file outside the registry.
    """
    (registry.parent / "secret.hocon").write_text("secret", encoding="utf-8")
    response = client.get(f"/api/v1/export/agent_network/{name}")
    assert response.status_code == 404, f"{name} was served: {response.text[:80]}"
