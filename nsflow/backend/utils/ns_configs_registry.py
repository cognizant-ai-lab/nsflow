
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
from typing import Optional
from nsflow.backend.utils.ns_config_store import NsConfigStore


class NsConfigsRegistry:
    """
    Temporary simplified registry for a single NsConfigStore.
    This supports only one active config at a time.
    """

    _current_config: Optional[NsConfigStore] = None

    @classmethod
    def set_current(cls, host: str, port: int) -> NsConfigStore:
        """
        Set the current NsConfigStore instance.
        This will replace any existing instance.
        """
        cls._current_config = NsConfigStore(host, port)
        return cls._current_config

    @classmethod
    def get_current(cls) -> NsConfigStore:
        """
        Get the current NsConfigStore instance.
        Raises RuntimeError if no instance is set.
        """
        if cls._current_config is None:
            raise RuntimeError("No active NsConfigStore has been set.")
        return cls._current_config

    @classmethod
    def reset(cls):
        """
        Reset the current NsConfigStore instance.
        This will remove the reference to the current instance.
        """
        cls._current_config = None
