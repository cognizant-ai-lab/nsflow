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

"""Persistence and source inspection for Network Consultant fixtures."""

from __future__ import annotations

import glob
import json
import os
import re
import tempfile
from pathlib import Path
from typing import Any
from typing import Optional

from pyhocon import ConfigFactory

from nsflow.backend.models.network_consultant_models import Fixture
from nsflow.backend.models.network_consultant_models import FixtureInteraction

STOCK_TEST_KEYS = frozenset(
    {
        "gist",
        "not_gist",
        "keywords",
        "not_keywords",
        "value",
        "not_value",
        "less",
        "not_less",
        "greater",
        "not_greater",
    }
)

FIXTURE_REFERENCE_COMMENT = (
    "# This file defines everything necessary for a data-driven test.\n"
    "# The schema specifications for this file are documented here:\n"
    "# https://github.com/cognizant-ai-lab/neuro-san/blob/main/docs/test_case_hocon_reference.md\n"
)

SUCCESS_RATIO_PATTERN = re.compile(r"^\d+/\d+$")
CLASS_REFERENCE_PATTERN = re.compile(r'(?:(?:"class"\s*:)|(?:class\s*=))\s*"([^"]+)"')
SLY_DATA_GET_PATTERN = re.compile(r"sly_data\.get\(\s*[\"']([^\"']+)[\"']")
SLY_DATA_ITEM_PATTERN = re.compile(r"sly_data\[\s*[\"']([^\"']+)[\"']\s*\]")


class InvalidNetworkNameError(ValueError):
    """Raised when a network name would escape its configured root."""


class FixtureNotFoundError(FileNotFoundError):
    """Raised when a requested fixture does not exist."""


def network_hocon_file(network_name: str) -> str:
    """Return a network registry name with its HOCON suffix."""
    return network_name if network_name.endswith(".hocon") else f"{network_name}.hocon"


def safe_fixture_file_name(fixture_name: str) -> str:
    """Return a fixture basename that cannot contain a path separator."""
    suffixed_name = fixture_name if fixture_name.endswith(".hocon") else f"{fixture_name}.hocon"
    return re.sub(r"[^\w.\-]", "_", suffixed_name)


def validate_fixture(fixture: dict[str, Any]) -> list[str]:
    """Validate the editable portion of a fixture before it reaches disk."""
    errors: list[str] = []
    if not isinstance(fixture.get("agent"), str) or not fixture["agent"].strip():
        errors.append("'agent' must be a non-empty string.")

    success_ratio = fixture.get("success_ratio")
    if not isinstance(success_ratio, str) or not SUCCESS_RATIO_PATTERN.fullmatch(success_ratio):
        errors.append("'success_ratio' must be a string in 'N/M' format, e.g. '1/1'.")

    interactions = fixture.get("interactions")
    if not isinstance(interactions, list) or not interactions:
        errors.append("'interactions' must be a non-empty list.")
        return errors

    for index, interaction in enumerate(interactions):
        prefix = f"interactions[{index}]"
        if not isinstance(interaction, dict) or not str(interaction.get("text", "")).strip():
            errors.append(f"{prefix}: 'text' is required.")
            continue
        response = interaction.get("response") or {}
        checks = response.get("text") if isinstance(response, dict) else None
        if not isinstance(checks, dict) or not checks:
            errors.append(f"{prefix}: at least one response check is required.")
            continue
        for key in checks:
            if key not in STOCK_TEST_KEYS:
                errors.append(f"{prefix}: '{key}' is not a valid check type.")
    return errors


