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
import logging
from typing import Dict, Optional

from nsflow.backend.utils.tools.ns_config import NsConfig


class NsConfigsRegistry:
    """
    Registry for managing multiple NsConfig instances keyed by unique URL.
    """

    _configs: Dict[str, NsConfig] = {}
    _current_config_id: Optional[str] = None

    @classmethod
    def build_config_id(cls, connection_type: str, host: str, port: int) -> str:
        """Build a unique id per connectivity-host-port"""
        return f"{connection_type}://{host}:{port}"

    @classmethod
    def get_or_create(cls, connection_type: str, host: str, port: int) -> NsConfig:
        """Get or create configs based on connectivity-host-port"""
        config_id = cls.build_config_id(connection_type, host, port)
        if config_id not in cls._configs:
            cls._configs[config_id] = NsConfig(host, port, connection_type)
        cls._current_config_id = config_id  # optional: also set as current
        logging.info("NeuroSan Server connectivity initialized with %s", config_id)
        return cls._configs[config_id]

    @classmethod
    def get(cls, connection_type: str, host: str, port: int) -> Optional[NsConfig]:
        """Get an existing config"""
        config_id = cls.build_config_id(connection_type, host, port)
        return cls._configs.get(config_id)

    @classmethod
    def get_by_id(cls, config_id: str) -> Optional[NsConfig]:
        """Get an existing config by its unique id which is the url"""
        return cls._configs.get(config_id)

    @classmethod
    def get_current(cls) -> NsConfig:
        """Get the current config id"""
        # This might not be required in future once we start using the get_or_create method
        if cls._current_config_id is None:
            raise RuntimeError("No current config is set.")
        return cls._configs[cls._current_config_id]

    @classmethod
    def set_current(cls, connection_type: str, host: str, port: int) -> NsConfig:
        """Set current connectivity"""
        # This might not be required in future once we start using the get_or_create method
        config_id = cls.build_config_id(connection_type, host, port)
        if config_id not in cls._configs:
            cls._configs[config_id] = NsConfig(host, port, connection_type)
        cls._current_config_id = config_id
        return cls._configs[config_id]

    @classmethod
    def reset(cls):
        """Reset all available configs"""
        cls._configs.clear()
        cls._current_config_id = None
