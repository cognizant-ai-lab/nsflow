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

"""Tests for Network Consultant service initialization."""

import asyncio
import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from nsflow.backend.api.v1.network_consultant_endpoints import NetworkConsultantEndpoints


class TestNetworkConsultantLifecycle(unittest.TestCase):
    """Verify configuration is read during application startup."""

    def test_initialize_uses_current_environment(self) -> None:
        """Read the repository path when services initialize, not when their module imports."""
        with TemporaryDirectory() as directory:
            with patch.dict(os.environ, {"NSFLOW_NETWORK_CONSULTANT_REPO": directory}):
                NetworkConsultantEndpoints.initialize()

            self.assertEqual(NetworkConsultantEndpoints.fixture_repository().project_root, Path(directory).resolve())

        asyncio.run(NetworkConsultantEndpoints.shutdown())
