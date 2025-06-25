
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

from importlib.metadata import version as actual_version
from fastapi.testclient import TestClient
from nsflow.backend.main import app

client = TestClient(app)


def test_fetch_version_nsflow_matches_actual():
    """Ensure the version returned from the endpoint matches importlib metadata"""
    expected = actual_version("nsflow")
    response = client.get("/api/v1/version/nsflow")

    assert response.status_code == 200
    returned_version = response.json()["version"]
    assert returned_version == expected
