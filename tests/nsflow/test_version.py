# Copyright © 2025 Cognizant Technology Solutions Corp, www.cognizant.com.
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

from importlib.metadata import PackageNotFoundError

import pytest
from fastapi.testclient import TestClient

from nsflow.backend.main import app
from nsflow.backend.utils import version as version_module
from nsflow.backend.utils.version import nsflow_version
from nsflow.backend.utils.version import resolve_version

client = TestClient(app)


class TestResolveVersion:
    """Resolving (version, source) for nsflow, independent of install state."""

    @staticmethod
    def _uninstalled(monkeypatch: pytest.MonkeyPatch) -> None:
        """Make the distribution-metadata lookup behave as not-installed."""

        def boom(_name: str) -> str:
            raise PackageNotFoundError("nsflow")

        monkeypatch.setattr(version_module, "library_version", boom)

    def test_env_var_override_takes_precedence(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """If NSFLOW_VERSION is set in environment and not 'unknown', it takes precedence."""
        monkeypatch.setenv("NSFLOW_VERSION", "2.3.4")
        monkeypatch.setattr(version_module, "library_version", lambda _name: "1.2.3")
        assert resolve_version() == ("2.3.4", version_module.SOURCE_ENV)

    def test_installed_distribution_reports_installed_source(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Distribution metadata gives the version tagged as 'installed'."""
        monkeypatch.delenv("NSFLOW_VERSION", raising=False)
        monkeypatch.setattr(version_module, "library_version", lambda _name: "1.2.3")
        assert resolve_version() == ("1.2.3", version_module.SOURCE_INSTALLED)

    def test_resolves_the_nsflow_distribution_name(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """The resolver looks up the published distribution name."""
        monkeypatch.delenv("NSFLOW_VERSION", raising=False)
        seen: dict = {}

        def fake_version(name: str) -> str:
            seen["name"] = name
            return "9.9.9"

        monkeypatch.setattr(version_module, "library_version", fake_version)
        resolve_version()
        assert seen["name"] == "nsflow"

    def test_scm_fallback_reports_source(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """An uninstalled checkout resolves via setuptools-scm, tagged 'source'."""
        monkeypatch.delenv("NSFLOW_VERSION", raising=False)
        self._uninstalled(monkeypatch)
        monkeypatch.setattr(version_module, "_scm_version", lambda: "0.0.0.dev1+gabc1234")
        assert resolve_version() == ("0.0.0.dev1+gabc1234", version_module.SOURCE_SCM)

    def test_git_fallback_reports_git_source(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """With no distribution and no scm, the short git sha is used, tagged 'git'."""
        monkeypatch.delenv("NSFLOW_VERSION", raising=False)
        self._uninstalled(monkeypatch)
        monkeypatch.setattr(version_module, "_scm_version", lambda: "")
        monkeypatch.setattr(version_module, "_git_sha", lambda: "abc1234")
        assert resolve_version() == ("abc1234", version_module.SOURCE_GIT)

    def test_unknown_when_nothing_resolves(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """No distribution, no scm, and no git sha surfaces ('unknown', 'unknown')."""
        monkeypatch.delenv("NSFLOW_VERSION", raising=False)
        self._uninstalled(monkeypatch)
        monkeypatch.setattr(version_module, "_scm_version", lambda: "")
        monkeypatch.setattr(version_module, "_git_sha", lambda: "")
        assert resolve_version() == ("unknown", version_module.SOURCE_UNKNOWN)

    def test_nsflow_version_returns_bare_string(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """nsflow_version() drops the source tag, returning just the version string."""
        monkeypatch.delenv("NSFLOW_VERSION", raising=False)
        monkeypatch.setattr(version_module, "library_version", lambda _name: "1.2.3")
        assert nsflow_version() == "1.2.3"


class TestVersionEndpoint:
    """The /api/v1/version endpoint surfaces the resolved version."""

    def test_fetch_version_nsflow_matches_resolver(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """The nsflow version endpoint returns whatever the resolver reports."""
        monkeypatch.delenv("NSFLOW_VERSION", raising=False)
        monkeypatch.setattr(version_module, "library_version", lambda _name: "7.8.9")
        response = client.get("/api/v1/version/nsflow")
        assert response.status_code == 200
        assert response.json()["version"] == "7.8.9"

    def test_fetch_version_never_500s_when_uninstalled(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Even with no distribution metadata, the endpoint resolves without raising."""
        monkeypatch.delenv("NSFLOW_VERSION", raising=False)

        def boom(_name: str) -> str:
            raise PackageNotFoundError("nsflow")

        monkeypatch.setattr(version_module, "library_version", boom)
        monkeypatch.setattr(version_module, "_scm_version", lambda: "")
        monkeypatch.setattr(version_module, "_git_sha", lambda: "deadbee")
        response = client.get("/api/v1/version/nsflow")
        assert response.status_code == 200
        assert response.json()["version"] == "deadbee"
