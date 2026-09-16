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
"""
Covers GET /api/v1/network_definition, which is what fills the Editor canvas.

This is the endpoint the Editor calls when you pick an existing network, either with
the pen icon in the sidebar or from the network dropdown. If it 404s the canvas is
simply empty, so where it looks for the registry decides whether editing an existing
network works at all.
"""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from nsflow.backend.api.v1 import agent_flows
from nsflow.backend.main import app

NETWORK = """
{
    "tools": [
        {"name": "frontman", "instructions": "You are the front man.", "tools": ["helper", "search"]},
        {"name": "helper", "instructions": "You help."},
        {"name": "search", "toolbox": "website_search"}
    ]
}
"""


@pytest.fixture(name="registry")
def registry_fixture(tmp_path: Path, monkeypatch) -> Path:
    """
    A registry laid out like a real one, with the server started somewhere else.

    Everything lives under tmp_path so each test gets its own, and the working directory
    is a sibling of the registry rather than its parent. That is the shape of a pip
    installed neuro-san-studio: the project you run from has no registries/ of its own,
    so a path built against the working directory cannot accidentally resolve.
    """
    registry = tmp_path / "registries"
    (registry / "generated").mkdir(parents=True)
    (registry / "top_level.hocon").write_text(NETWORK, encoding="utf-8")
    (registry / "generated" / "coffee_shop.hocon").write_text(NETWORK, encoding="utf-8")
    monkeypatch.setattr(agent_flows, "REGISTRY_DIR", registry)

    elsewhere = tmp_path / "somewhere_else"
    elsewhere.mkdir()
    monkeypatch.chdir(elsewhere)
    return registry


@pytest.fixture(name="client")
def client_fixture() -> TestClient:
    """A client against the real app, so route registration is covered too."""
    return TestClient(app)


@pytest.mark.usefixtures("registry")
def test_reads_the_configured_registry_not_the_working_directory(client: TestClient):
    """
    The registry comes from AGENT_MANIFEST_FILE. It used to be the literal relative path
    "registries/<name>.hocon", which only resolves when the server happens to be started
    from a project root that has a registries/ beside it. Under a pip installed
    neuro-san-studio it never does, so every network opened in the Editor came back 404
    and the canvas stayed blank.
    """
    response = client.get("/api/v1/network_definition/top_level")

    assert response.status_code == 200, response.text
    definition = response.json()["agent_network_definition"]
    assert set(definition) == {"frontman", "helper", "search"}


@pytest.mark.usefixtures("registry")
def test_reads_a_generated_network(client: TestClient):
    """
    Generated networks are served as "generated/<name>", and that is the name the Editor
    holds, so the subdirectory has to survive. Note this is the case the sidebar's pen
    icon hits most, since the networks people go back to edit are the generated ones.
    """
    response = client.get("/api/v1/network_definition/generated/coffee_shop")

    assert response.status_code == 200, response.text
    assert response.json()["agent_network_name"] == "generated/coffee_shop"
    assert "frontman" in response.json()["agent_network_definition"]


@pytest.mark.usefixtures("registry")
def test_tells_an_agent_apart_from_a_tool(client: TestClient):
    """Presence of instructions is what makes an entry an agent rather than a tool."""
    definition = client.get("/api/v1/network_definition/top_level").json()["agent_network_definition"]

    assert definition["frontman"] == {"instructions": "You are the front man.", "tools": ["helper", "search"]}
    # A toolbox tool carries no instructions, and an empty dict is how that is said.
    assert definition["search"] == {}


@pytest.mark.parametrize(
    "name",
    [
        # Percent-encoded, deliberately. A plain "../" is normalised away by the HTTP
        # layer before the handler sees it, so testing that form proves nothing about
        # the guard. Encoded, it arrives intact.
        "%2e%2e%2fsecret",
        "generated%2f%2e%2e%2f%2e%2e%2fsecret",
        "does_not_exist",
    ],
    ids=["climbs out, encoded", "climbs out via a subdirectory, encoded", "absent"],
)
def test_refuses_anything_outside_the_registry(client: TestClient, registry: Path, name: str):
    """The name arrives from the URL, so it has to be proven to stay inside the registry."""
    (registry.parent / "secret.hocon").write_text(NETWORK, encoding="utf-8")

    response = client.get(f"/api/v1/network_definition/{name}")

    assert response.status_code == 404, f"{name} was served: {response.text[:120]}"


def test_works_both_as_a_studio_library_and_from_a_studio_checkout(client: TestClient, registry: Path, monkeypatch):
    """
    The two deployments nsflow has to support, in one test.

    Run from a clone of neuro-san-studio the working directory is the repo root and
    registries/ sits beside it, which is the only case the old relative path handled.
    Installed as a library it is some other project's directory entirely. The answer has
    to be the same either way, so this asks from both and compares.
    """
    installed_as_a_library = client.get("/api/v1/network_definition/top_level").json()

    # A studio checkout: the working directory is the parent of registries/.
    monkeypatch.chdir(registry.parent)
    from_a_checkout = client.get("/api/v1/network_definition/top_level").json()

    assert installed_as_a_library == from_a_checkout
    assert installed_as_a_library["agent_network_definition"]
