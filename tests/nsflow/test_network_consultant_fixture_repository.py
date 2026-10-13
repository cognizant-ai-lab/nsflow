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

"""Tests for Network Consultant fixture persistence."""

from pathlib import Path
from typing import Any

import pytest

from nsflow.backend.utils.fixture_not_found_error import FixtureNotFoundError
from nsflow.backend.utils.fixture_repository import FixtureRepository
from nsflow.backend.utils.fixture_save_context import FixtureSaveContext
from nsflow.backend.utils.invalid_network_name_error import InvalidNetworkNameError


class TestNetworkConsultantFixtureRepository:
    """Verify fixture persistence remains contained within the target project."""

    @staticmethod
    def valid_fixture(agent: str = "basic/coffee") -> dict[str, Any]:
        """Return a valid editable fixture."""
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

    @staticmethod
    def test_save_list_rename_and_delete_are_confined_to_fixture_root(tmp_path: Path) -> None:
        """Create, rename, list, and delete fixtures beneath their network directory."""
        repository = FixtureRepository(str(tmp_path))

        first_name = repository.save("basic/coffee", "first", TestNetworkConsultantFixtureRepository.valid_fixture())
        assert first_name == "first.hocon"
        assert [fixture.name for fixture in repository.list("basic/coffee")] == ["first.hocon"]

        second_name = repository.save(
            "basic/coffee",
            "second",
            TestNetworkConsultantFixtureRepository.valid_fixture(),
            FixtureSaveContext(original_fixture_name="first.hocon"),
        )
        assert second_name == "second.hocon"
        assert [fixture.name for fixture in repository.list("basic/coffee")] == ["second.hocon"]

        assert repository.delete("basic/coffee", "second") == "second.hocon"
        with pytest.raises(FixtureNotFoundError):
            repository.delete("basic/coffee", "second")

    @staticmethod
    @pytest.mark.parametrize("network_name", ["../outside", "basic/../../../outside", "/tmp/outside"])
    def test_network_path_traversal_is_rejected(tmp_path: Path, network_name: str) -> None:
        """Reject relative and absolute paths that escape the fixture root."""
        repository = FixtureRepository(str(tmp_path))

        with pytest.raises(InvalidNetworkNameError):
            repository.list(network_name)

    @staticmethod
    def test_sly_data_keys_are_discovered_from_referenced_tools(tmp_path: Path) -> None:
        """Discover literal sly-data access in referenced coded tools."""
        registry = tmp_path / "registries" / "basic"
        registry.mkdir(parents=True)
        (registry / "coffee.hocon").write_text('class = "tools.TimeTool"', encoding="utf-8")
        tool = tmp_path / "coded_tools" / "basic" / "coffee" / "tools.py"
        tool.parent.mkdir(parents=True)
        tool.write_text('sly_data.get("time")\nsly_data["timezone"]', encoding="utf-8")

        repository = FixtureRepository(str(tmp_path))

        assert repository.sly_data_keys("basic/coffee") == ["time", "timezone"]

    @staticmethod
    def test_malformed_fixture_is_preserved_for_inspection(tmp_path: Path) -> None:
        """Return malformed fixture source and its parse error instead of dropping the file."""
        fixture_directory = tmp_path / "tests" / "fixtures" / "basic" / "coffee"
        fixture_directory.mkdir(parents=True)
        (fixture_directory / "broken.hocon").write_text('{"agent": ', encoding="utf-8")

        fixtures = FixtureRepository(str(tmp_path)).list("basic/coffee")

        assert len(fixtures) == 1
        assert fixtures[0].name == "broken.hocon"
        assert fixtures[0].raw_hocon == '{"agent": '
        assert fixtures[0].parse_error

    @staticmethod
    def test_full_definition_and_leading_comments_survive_an_edit(tmp_path: Path) -> None:
        """Retain fixture fields outside the editor and the original license block."""
        repository = FixtureRepository(str(tmp_path))
        source = (
            "# Project license\n"
            "# Keep this notice\n\n"
            '{"agent": "basic/music",\n# Keep this fixture note\n"use_direct": true, "success_ratio": "1/1", '
            '"connections": ["direct"], "interactions": [{"text": "Recommend music", '
            '"timeout_in_seconds": 90, "continue_conversation": true, '
            '"response": {"structure": {"genre": {"value": "rock"}}}}]}'
        )
        fixture_directory = tmp_path / "tests" / "fixtures" / "basic" / "music"
        fixture_directory.mkdir(parents=True)
        (fixture_directory / "structure.hocon").write_text(source, encoding="utf-8")

        loaded = repository.list("basic/music")[0]
        definition = dict(loaded.definition)
        definition.update({"success_ratio": "2/2"})
        repository.save(
            "basic/music",
            "structure",
            definition,
            FixtureSaveContext("structure.hocon", loaded.raw_hocon),
        )
        saved = repository.list("basic/music")[0]

        assert saved.definition.get("use_direct") is True
        interaction = saved.definition.get("interactions", [])[0]
        assert interaction.get("timeout_in_seconds") == 90
        assert interaction.get("continue_conversation") is True
        assert interaction.get("response", {}).get("structure") == {"genre": {"value": "rock"}}
        assert saved.raw_hocon.startswith("# Project license\n# Keep this notice")
        assert "# Keep this fixture note" in saved.raw_hocon

    @staticmethod
    def test_non_utf8_fixture_does_not_break_listing(tmp_path: Path) -> None:
        """Return an unreadable fixture as an individual parse error."""
        fixture_directory = tmp_path / "tests" / "fixtures" / "basic" / "coffee"
        fixture_directory.mkdir(parents=True)
        (fixture_directory / "binary.hocon").write_bytes(b"\xff\xfe")

        fixture = FixtureRepository(str(tmp_path)).list("basic/coffee")[0]

        assert fixture.name == "binary.hocon"
        assert fixture.raw_hocon == ""
        assert fixture.parse_error
