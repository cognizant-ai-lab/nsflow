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

import os
import shutil
import tempfile
import unittest
from pathlib import Path
from typing import Any
from typing import Dict
from unittest import mock

import pytest
from fastapi.testclient import TestClient

from nsflow.backend.main import app
from nsflow.backend.utils.agentutils import served_networks

NETWORK = """
{
    "tools": [
        {"name": "frontman", "instructions": "You are the front man.", "tools": ["helper", "search"]},
        {"name": "helper", "instructions": "You help."},
        {"name": "search", "toolbox": "website_search"}
    ]
}
"""

# A network that carries descriptions in each of the places one can be found.
#
# `booker` is written the way the agent network designer writes every agent it
# generates: `function` is the shared `aaosa_call` block with a description merged
# over it. The real file gets `aaosa_call` from an include of registries/aaosa.hocon;
# it is defined inline here so the merge goes through the real parser without this
# test depending on a file outside the temporary registry.
#
# `string_call` is malformed on purpose: its `function` is a string, not a dict, and
# the string happens to contain the word "description".
DESCRIBED_NETWORK = """
{
    "aaosa_call": {
        "description": "Depending on the mode, returns a natural language string in response.",
        "parameters": {
            "type": "object",
            "properties": {"inquiry": {"type": "string", "description": "The inquiry"}}
        }
    },
    "tools": [
        {
            "name": "frontman",
            "description": "Front desk for travel.",
            "instructions": "You are the front man.",
            "tools": ["booker", "weather", "chooser", "blank", "blank_call", "string_call", "search"]
        },
        {
            "name": "booker",
            "function": ${aaosa_call}{"description": "Books flights and hotels."},
            "instructions": "You book."
        },
        {"name": "weather", "instructions": "You report the weather."},
        {
            "name": "chooser",
            "description": "The top-level one.",
            "function": {"description": "The function one."},
            "instructions": "You choose."
        },
        {"name": "blank", "description": "", "instructions": "You are blank."},
        {"name": "blank_call", "function": {"description": ""}, "instructions": "You are blank too."},
        {"name": "string_call", "function": "has a description in it", "instructions": "You are misfiled."},
        {"name": "search", "toolbox": "website_search"}
    ]
}
"""


@pytest.fixture(name="registry")
def registry_fixture(tmp_path: Path, monkeypatch) -> Path:
    """
    A registry laid out like a real one: a manifest listing what is served, a network at
    the top level and one in generated/, and the server started somewhere else entirely.

    The manifest is what makes this realistic. Networks are reachable because they are
    listed, which is how neuro-san decides what it serves, so a file sitting in the
    registry without an entry is not reachable and should not be.

    Everything lives under tmp_path so each test gets its own, and the working directory
    is a sibling of the registry rather than its parent. That is the shape of a pip
    installed neuro-san-studio: the project you run from has no registries/ of its own,
    so a path built against the working directory cannot accidentally resolve.
    """
    registry = tmp_path / "registries"
    (registry / "generated").mkdir(parents=True)
    (registry / "top_level.hocon").write_text(NETWORK, encoding="utf-8")
    (registry / "generated" / "coffee_shop.hocon").write_text(NETWORK, encoding="utf-8")
    # Present on disk but absent from the manifest, so it must not be readable.
    (registry / "not_served.hocon").write_text(NETWORK, encoding="utf-8")
    manifest = registry / "manifest.hocon"
    manifest.write_text(
        '{\n "top_level.hocon": true\n "generated/coffee_shop.hocon": true\n}\n',
        encoding="utf-8",
    )
    # Patched on served_networks, which binds both names at import time.
    monkeypatch.setattr(served_networks, "AGENT_MANIFEST_FILE", str(manifest))
    monkeypatch.setattr(served_networks, "REGISTRY_DIR", str(registry))

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
        "not_served",
    ],
    ids=[
        "climbs out, encoded",
        "climbs out via a subdirectory, encoded",
        "absent",
        "present on disk but switched off in the manifest",
    ],
)
def test_refuses_anything_outside_the_registry(client: TestClient, registry: Path, name: str):
    """
    The name arrives from the URL, so it only ever selects a manifest entry.

    A name that climbs out, one that is simply wrong, and one whose file is really there
    but switched off all fail the same way, because none of them is a served name.
    """
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


