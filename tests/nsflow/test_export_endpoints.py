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

from nsflow.backend.main import app
from nsflow.backend.utils.agentutils import served_networks


@pytest.fixture(name="registry")
def registry_fixture(tmp_path: Path, monkeypatch) -> Path:
    """
    A registry laid out like a real one: a manifest, a top level network and a nested one.

    Export now offers what the manifest serves rather than whatever .hocon happens to be
    in the directory, so the manifest is what makes a network reachable here.
    """
    (tmp_path / "top_level.hocon").write_text('{"tools": []}', encoding="utf-8")
    (tmp_path / "generated").mkdir()
    (tmp_path / "generated" / "made_by_designer.hocon").write_text('{"tools": []}', encoding="utf-8")
    manifest = tmp_path / "manifest.hocon"
    manifest.write_text(
        '{\n "top_level.hocon": true\n "generated/made_by_designer.hocon": true\n}\n',
        encoding="utf-8",
    )
    monkeypatch.setattr(served_networks, "AGENT_MANIFEST_FILE", str(manifest))
    monkeypatch.setattr(served_networks, "REGISTRY_DIR", str(tmp_path))
    return tmp_path


@pytest.fixture(name="client")
def client_fixture() -> TestClient:
    """A client against the real app, so route registration is covered too."""
    return TestClient(app)


@pytest.mark.usefixtures("registry")
def test_serves_a_network_from_the_configured_registry(client: TestClient):
    """The registry comes from AGENT_MANIFEST_FILE, not from the process working directory."""
    response = client.get("/api/v1/export/agent_network/top_level")
    assert response.status_code == 200
    assert response.text == '{"tools": []}'


@pytest.mark.usefixtures("registry")
def test_serves_a_nested_network(client: TestClient):
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

    Verified non-vacuous: resolving the name against the registry directly, the way this
    used to, makes the two encoded cases return 200 with a file from outside it.
    """
    (registry.parent / "secret.hocon").write_text("secret", encoding="utf-8")
    response = client.get(f"/api/v1/export/agent_network/{name}")
    assert response.status_code == 404, f"{name} was served: {response.text[:80]}"
