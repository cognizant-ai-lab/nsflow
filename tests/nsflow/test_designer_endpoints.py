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
Tests for GET /api/v1/designer/references, which feeds the editor palette.

What matters is that the set is the DESIGNER's, not the server's. Offering a network
the designer does not recognise makes it reject the reference and rewrite the network
with its LLM, so every later edit breaks until that reference is removed.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from nsflow.backend.api.v1 import designer_endpoints

# Two entries served and one not, so the `serve` flag is exercised.
DESIGNER_MANIFEST = """
{
    "industry/banking_ops.hocon": true,
    "generated/coffee_shop.hocon": true,
    "basic/coffee_finder.hocon": false,
}
"""

MCP_INFO = """
{
    "https://mcp.example.com/mcp": {
        "url": "https://mcp.example.com/mcp",
    },
}
"""


@pytest.fixture(name="client")
def client_fixture() -> TestClient:
    """An app serving only the designer router, so nothing else can interfere."""
    app = FastAPI()
    app.include_router(designer_endpoints.router)
    return TestClient(app)


def test_offers_only_the_networks_the_designer_manifest_serves(client, tmp_path, monkeypatch):
    """
    The designer manifest is a curated subset, and an unserved entry is not part of
    it. Both distinctions decide whether an edit stays deterministic.
    """
    manifest = tmp_path / "manifest_and.hocon"
    manifest.write_text(DESIGNER_MANIFEST, encoding="utf-8")
    monkeypatch.setenv(designer_endpoints.DESIGNER_MANIFEST_ENV_VAR, str(manifest))
    monkeypatch.delenv(designer_endpoints.MCP_SERVERS_ENV_VAR, raising=False)

    body = client.get("/api/v1/designer/references").json()

    assert sorted(body["networks"]) == ["/generated/coffee_shop", "/industry/banking_ops"]


def test_reports_the_mcp_servers_the_designer_was_given(client, tmp_path, monkeypatch):
    """The designer reads its servers from a file, not from the OAuth connection store."""
    mcp_info = tmp_path / "mcp_info.hocon"
    mcp_info.write_text(MCP_INFO, encoding="utf-8")
    monkeypatch.setenv(designer_endpoints.MCP_SERVERS_ENV_VAR, str(mcp_info))
    monkeypatch.delenv(designer_endpoints.DESIGNER_MANIFEST_ENV_VAR, raising=False)

    body = client.get("/api/v1/designer/references").json()

    assert body["mcp_servers"] == ["https://mcp.example.com/mcp"]


@pytest.mark.parametrize("missing", ["manifest", "mcp"])
def test_an_unreadable_source_empties_only_its_own_half(client, tmp_path, monkeypatch, missing):
    """
    Half the palette is better than none, and better than a 500: the toolbox section
    is served by a different route and stays usable either way.
    """
    manifest = tmp_path / "manifest_and.hocon"
    manifest.write_text(DESIGNER_MANIFEST, encoding="utf-8")
    mcp_info = tmp_path / "mcp_info.hocon"
    mcp_info.write_text(MCP_INFO, encoding="utf-8")

    monkeypatch.setenv(
        designer_endpoints.DESIGNER_MANIFEST_ENV_VAR,
        "/nonexistent/manifest.hocon" if missing == "manifest" else str(manifest),
    )
    monkeypatch.setenv(
        designer_endpoints.MCP_SERVERS_ENV_VAR,
        "/nonexistent/mcp_info.hocon" if missing == "mcp" else str(mcp_info),
    )

    response = client.get("/api/v1/designer/references")

    assert response.status_code == 200
    body = response.json()
    if missing == "manifest":
        assert body["networks"] == []
        assert body["mcp_servers"] != []
    else:
        assert body["networks"] != []
        assert body["mcp_servers"] == []
