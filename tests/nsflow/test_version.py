
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
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from nsflow.backend.main import app
import pkg_resources

client = TestClient(app)

@pytest.mark.parametrize("package_name, expected_version", [
    ("existing_package", "1.2.3"),  # Simulating an installed package
    ("nsflow", "dev.version"),  # Special case for nsflow
    ("unknown_package", "not found")  # Any other missing package
])
def test_get_version(package_name, expected_version):
    """Test get_version function for different scenarios"""
    with patch("pkg_resources.get_distribution") as mock_get_dist:
        if package_name == "existing_package":
            mock_dist = MagicMock()
            mock_dist.version = "1.2.3"
            mock_get_dist.return_value = mock_dist
        else:
            mock_get_dist.side_effect = pkg_resources.DistributionNotFound
        
        from nsflow.backend.api.v1.version_info import get_version  # Adjust path as per your structure
        assert get_version(package_name) == expected_version


def test_fetch_version_existing_package():
    """Test FastAPI endpoint for a package that exists"""
    with patch("pkg_resources.get_distribution") as mock_get_dist:
        mock_dist = MagicMock()
        mock_dist.version = "1.2.3"
        mock_get_dist.return_value = mock_dist
        
        response = client.get("/api/v1/version/existing_package")
        assert response.status_code == 200
        assert response.json() == {"version": "1.2.3"}


def test_fetch_version_nsflow():
    """Test FastAPI endpoint when 'nsflow' is not found"""
    with patch("pkg_resources.get_distribution", side_effect=pkg_resources.DistributionNotFound):
        response = client.get("/api/v1/version/nsflow")
        assert response.status_code == 200
        assert response.json() == {"version": "dev.version"}


def test_fetch_version_unknown_package():
    """Test FastAPI endpoint when an unknown package is not found"""
    with patch("pkg_resources.get_distribution", side_effect=pkg_resources.DistributionNotFound):
        response = client.get("/api/v1/version/unknown_package")
        assert response.status_code == 200
        assert response.json() == {"version": "not found"}
