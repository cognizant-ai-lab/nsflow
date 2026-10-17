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

import json
import os
import unittest
from unittest.mock import patch

from nsflow.backend.api.v1.app_configs import get_runtime_config


class TestNetworkConsultantConfiguration(unittest.TestCase):
    """Verify the Network Consultant runtime feature flag."""

    def test_enabled_by_default(self) -> None:
        """Expose Network Consultant when no override is configured."""
        with patch.dict(os.environ, {}, clear=True):
            config = json.loads(get_runtime_config().body)

        self.assertTrue(config.get("NSFLOW_PLUGIN_NETWORK_CONSULTANT"))

    def test_can_be_disabled(self) -> None:
        """Honor an explicit opt-out."""
        with patch.dict(os.environ, {"NSFLOW_PLUGIN_NETWORK_CONSULTANT": "false"}, clear=True):
            config = json.loads(get_runtime_config().body)

        self.assertFalse(config.get("NSFLOW_PLUGIN_NETWORK_CONSULTANT"))
