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
"""Covers HOCON import: the shape it returns, and what it refuses."""

import pytest
from fastapi.testclient import TestClient

from nsflow.backend.api.v1 import hocon_endpoints
from nsflow.backend.main import app

NETWORK = """{
    "llm_config": { "model_name": "gpt-4o" },
    "tools": [
        {
            "name": "demo_agent",
            "function": { "description": "the front man" },
            "instructions": "You are the front man.",
            "tools": ["helper", "website_search"]
        },
        { "name": "helper", "instructions": "" },
        { "name": "website_search", "toolbox": "website_search" }
    ]
}
"""


@pytest.fixture(name="client")
def client_fixture() -> TestClient:
    """A client against the real app, so route registration is covered too."""
    return TestClient(app)


def _post(client: TestClient, body: str, filename: str = "demo.hocon"):
    return client.post("/api/v1/hocon/import", files={"file": (filename, body, "text/plain")})


def test_returns_the_designer_dict_shape(client: TestClient):
    """An entry's emptiness is meaningful, so presence of keys must survive the trip."""
    definition = _post(client, NETWORK).json()["definition"]

    assert definition["demo_agent"] == {
        "instructions": "You are the front man.",
        "description": "the front man",
        "tools": ["helper", "website_search"],
    }
    # Empty but PRESENT instructions: an LLM agent whose prompt was cleared, which
    # must not be reclassified as a toolbox tool.
    assert definition["helper"] == {"instructions": ""}
    # No instructions and no description at all: a toolbox tool.
    assert definition["website_search"] == {}


def test_names_the_network_after_the_file_safely(client: TestClient):
    """The name reaches neuro-san, which only accepts [a-zA-Z0-9_-]."""
    assert _post(client, NETWORK, "My Network v2.hocon").json()["network_name"] == "My_Network_v2"


@pytest.mark.parametrize(
    "body,filename,status",
    [
        (NETWORK, "notes.txt", 400),
        ("{ tools = [ ", "broken.hocon", 400),
        ('{ "llm_config": { "model_name": "gpt-4o" } }', "no_tools.hocon", 400),
        ("", "empty.hocon", 400),
    ],
    ids=["wrong suffix", "unparseable", "no tools", "empty"],
)
def test_refuses_what_it_cannot_open(client: TestClient, body: str, filename: str, status: int):
    """Each rejection is a 400 with a reason, not a 500."""
    response = _post(client, body, filename)
    assert response.status_code == status
    assert response.json()["detail"]


def test_reports_a_clash_only_inside_the_designer_subdirectory(client: TestClient, tmp_path, monkeypatch):
    """A same-named network elsewhere in the registry is served under a different path."""
    monkeypatch.setattr(hocon_endpoints, "REGISTRY_DIR", str(tmp_path))
    monkeypatch.setenv("AGENT_NETWORK_DESIGNER_SUBDIRECTORY", "generated")

    # Same name, but at the registry root rather than in generated/: not at risk.
    (tmp_path / "demo.hocon").write_text(NETWORK, encoding="utf-8")
    assert _post(client, NETWORK, "demo.hocon").json()["name_is_taken"] is False

    (tmp_path / "generated").mkdir()
    (tmp_path / "generated" / "demo.hocon").write_text(NETWORK, encoding="utf-8")
    assert _post(client, NETWORK, "demo.hocon").json()["name_is_taken"] is True
