# Copyright © 2025-2026 Cognizant Technology Solutions Corp, www.cognizant.com.
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

from pathlib import Path

import pytest

from nsflow.backend.utils.network_consultant_fixtures import FixtureNotFoundError
from nsflow.backend.utils.network_consultant_fixtures import FixtureRepository
from nsflow.backend.utils.network_consultant_fixtures import InvalidNetworkNameError


def valid_fixture(agent: str = "basic/coffee") -> dict:
    return {
        "agent": agent,
        "success_ratio": "1/1",
        "connections": ["direct"],
        "interactions": [
            {
                "text": "Find coffee",
                "timeout_in_seconds": 30,
                "response": {"text": {"gist": ["Names a coffee shop"]}},
                "sly_data": {},
            }
        ],
    }


def test_save_list_rename_and_delete_are_confined_to_fixture_root(tmp_path: Path):
    repository = FixtureRepository(str(tmp_path))

    first_name = repository.save("basic/coffee", "first", valid_fixture())
    assert first_name == "first.hocon"
    assert [fixture.name for fixture in repository.list("basic/coffee")] == ["first.hocon"]

    second_name = repository.save(
        "basic/coffee",
        "second",
        valid_fixture(),
        original_fixture_name="first.hocon",
    )
    assert second_name == "second.hocon"
    assert [fixture.name for fixture in repository.list("basic/coffee")] == ["second.hocon"]

    assert repository.delete("basic/coffee", "second") == "second.hocon"
    with pytest.raises(FixtureNotFoundError):
        repository.delete("basic/coffee", "second")


@pytest.mark.parametrize("network_name", ["../outside", "basic/../../../outside", "/tmp/outside"])
def test_network_path_traversal_is_rejected(tmp_path: Path, network_name: str):
    repository = FixtureRepository(str(tmp_path))

    with pytest.raises(InvalidNetworkNameError):
        repository.list(network_name)


def test_sly_data_keys_are_discovered_from_referenced_tools(tmp_path: Path):
    registry = tmp_path / "registries" / "basic"
    registry.mkdir(parents=True)
    (registry / "coffee.hocon").write_text('class = "tools.TimeTool"', encoding="utf-8")
    tool = tmp_path / "coded_tools" / "basic" / "coffee" / "tools.py"
    tool.parent.mkdir(parents=True)
    tool.write_text('sly_data.get("time")\nsly_data["timezone"]', encoding="utf-8")

    repository = FixtureRepository(str(tmp_path))

    assert repository.sly_data_keys("basic/coffee") == ["time", "timezone"]
