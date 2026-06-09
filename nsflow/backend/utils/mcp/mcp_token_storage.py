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
"""
On-disk persistence for MCP OAuth credentials.

nsflow behaves like a desktop app, so - like Claude Desktop / Claude Code - we
persist the OAuth tokens (including the refresh token) and the dynamically
registered client so connections survive a backend restart and tokens can be
refreshed silently.

This module implements the MCP SDK ``TokenStorage`` protocol
(``mcp.client.auth.TokenStorage``) backed by a single JSON file. One
``FileTokenStorage`` instance is created per MCP server URL (that is how the SDK
uses it); all instances read/write their own slice of the shared file.
"""

import asyncio
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from mcp.shared.auth import OAuthClientInformationFull, OAuthToken

logger = logging.getLogger(__name__)


def _default_storage_dir() -> Path:
    """
    Resolve the directory used to persist MCP OAuth credentials.

    Honors the ``NSFLOW_MCP_STORAGE_DIR`` override, otherwise defaults to
    ``~/.nsflow/mcp_oauth`` which is consistent with desktop-app expectations
    and keeps secrets out of the source tree.
    """
    override = os.getenv("NSFLOW_MCP_STORAGE_DIR")
    if override:
        return Path(override).expanduser()
    return Path.home() / ".nsflow" / "mcp_oauth"


class FileTokenStorage:
    """
    File-backed implementation of the MCP SDK ``TokenStorage`` protocol.

    The on-disk format is a single JSON object keyed by MCP server URL::

        {
            "https://mcp.example.com/mcp": {
                "tokens": { ...OAuthToken.model_dump()... },
                "client_info": { ...OAuthClientInformationFull.model_dump()... },
                "obtained_at": 1733659200,
                "expires_at": 1733662800
            }
        }

    ``expires_at`` is computed and stored by us because ``OAuthToken`` only
    carries the relative ``expires_in`` and loses the wall-clock anchor across
    restarts.
    """

    # Guards the shared file against concurrent read-modify-write within this
    # process. nsflow runs single-worker, so a process-wide asyncio lock is
    # sufficient (a multi-worker deployment would additionally need an OS file
    # lock such as fcntl.flock).
    _lock = asyncio.Lock()

    def __init__(self, server_url: str, storage_dir: Optional[Path] = None):
        self.server_url = server_url
        self._dir = storage_dir or _default_storage_dir()
        self._path = self._dir / "tokens.json"

    # ------------------------------------------------------------------ #
    # TokenStorage protocol
    # ------------------------------------------------------------------ #

    async def get_tokens(self) -> Optional[OAuthToken]:
        entry = self._read_entry(self.server_url)
        raw = entry.get("tokens") if entry else None
        if not raw:
            return None
        return OAuthToken.model_validate(raw)

    async def set_tokens(self, tokens: OAuthToken) -> None:
        async with self._lock:
            blob = self._load_file()
            entry = blob.setdefault(self.server_url, {})
            entry["tokens"] = tokens.model_dump(mode="json")
            entry["obtained_at"] = int(time.time())
            if tokens.expires_in is not None:
                entry["expires_at"] = entry["obtained_at"] + int(tokens.expires_in)
            else:
                entry.pop("expires_at", None)
            self._write_file(blob)

    async def get_client_info(self) -> Optional[OAuthClientInformationFull]:
        entry = self._read_entry(self.server_url)
        raw = entry.get("client_info") if entry else None
        if not raw:
            return None
        return OAuthClientInformationFull.model_validate(raw)

    async def set_client_info(self, client_info: OAuthClientInformationFull) -> None:
        async with self._lock:
            blob = self._load_file()
            entry = blob.setdefault(self.server_url, {})
            entry["client_info"] = client_info.model_dump(mode="json")
            self._write_file(blob)

    # ------------------------------------------------------------------ #
    # Housekeeping helpers (used by the OAuth endpoints, not the protocol)
    # ------------------------------------------------------------------ #

    @classmethod
    def list_connections(cls, storage_dir: Optional[Path] = None) -> List[Dict[str, Any]]:
        """
        Return non-secret metadata for every stored MCP connection that has a
        usable access token. Entries holding only a pre-seeded client_info (no
        token yet) are not real connections and are skipped.
        """
        path = (storage_dir or _default_storage_dir()) / "tokens.json"
        blob = cls._load_path(path)
        connections: List[Dict[str, Any]] = []
        for server_url, entry in blob.items():
            tokens = entry.get("tokens", {}) or {}
            if not tokens.get("access_token"):
                continue
            connections.append(
                {
                    "server_url": server_url,
                    "obtained_at": entry.get("obtained_at"),
                    "expires_at": entry.get("expires_at"),
                    "has_refresh_token": bool(tokens.get("refresh_token")),
                }
            )
        return connections

    @classmethod
    def remove(cls, server_url: str, storage_dir: Optional[Path] = None) -> bool:
        """Delete the stored credentials for a server. Returns True if removed."""
        path = (storage_dir or _default_storage_dir()) / "tokens.json"
        blob = cls._load_path(path)
        if server_url not in blob:
            return False
        del blob[server_url]
        cls._write_path(path, blob)
        return True

    @classmethod
    def has_connection(cls, server_url: str, storage_dir: Optional[Path] = None) -> bool:
        """True only if a usable access token is stored (ignores pre-seeded client_info)."""
        path = (storage_dir or _default_storage_dir()) / "tokens.json"
        entry = cls._load_path(path).get(server_url, {})
        return bool((entry.get("tokens", {}) or {}).get("access_token"))

    def get_metadata(self) -> Dict[str, Any]:
        """Return this server's stored entry (tokens, client_info, obtained_at, expires_at)."""
        return self._read_entry(self.server_url)

    # ------------------------------------------------------------------ #
    # Low level file I/O
    # ------------------------------------------------------------------ #

    def _read_entry(self, server_url: str) -> Dict[str, Any]:
        return self._load_file().get(server_url, {})

    def _load_file(self) -> Dict[str, Any]:
        return self._load_path(self._path)

    def _write_file(self, blob: Dict[str, Any]) -> None:
        self._write_path(self._path, blob)

    @staticmethod
    def _load_path(path: Path) -> Dict[str, Any]:
        import json

        if not path.exists():
            return {}
        try:
            with open(path, "r", encoding="utf-8") as handle:
                data = json.load(handle)
            return data if isinstance(data, dict) else {}
        except (OSError, ValueError) as exc:
            logger.warning("Could not read MCP token store at %s: %s", path, exc)
            return {}

    @staticmethod
    def _write_path(path: Path, blob: Dict[str, Any]) -> None:
        import json

        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        tmp_path = path.with_suffix(path.suffix + ".tmp")
        # Create the temp file with 0600 perms so secrets are never briefly
        # world-readable. os.open honors the mode only on creation.
        fd = os.open(str(tmp_path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(blob, handle, indent=2)
        except BaseException:
            tmp_path.unlink(missing_ok=True)
            raise
        os.replace(str(tmp_path), str(path))
        try:
            os.chmod(str(path), 0o600)
        except OSError:
            # Best effort (e.g. on Windows); not fatal.
            pass
