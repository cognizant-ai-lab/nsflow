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

import os
import tempfile
import unittest
from typing import Dict
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from httpx import Response

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


class TestDeleteGeneratedNetwork:
    """Deletion is destructive and URL-driven, so its scope is what matters most."""

    @pytest.fixture(name="generated")
    def generated_fixture(self, tmp_path, monkeypatch):
        """A registry with a generated subdirectory and its own manifest."""
        monkeypatch.setattr(hocon_endpoints, "REGISTRY_DIR", str(tmp_path))
        monkeypatch.setenv("AGENT_NETWORK_DESIGNER_SUBDIRECTORY", "generated")
        generated = tmp_path / "generated"
        generated.mkdir()
        (generated / "demo.hocon").write_text(NETWORK, encoding="utf-8")
        (generated / "manifest.hocon").write_text(
            '{\n    # keep me\n    "generated/demo.hocon": true\n    "generated/other.hocon": true\n}\n',
            encoding="utf-8",
        )
        # Outside the generated directory: part of the deployment, not ours to remove.
        (tmp_path / "deployment.hocon").write_text(NETWORK, encoding="utf-8")
        return tmp_path

    def test_removes_the_file_and_its_manifest_entry(self, client: TestClient, generated):
        """The file goes, its manifest line goes, and nothing else in the file moves."""
        response = client.delete("/api/v1/hocon/generated/demo")
        assert response.status_code == 200
        assert not (generated / "generated" / "demo.hocon").exists()

        manifest = (generated / "generated" / "manifest.hocon").read_text(encoding="utf-8")
        assert "demo.hocon" not in manifest
        # Everything else in the file survives, including comments.
        assert "other.hocon" in manifest
        assert "# keep me" in manifest

    @pytest.mark.usefixtures("generated")
    @pytest.mark.parametrize("name", ["demo", "generated/demo"])
    def test_accepts_the_name_with_or_without_its_directory(self, client: TestClient, name: str):
        """The sidebar knows networks by their served path, so both spellings work."""
        assert client.delete(f"/api/v1/hocon/generated/{name}").status_code == 200

    def test_deletes_from_a_renamed_designer_subdirectory(self, client: TestClient, tmp_path, monkeypatch):
        """
        The route segment is always "generated", but the directory it means is whatever
        AGENT_NETWORK_DESIGNER_SUBDIRECTORY says. A deployment that renames it still has
        to be able to delete, so the two cannot be assumed to be the same word.
        """
        monkeypatch.setattr(hocon_endpoints, "REGISTRY_DIR", str(tmp_path))
        monkeypatch.setenv("AGENT_NETWORK_DESIGNER_SUBDIRECTORY", "drafts")
        drafts = tmp_path / "drafts"
        drafts.mkdir()
        (drafts / "demo.hocon").write_text(NETWORK, encoding="utf-8")

        # What the sidebar used to send, built by pasting the served path onto the
        # route. Once the directory is not called generated it reaches no delete route
        # at all, so the network stays put and the user sees a failure they cannot act
        # on. Checked by outcome rather than by status, which depends on what else is
        # mounted at that path.
        assert client.delete("/api/v1/hocon/drafts/demo").status_code != 200
        assert (drafts / "demo.hocon").exists()

        assert client.delete("/api/v1/hocon/generated/demo").status_code == 200
        assert not (drafts / "demo.hocon").exists()

    def test_refuses_a_network_outside_the_generated_directory(self, client: TestClient, generated):
        """Deletion is scoped to what the designer generated, not the whole registry."""
        # Percent-encoded, because a plain "../" is normalised away before it reaches
        # the handler and so would prove nothing about the guard.
        assert client.delete("/api/v1/hocon/generated/%2e%2e%2fdeployment").status_code == 404
        assert (generated / "deployment.hocon").exists()

    @pytest.mark.usefixtures("generated")
    def test_reports_a_missing_network_rather_than_pretending(self, client: TestClient):
        """A 404 rather than a cheerful 200 that deleted nothing."""
        assert client.delete("/api/v1/hocon/generated/never_existed").status_code == 404


