
# Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
# All Rights Reserved.
# Issued under the Academic Public License.
#
# You can be released from the terms, and requirements of the Academic Public
# License by purchasing a commercial license.
# Purchase of a commercial license is mandatory for any use of the
# nsflow SDK Software in commercial settings.
#
# END COPYRIGHT

import re
import pytest
from unittest.mock import patch, MagicMock
from nsflow.backend.main import app
import pkg_resources
from fastapi.testclient import TestClient

client = TestClient(app)


@pytest.mark.parametrize("package_name, mock_version, expected_version", [
    ("existing_package", "1.2.3", "1.2.3"),
    ("nsflow", "dynamic-dev-version", "auto"),  # Use "auto" as a sentinel
    ("unknown_package", None, "not found"),
])
def test_get_version(package_name, mock_version, expected_version):
    """Test get_version function logic directly"""
    with patch("pkg_resources.get_distribution") as mock_get_dist:
        if mock_version is not None:
            mock_dist = MagicMock()
            mock_dist.version = mock_version
            mock_get_dist.return_value = mock_dist
        else:
            mock_get_dist.side_effect = pkg_resources.DistributionNotFound("mocked_package", "mocked_requirement")

        from nsflow.backend.api.v1.version_info import get_version
        version_out = get_version(package_name)

        if expected_version == "auto":
            assert isinstance(version_out, str)
            assert len(version_out) > 0
        else:
            assert version_out == expected_version


def test_fetch_version_existing_package():
    """Test FastAPI endpoint for a package that exists"""
    with patch("pkg_resources.get_distribution") as mock_get_dist:
        mock_dist = MagicMock()
        mock_dist.version = "1.2.3"
        mock_get_dist.return_value = mock_dist

        response = client.get("/api/v1/version/existing_package")
        assert response.status_code == 200
        assert response.json() == {"version": "1.2.3"}


def test_fetch_version_nsflow_dev_format():
    """Test nsflow returns a dev version string without hardcoding exact version"""
    with patch("pkg_resources.get_distribution") as mock_get_dist:
        # Simulate dev version from setuptools-scm
        dev_version = "0.5.11.dev15+g2710d05.d20250511"
        mock_dist = MagicMock()
        mock_dist.version = dev_version
        mock_get_dist.return_value = mock_dist

        response = client.get("/api/v1/version/nsflow")
        assert response.status_code == 200

        returned_version = response.json()["version"]
        assert isinstance(returned_version, str)
        assert len(returned_version) > 0
        # Optionally match against a dev version pattern
        assert re.match(r"\d+\.\d+\.\w+", returned_version)


def test_fetch_version_nsflow_not_installed():
    """Test FastAPI endpoint when nsflow is not installed at all"""
    with patch("pkg_resources.get_distribution", side_effect=pkg_resources.DistributionNotFound("mocked_package", "mocked_requirement")):
        response = client.get("/api/v1/version/nsflow")
        assert response.status_code == 200
        assert response.json() == {"version": "dev.version"}


def test_fetch_version_unknown_package():
    """Test FastAPI endpoint when an unknown package is not installed"""
    with patch("pkg_resources.get_distribution", side_effect=pkg_resources.DistributionNotFound("mocked_package", "mocked_requirement")):
        response = client.get("/api/v1/version/unknown_package")
        assert response.status_code == 200
        assert response.json() == {"version": "not found"}
