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
Covers the manifest lookup that turns a requested network name into a file.

Two endpoints read a network off disk using a name that came from a URL, so this is the
one place that decides what such a name is allowed to reach. Worth testing on its own
rather than only through them.
"""

import os
from pathlib import Path

import pytest

from nsflow.backend.utils.agentutils import served_networks

NETWORK = '{"tools": [{"name": "frontman", "instructions": "hi"}]}'


@pytest.fixture(name="registry")
def registry_fixture(tmp_path: Path, monkeypatch) -> Path:
    """A registry with one served network, one nested, and one switched off."""
    registry = tmp_path / "registries"
    (registry / "generated").mkdir(parents=True)
    (registry / "top_level.hocon").write_text(NETWORK, encoding="utf-8")
    (registry / "generated" / "coffee.hocon").write_text(NETWORK, encoding="utf-8")
    (registry / "switched_off.hocon").write_text(NETWORK, encoding="utf-8")
    # Outside the registry, for the traversal cases.
    (tmp_path / "secret.hocon").write_text(NETWORK, encoding="utf-8")

    manifest = registry / "manifest.hocon"
    manifest.write_text(
        '{\n "top_level.hocon": true\n "generated/coffee.hocon": true\n "switched_off.hocon": false\n}\n',
        encoding="utf-8",
    )
    monkeypatch.setattr(served_networks, "AGENT_MANIFEST_FILE", str(manifest))
    monkeypatch.setattr(served_networks, "REGISTRY_DIR", str(registry))
    return registry


@pytest.mark.usefixtures("registry")
def test_lists_served_networks_by_the_name_the_ui_uses():
    """
    The UI knows a network as "generated/coffee", with no suffix, which is what the
    sidebar and /api/v1/list show. The lookup has to be keyed the same way or nothing
    the user clicks will match.
    """
    assert served_networks.served_network_files() == {
        "top_level": "top_level.hocon",
        "generated/coffee": "generated/coffee.hocon",
    }


@pytest.mark.usefixtures("registry")
@pytest.mark.parametrize("name", ["top_level", "generated/coffee", "generated/coffee.hocon"])
def test_resolves_a_served_network(name: str, registry: Path):
    """The suffix is optional, since some callers hold the file name and some the network name."""
    resolved = served_networks.resolve_served_network(name)

    assert resolved is not None
    assert Path(resolved).is_file()
    assert Path(resolved).is_relative_to(registry)


@pytest.mark.usefixtures("registry")
@pytest.mark.parametrize(
    "name",
    [
        "../secret",
        "generated/../../secret",
        "/etc/passwd",
        "switched_off",
        "never_existed",
        "",
    ],
    ids=["climbs out", "climbs out via a subdirectory", "absolute", "not served", "absent", "empty"],
)
def test_refuses_everything_that_is_not_a_served_name(name: str):
    """
    All six fail for the same reason, which is the point of doing it this way: none of
    them is a key in the manifest, so there is no path to build and nothing to check
    afterwards. Note "switched_off" really is on disk, so this is not just about files
    existing.
    """
    assert served_networks.resolve_served_network(name) is None


def test_reports_nothing_rather_than_raising_when_there_is_no_manifest(monkeypatch, tmp_path: Path):
    """
    A missing manifest means the server has nothing to serve, which is a legitimate
    state during startup and in a misconfigured deployment. Callers turn the empty
    answer into a 404; raising here would turn it into a 500.
    """
    monkeypatch.setattr(served_networks, "AGENT_MANIFEST_FILE", str(tmp_path / "absent.hocon"))

    assert served_networks.served_network_files() == {}
    assert served_networks.resolve_served_network("anything") is None


def test_reports_nothing_rather_than_raising_when_the_manifest_is_unparseable(monkeypatch, tmp_path: Path):
    """neuro-san re-wraps HOCON parse errors, and a broken manifest is still not a 500."""
    manifest = tmp_path / "manifest.hocon"
    manifest.write_text("{ this is not hocon", encoding="utf-8")
    monkeypatch.setattr(served_networks, "AGENT_MANIFEST_FILE", str(manifest))

    assert served_networks.served_network_files() == {}


@pytest.mark.usefixtures("registry")
def test_picks_up_a_network_added_after_the_first_read(registry: Path):
    """
    Generating a network appends to the manifest while the server is running, so the
    lookup must not be cached. Without this the Editor could not open a network the user
    had just made until the process restarted.
    """
    assert served_networks.resolve_served_network("generated/fresh") is None

    (registry / "generated" / "fresh.hocon").write_text(NETWORK, encoding="utf-8")
    manifest = registry / "manifest.hocon"
    manifest.write_text(
        manifest.read_text(encoding="utf-8").replace("}", ' "generated/fresh.hocon": true\n}'),
        encoding="utf-8",
    )

    resolved = served_networks.resolve_served_network("generated/fresh")
    assert resolved is not None and os.path.isfile(resolved)
