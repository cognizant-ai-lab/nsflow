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
Tests for GET /api/v1/toolbox, which feeds the editor palette.

What matters is the choice between the two toolboxes: the designer's curated subset
when AGENT_NETWORK_DESIGNER_TOOLBOX_INFO_FILE points somewhere usable, and the
runtime toolbox otherwise. Offering tools the designer will not accept is invisible
from the tool list alone, which is why the response reports its ``source``.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from nsflow.backend.api.v1 import toolbox_endpoints

DESIGNER_ENV_VAR = toolbox_endpoints.DESIGNER_TOOLBOX_ENV_VAR

# A stand-in for the designer's toolbox info file: one entry with a class and one
# without, so the coded_tool/langchain_tool split is exercised.
DESIGNER_TOOLBOX = """
{
    "drag_me": {
        "class": "some_module.DragMe",
        "description": "A coded tool the designer may pick.",
    },
    "a_toolkit": {
        "description": "A toolkit with no class of its own.",
    },
}
"""


@pytest.fixture(name="client")
def client_fixture() -> TestClient:
    """An app serving only the toolbox router, so nothing else can interfere."""
    app = FastAPI()
    app.include_router(toolbox_endpoints.router)
    return TestClient(app)


@pytest.fixture(autouse=True)
def clear_toolbox_cache():
    """The route caches its load process-wide, so each test starts and ends clean."""
    toolbox_endpoints._TOOLBOX_CACHE.clear()  # pylint: disable=protected-access
    yield
    toolbox_endpoints._TOOLBOX_CACHE.clear()  # pylint: disable=protected-access


@pytest.fixture(name="designer_toolbox_file")
def designer_toolbox_file_fixture(tmp_path) -> str:
    """Write the stand-in designer toolbox to a temp file and return its path."""
    path = tmp_path / "agent_network_designer_toolbox_info.hocon"
    path.write_text(DESIGNER_TOOLBOX, encoding="utf-8")
    return str(path)


def test_serves_the_designer_toolbox_when_configured(client, designer_toolbox_file, monkeypatch):
    """
    The designer's curated subset wins, since the designer canonicalises every edit
    and only knows the tools in this file. Each entry carries what the palette needs
    to label and group it.
    """
    monkeypatch.setenv(DESIGNER_ENV_VAR, designer_toolbox_file)

    body = client.get("/api/v1/toolbox").json()

    assert body["source"] == "agent_network_designer"
    assert body["tools"] == [
        {
            "name": "a_toolkit",
            "description": "A toolkit with no class of its own.",
            "class": None,
            "display_as": "langchain_tool",
        },
        {
            "name": "drag_me",
            "description": "A coded tool the designer may pick.",
            "class": "some_module.DragMe",
            "display_as": "coded_tool",
        },
    ]


@pytest.mark.parametrize(
    "designer_path",
    [
        pytest.param(None, id="unset"),
        pytest.param("/nonexistent/toolbox.hocon", id="missing file"),
    ],
)
def test_falls_back_to_the_runtime_toolbox(client, monkeypatch, designer_path):
    """
    With no usable designer toolbox, the runtime toolbox is a better answer than an
    empty palette, and a stale path should not take the palette down.
    """
    if designer_path is None:
        monkeypatch.delenv(DESIGNER_ENV_VAR, raising=False)
    else:
        monkeypatch.setenv(DESIGNER_ENV_VAR, designer_path)

    body = client.get("/api/v1/toolbox").json()

    # Only the choice of source is asserted. Which tools neuro-san ships in its
    # built-in toolbox is neuro-san's business and changes between releases, so
    # naming one here would make this test fail for a reason it does not care about.
    assert body["source"] == "runtime"


def test_a_failed_load_is_not_cached_so_a_later_request_heals(client, designer_toolbox_file, monkeypatch):
    """
    The cache avoids re-parsing HOCON per request, but caching a failure would pin
    the wrong toolbox until the server restarted.
    """
    monkeypatch.setenv(DESIGNER_ENV_VAR, "/nonexistent/toolbox.hocon")
    assert client.get("/api/v1/toolbox").json()["source"] == "runtime"

    monkeypatch.setenv(DESIGNER_ENV_VAR, designer_toolbox_file)
    assert client.get("/api/v1/toolbox").json()["source"] == "agent_network_designer"