class TestNetworkDefinitionEndpoint(unittest.TestCase):
    """
    Covers the descriptions GET /api/v1/network_definition hands the Editor.

    The Editor sends the definition it was given straight back on every save, so an
    agent whose description is missing here has it written back blank by the next
    edit, whichever agent that edit was to. These tests pin down where a description
    is read from, and that nothing else about an entry changed to make room for it.

    The registry is laid out as the module's registry fixture lays it out: a manifest
    that serves the network, the network in generated/, and the server started from a
    sibling of the registry so that a path built against the working directory cannot
    resolve by accident.
    """

    def setUp(self) -> None:
        """
        Build a temporary registry that serves one described network, and a client.
        """
        self.root: str = tempfile.mkdtemp()
        registry: Path = Path(self.root) / "registries"
        (registry / "generated").mkdir(parents=True)
        (registry / "generated" / "travel.hocon").write_text(DESCRIBED_NETWORK, encoding="utf-8")
        manifest: Path = registry / "manifest.hocon"
        manifest.write_text('{\n "generated/travel.hocon": true\n}\n', encoding="utf-8")

        # Patched on served_networks, which binds both names at import time, so patching
        # agent_network_utils where they are defined would not reach the endpoint.
        self.registry_patch: Any = mock.patch.multiple(
            served_networks, AGENT_MANIFEST_FILE=str(manifest), REGISTRY_DIR=str(registry)
        )
        self.registry_patch.start()

        self.original_cwd: str = os.getcwd()
        elsewhere: Path = Path(self.root) / "somewhere_else"
        elsewhere.mkdir()
        os.chdir(elsewhere)

        self.client: TestClient = TestClient(app)

    def tearDown(self) -> None:
        """
        Put the working directory and the registry paths back, then delete the registry.
        """
        # Back out of the temporary tree before deleting it, since the working
        # directory is inside it.
        os.chdir(self.original_cwd)
        self.registry_patch.stop()
        shutil.rmtree(self.root, ignore_errors=True)

    def definition(self) -> Dict[str, Any]:
        """
        Fetch the generated network's definition through the real app.

        :return: The ``agent_network_definition`` the Editor would receive, keyed by
                 agent name.
        """
        # Any, because the class it returns depends on whether starlette's TestClient
        # found httpx2 or httpx installed.
        response: Any = self.client.get("/api/v1/network_definition/generated/travel")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["agent_network_definition"]

    def test_returns_a_top_level_description(self) -> None:
        """
        A description written at the top level of an agent comes back as it is.
        """
        self.assertEqual(
            self.definition()["frontman"],
            {
                "instructions": "You are the front man.",
                "description": "Front desk for travel.",
                "tools": ["booker", "weather", "chooser", "blank", "blank_call", "string_call", "search"],
            },
        )

    def test_returns_the_function_description_of_a_designer_generated_agent(self) -> None:
        """
        A description under ``function`` comes back, which is how the designer writes
        every agent. Only the description is taken: the call's parameters belong to
        the HOCON, not to the definition the Editor holds.
        """
        self.assertEqual(
            self.definition()["booker"],
            {"instructions": "You book.", "description": "Books flights and hotels."},
        )

    def test_leaves_the_key_out_when_the_agent_has_no_description(self) -> None:
        """
        No description in the HOCON means no ``description`` key, rather than an
        empty one standing in for it.
        """
        weather: Dict[str, Any] = self.definition()["weather"]

        self.assertNotIn("description", weather)
        self.assertEqual(weather, {"instructions": "You report the weather."})

    def test_prefers_the_top_level_description_over_the_function_one(self) -> None:
        """
        The import reads the top level first, and this has to agree with it, or the
        same file would open with different descriptions depending on how it was opened.
        """
        self.assertEqual(self.definition()["chooser"]["description"], "The top-level one.")

    def test_keeps_an_empty_description(self) -> None:
        """
        An empty description is present, not absent, so it comes back empty.
        """
        self.assertEqual(self.definition()["blank"], {"instructions": "You are blank.", "description": ""})

    def test_keeps_an_empty_function_description(self) -> None:
        """
        The same holds under ``function``: an empty description there is present as
        well, so it also comes back empty.
        """
        self.assertEqual(self.definition()["blank_call"], {"instructions": "You are blank too.", "description": ""})

    def test_ignores_a_function_that_is_not_a_dict(self) -> None:
        """
        A ``function`` that is not a dict has no description to give, even a string
        with the word in it. Indexing that string as if it were a dict would fail the
        whole request, and take every other agent in the network down with it.
        """
        string_call: Dict[str, Any] = self.definition()["string_call"]

        self.assertNotIn("description", string_call)
        self.assertEqual(string_call, {"instructions": "You are misfiled."})

    def test_still_returns_a_toolbox_tool_as_an_empty_entry(self) -> None:
        """
        A toolbox tool gains nothing, because an entry with no keys at all is how the
        Editor knows it is a tool rather than an agent.
        """
        self.assertEqual(self.definition()["search"], {})

    def test_still_returns_every_agent_instructions(self) -> None:
        """
        Adding descriptions must not cost an agent its instructions.
        """
        expected: Dict[str, str] = {
            "frontman": "You are the front man.",
            "booker": "You book.",
            "weather": "You report the weather.",
            "chooser": "You choose.",
            "blank": "You are blank.",
            "blank_call": "You are blank too.",
            "string_call": "You are misfiled.",
        }
        definition: Dict[str, Any] = self.definition()

        for name, instructions in expected.items():
            self.assertEqual(definition[name]["instructions"], instructions, name)