class FixtureRepository:
    """Read and write consultant fixtures beneath one target project."""

    def __init__(self, project_root: str):
        self.project_root = Path(project_root).resolve()

    def list(self, network_name: str) -> list[Fixture]:
        """Return every fixture for a network, preserving malformed files for inspection."""
        fixtures: list[Fixture] = []
        for path in sorted(glob.glob(str(self._fixtures_directory(network_name) / "*.hocon"))):
            fixtures.append(self._load_fixture(Path(path)))
        return fixtures

    def save(
        self,
        network_name: str,
        fixture_name: str,
        fixture: dict[str, Any],
        original_fixture_name: Optional[str] = None,
    ) -> str:
        """Atomically create or replace a fixture and return its safe filename."""
        errors = validate_fixture(fixture)
        if errors:
            raise ValueError(errors)

        fixture_directory = self._fixtures_directory(network_name)
        fixture_directory.mkdir(parents=True, exist_ok=True)
        safe_name = safe_fixture_file_name(fixture_name)
        output_path = fixture_directory / safe_name
        content = f"{FIXTURE_REFERENCE_COMMENT}\n{json.dumps(fixture, indent=4, ensure_ascii=False)}\n"

        descriptor, temporary_path = tempfile.mkstemp(dir=fixture_directory)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as temporary_file:
                temporary_file.write(content)
            os.replace(temporary_path, output_path)
        except OSError:
            if os.path.exists(temporary_path):
                os.remove(temporary_path)
            raise

        self._remove_renamed_fixture(fixture_directory, original_fixture_name, safe_name)
        return safe_name

    def delete(self, network_name: str, fixture_name: str) -> str:
        """Delete a fixture and return its safe filename."""
        safe_name = safe_fixture_file_name(fixture_name)
        path = self._fixtures_directory(network_name) / safe_name
        if not path.is_file():
            raise FixtureNotFoundError(safe_name)
        path.unlink()
        return safe_name

    def sly_data_keys(self, network_name: str) -> list[str]:
        """Find literal sly_data keys referenced by a network's coded tools."""
        hocon_path = self._registry_path(network_name)
        if not hocon_path.is_file():
            return []

        hocon_text = hocon_path.read_text(encoding="utf-8")
        keys: set[str] = set()
        for class_reference in CLASS_REFERENCE_PATTERN.findall(hocon_text):
            class_file = self._resolve_class_file(class_reference, network_name)
            if class_file:
                keys.update(self._sly_data_keys_from_file(class_file))
        return sorted(keys)

    def _fixtures_directory(self, network_name: str) -> Path:
        root = self.project_root / "tests" / "fixtures"
        return self._contained_path(root, network_name)

    def _registry_path(self, network_name: str) -> Path:
        root = self.project_root / "registries"
        return self._contained_path(root, network_hocon_file(network_name))

    @staticmethod
    def _contained_path(root: Path, relative_path: str) -> Path:
        resolved_root = root.resolve()
        resolved_path = (resolved_root / relative_path).resolve()
        if resolved_path != resolved_root and resolved_root not in resolved_path.parents:
            raise InvalidNetworkNameError(relative_path)
        return resolved_path

    @staticmethod
    def _load_fixture(path: Path) -> Fixture:
        raw_hocon = path.read_text(encoding="utf-8")
        try:
            parsed = ConfigFactory.parse_file(str(path)).as_plain_ordered_dict()
            interactions = [
                FixtureInteraction(
                    text=turn.get("text", ""),
                    timeout_in_seconds=turn.get("timeout_in_seconds"),
                    response_checks=(turn.get("response") or {}).get("text") or {},
                    sly_data=turn.get("sly_data") or {},
                )
                for turn in parsed.get("interactions", [])
            ]
            return Fixture(
                name=path.name,
                agent=parsed.get("agent"),
                success_ratio=parsed.get("success_ratio"),
                connections=parsed.get("connections", []),
                interactions=interactions,
                raw_hocon=raw_hocon,
            )
        except Exception as error:  # pylint: disable=broad-exception-caught
            return Fixture(name=path.name, raw_hocon=raw_hocon, parse_error=str(error))

    def _resolve_class_file(self, class_reference: str, network_name: str) -> Optional[Path]:
        parts = class_reference.replace("\\", "/").split(".")
        if len(parts) < 2 or any(part in {"", ".", ".."} for part in parts):
            return None

        module_parts = parts[:-1]
        coded_tools_root = (self.project_root / "coded_tools").resolve()
        if class_reference.startswith("coded_tools."):
            candidates = [self.project_root.joinpath(*module_parts).with_suffix(".py")]
        else:
            candidates = [
                coded_tools_root.joinpath(*network_name.split("/"), *module_parts).with_suffix(".py"),
                coded_tools_root.joinpath(*module_parts).with_suffix(".py"),
            ]

        for candidate in candidates:
            resolved = candidate.resolve()
            if coded_tools_root in resolved.parents and resolved.is_file():
                return resolved
        return None

    @staticmethod
    def _sly_data_keys_from_file(path: Path) -> set[str]:
        try:
            source = path.read_text(encoding="utf-8")
        except OSError:
            return set()
        return set(SLY_DATA_GET_PATTERN.findall(source)) | set(SLY_DATA_ITEM_PATTERN.findall(source))

    @staticmethod
    def _remove_renamed_fixture(
        fixture_directory: Path,
        original_fixture_name: Optional[str],
        current_safe_name: str,
    ) -> None:
        if not original_fixture_name:
            return
        original_safe_name = safe_fixture_file_name(original_fixture_name)
        original_path = fixture_directory / original_safe_name
        if original_safe_name != current_safe_name and original_path.is_file():
            original_path.unlink()