class TestNetworkNameCheck(unittest.TestCase):
    """
    Covers GET /hocon/name_taken, which the Editor asks before it records a name.

    The designer saves a named network over whatever file already has that name, so
    this answer is the only thing standing between naming a network and silently
    replacing a different one. It has to agree with import's rule about which file a
    name means, and it must not answer for files outside the designer's subdirectory.
    """

    def setUp(self) -> None:
        """
        Point the registry at a fresh directory holding one generated network.

        Patched with unittest.mock rather than pytest's monkeypatch so the class runs
        under plain unittest too; every patch is undone by addCleanup, in reverse.
        """
        # Not a with block: the directory has to outlive setUp, so addCleanup removes it.
        staging = tempfile.TemporaryDirectory()  # pylint: disable=consider-using-with
        self.addCleanup(staging.cleanup)
        self.registry: str = staging.name

        registry_patch = patch.object(hocon_endpoints, "REGISTRY_DIR", self.registry)
        registry_patch.start()
        self.addCleanup(registry_patch.stop)
        self.use_designer_subdirectory("generated")

        os.mkdir(os.path.join(self.registry, "generated"))
        self.write_network("generated", "travel")
        # Outside the generated directory: what an escaping name would reach for.
        self.write_network("deployment")

        self.client: TestClient = TestClient(app)

    def use_designer_subdirectory(self, subdirectory: str) -> None:
        """
        Set AGENT_NETWORK_DESIGNER_SUBDIRECTORY for the rest of the test.

        :param subdirectory: the directory, relative to the registry, the designer saves into.
        """
        env_patch = patch.dict(os.environ, {"AGENT_NETWORK_DESIGNER_SUBDIRECTORY": subdirectory})
        env_patch.start()
        self.addCleanup(env_patch.stop)

    def write_network(self, *parts: str) -> None:
        """
        Write a network HOCON into the registry.

        :param parts: the path below the registry, the last part being the name without .hocon.
        """
        with open(os.path.join(self.registry, *parts) + ".hocon", "w", encoding="utf-8") as handle:
            handle.write(NETWORK)

    def ask(self, params: Dict[str, str]) -> Response:
        """
        Ask the real app whether a name is taken, so route registration is covered too.

        :param params: the query parameters to send.
        :return: the HTTP response.
        """
        return self.client.get("/api/v1/hocon/name_taken", params=params)

    def test_reports_a_generated_network_of_that_name_as_taken(self) -> None:
        """Saving under this name would replace generated/travel.hocon, so it is taken."""
        response = self.ask({"name": "travel"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"network_name": "travel", "name_is_taken": True})

    def test_reports_a_name_with_no_generated_network_as_free(self) -> None:
        """A name nothing in the designer's subdirectory uses replaces nothing."""
        response = self.ask({"name": "music_nerd"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"network_name": "music_nerd", "name_is_taken": False})

    def test_ignores_a_same_named_network_outside_the_designer_subdirectory(self) -> None:
        """registries/deployment.hocon is served under a different path, so it is not at risk."""
        response = self.ask({"name": "deployment"})

        self.assertEqual(response.status_code, 200)
        self.assertIs(response.json()["name_is_taken"], False)

    def test_looks_in_the_configured_designer_subdirectory(self) -> None:
        """
        The directory is whatever AGENT_NETWORK_DESIGNER_SUBDIRECTORY says, read per request.

        A deployment that renames it saves there, so a file in "generated" is no longer
        at risk and one in the renamed directory is.
        """
        self.use_designer_subdirectory("drafts")
        os.mkdir(os.path.join(self.registry, "drafts"))
        self.write_network("drafts", "car_wash")

        self.assertIs(self.ask({"name": "car_wash"}).json()["name_is_taken"], True)
        self.assertIs(self.ask({"name": "travel"}).json()["name_is_taken"], False)

    def test_refuses_a_name_that_is_not_a_generated_network_name(self) -> None:
        """
        Each is a 400 with a reason, not an answer about some other file, and not a 500.

        The escaping names point at registries/deployment.hocon, which exists, so a
        missing guard would show up as a 200 that says "taken".
        """
        refused: Dict[str, str] = {
            "parent segment": "../deployment",
            "absolute path": os.path.join(self.registry, "deployment"),
            "NUL byte": "travel\x00",
            "empty": "",
            "blank": "   ",
        }
        for label, name in refused.items():
            with self.subTest(label):
                response = self.ask({"name": name})
                self.assertEqual(response.status_code, 400)
                self.assertTrue(response.json()["detail"])

    def test_reports_a_symlinked_generated_network_as_taken(self) -> None:
        """
        A link in the designer's subdirectory is a network saving under its name would replace.

        The import's rule already calls it taken, because isfile follows the link, so the
        check has to agree rather than refuse the name: the Editor reads a refusal as free
        and would go on to save under the name without asking. The link points outside the
        subdirectory on purpose, since that is the case a resolved containment check refuses.
        """
        os.symlink(
            os.path.join(self.registry, "deployment.hocon"),
            os.path.join(self.registry, "generated", "linked.hocon"),
        )

        response = self.ask({"name": "linked"})
        imported = self.client.post("/api/v1/hocon/import", files={"file": ("linked.hocon", NETWORK, "text/plain")})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"network_name": "linked", "name_is_taken": True})
        # The same answer import gives for a file of that name: one rule, two callers.
        self.assertIs(imported.json()["name_is_taken"], True)

    def test_refuses_a_name_through_a_directory_link_pointing_out(self) -> None:
        """
        A directory link on the way is still resolved, so it cannot be used to climb out.

        generated/escape points at the registry itself, where deployment.hocon exists, so
        a check that compared paths without resolving the directories would answer
        "taken" about a file outside the designer's subdirectory.
        """
        os.symlink(self.registry, os.path.join(self.registry, "generated", "escape"))

        response = self.ask({"name": "escape/deployment"})

        self.assertEqual(response.status_code, 400)

    def test_requires_the_name_query_parameter(self) -> None:
        """FastAPI exposes the name as a required query parameter, so leaving it out is a 422."""
        response = self.ask({})

        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"][0]["loc"], ["query", "name"])
