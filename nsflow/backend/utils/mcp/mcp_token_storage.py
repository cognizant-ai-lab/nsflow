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
import contextlib
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from mcp.shared.auth import OAuthClientInformationFull, OAuthToken

try:
    import fcntl  # POSIX only
except ImportError:  # pragma: no cover - non-POSIX (e.g. Windows)
    fcntl = None

logger = logging.getLogger(__name__)

_warned_no_flock = False


@contextlib.contextmanager
def _interprocess_lock(lock_path: Path):
    """
    Hold a cross-process exclusive lock for the duration of a token-file
    read-modify-write.

    Uvicorn may run multiple workers (see nsflow/backend/main.py), so an
    in-process asyncio.Lock alone cannot prevent interleaved writes from
    different worker processes corrupting tokens.json or losing updates. This
    uses ``fcntl.flock`` where available and degrades to a no-op (with a one-time
    warning) on platforms without it (e.g. Windows), where deployments should run
    a single worker.

    The lock is held only around the brief load/modify/write, so blocking here is
    negligible.
    """
    lock_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if fcntl is None:
        global _warned_no_flock
        if not _warned_no_flock:
            logger.warning(
                "fcntl is unavailable on this platform; the MCP token store has no cross-process "
                "lock. Run a single backend worker if MCP OAuth connections are used."
            )
            _warned_no_flock = True
        yield
        return

    fd = os.open(str(lock_path), os.O_RDWR | os.O_CREAT, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        try:
            fcntl.flock(fd, fcntl.LOCK_UN)
        finally:
            os.close(fd)


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


def _coerce_timestamp(value: Any) -> Optional[float]:
    """
    Coerce a stored ``expires_at`` to a float, or None if absent/unparsable.

    The store may be hand-edited/corrupted, so a missing, wrong-typed, or
    non-numeric-string value must not raise when compared against time.time();
    treat anything we can't parse as "no known expiry".
    """
    if isinstance(value, bool):  # bool is an int subclass; not a real timestamp
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


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

    # Serializes read-modify-write within this process (across coroutines). A
    # cross-process fcntl lock (see _interprocess_lock) additionally guards
    # against interleaved writes from multiple uvicorn workers.
    _lock = asyncio.Lock()

    def __init__(self, server_url: str, storage_dir: Optional[Path] = None):
        self.server_url = server_url
        self._dir = storage_dir or _default_storage_dir()
        self._path = self._dir / "tokens.json"
        self._lock_path = self._dir / "tokens.json.lock"

    # ------------------------------------------------------------------ #
    # TokenStorage protocol
    # ------------------------------------------------------------------ #

    async def get_tokens(self) -> Optional[OAuthToken]:
        # Disk read offloaded to a worker thread so it never blocks the event loop.
        entry = await asyncio.to_thread(self._read_entry, self.server_url)
        raw = entry.get("tokens")
        if not isinstance(raw, dict):
            return None
        try:
            return OAuthToken.model_validate(raw)
        except Exception as exc:  # noqa: BLE001 - tolerate a corrupted/hand-edited store
            logger.warning("Ignoring unparsable stored MCP tokens for %s: %s", self.server_url, exc)
            return None

    async def set_tokens(self, tokens: OAuthToken) -> None:
        # asyncio.Lock serializes coroutines in-process; the blocking
        # read-modify-write (and the cross-process fcntl lock) runs in a thread.
        async with self._lock:
            await asyncio.to_thread(self._sync_set_tokens, tokens)

    def _sync_set_tokens(self, tokens: OAuthToken) -> None:
        with _interprocess_lock(self._lock_path):
            blob = self._load_file()
            entry = blob.get(self.server_url)
            # Replace a corrupted/non-dict entry so a recovery write can't be
            # blocked by an unindexable existing value.
            if not isinstance(entry, dict):
                entry = {}
                blob[self.server_url] = entry
            entry["tokens"] = tokens.model_dump(mode="json")
            entry["obtained_at"] = int(time.time())
            if tokens.expires_in is not None:
                entry["expires_at"] = entry["obtained_at"] + int(tokens.expires_in)
            else:
                entry.pop("expires_at", None)
            self._write_file(blob)

    async def get_client_info(self) -> Optional[OAuthClientInformationFull]:
        entry = await asyncio.to_thread(self._read_entry, self.server_url)
        raw = entry.get("client_info")
        if not isinstance(raw, dict):
            return None
        try:
            return OAuthClientInformationFull.model_validate(raw)
        except Exception as exc:  # noqa: BLE001 - tolerate a corrupted/hand-edited store
            logger.warning("Ignoring unparsable stored MCP client_info for %s: %s", self.server_url, exc)
            return None

    async def set_client_info(self, client_info: OAuthClientInformationFull) -> None:
        async with self._lock:
            await asyncio.to_thread(self._sync_set_client_info, client_info)

    def _sync_set_client_info(self, client_info: OAuthClientInformationFull) -> None:
        with _interprocess_lock(self._lock_path):
            blob = self._load_file()
            entry = blob.get(self.server_url)
            if not isinstance(entry, dict):
                entry = {}
                blob[self.server_url] = entry
            entry["client_info"] = client_info.model_dump(mode="json")
            self._write_file(blob)

    # ------------------------------------------------------------------ #
    # Housekeeping helpers (used by the OAuth endpoints, not the protocol)
    #
    # list_connections / has_connection / get_metadata are synchronous: they do
    # blocking disk reads. They stay sync because they are also handy from sync
    # contexts, and a single atomic-replace write makes torn reads impossible so
    # they need no lock. Async callers MUST offload them with asyncio.to_thread
    # so they never block the event loop (see inject_mcp_auth_headers,
    # get_fresh_token, and the OAuth endpoints, which all do).
    # ------------------------------------------------------------------ #

    @staticmethod
    def _entry_is_usable(entry: Dict[str, Any]) -> bool:
        """
        True if the entry represents a connection that can actually authorize a
        request: it has an access token, and that token is either not yet expired
        or can be silently refreshed (a refresh token is present).

        Entries holding only a pre-seeded client_info (no token), or an expired
        token with no refresh token, are not usable connections - returning them
        would let ``has_connection`` block re-auth and let the UI show a server as
        connected when injection can never succeed.

        Tolerates a corrupted/hand-edited store: a non-dict entry or non-dict
        ``tokens`` field is simply treated as "not usable" rather than raising.
        """
        if not isinstance(entry, dict):
            return False
        tokens = entry.get("tokens")
        if not isinstance(tokens, dict):
            return False
        if not tokens.get("access_token"):
            return False
        # expires_at may be missing or wrong-typed in a hand-edited store; coerce
        # defensively so a bad value can't raise TypeError here. An unparsable
        # value becomes None ("no known expiry"), leaving the token usable.
        expires_at = _coerce_timestamp(entry.get("expires_at"))
        if expires_at is not None and time.time() >= expires_at and not tokens.get("refresh_token"):
            return False
        return True

    @classmethod
    def list_connections(cls, storage_dir: Optional[Path] = None) -> List[Dict[str, Any]]:
        """
        Return non-secret metadata for every stored MCP connection that has a
        usable access token. Entries holding only a pre-seeded client_info (no
        token yet), or an expired token with no refresh token, are not real
        connections and are skipped.
        """
        path = (storage_dir or _default_storage_dir()) / "tokens.json"
        blob = cls._load_path(path)
        connections: List[Dict[str, Any]] = []
        for server_url, entry in blob.items():
            if not cls._entry_is_usable(entry):
                continue
            tokens = entry.get("tokens", {}) or {}
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
    async def remove(cls, server_url: str, storage_dir: Optional[Path] = None) -> bool:
        """
        Delete the stored credentials for a server. Returns True if removed.

        This is a read-modify-write, so it serializes through the same in-process
        ``_lock`` as set_tokens/set_client_info (and the cross-process file lock),
        ensuring it cannot race with a concurrent token refresh or connect flow
        and lose updates or resurrect a deleted entry.
        """
        base = storage_dir or _default_storage_dir()
        async with cls._lock:
            return await asyncio.to_thread(cls._sync_remove, server_url, base)

    @classmethod
    def _sync_remove(cls, server_url: str, base: Path) -> bool:
        path = base / "tokens.json"
        with _interprocess_lock(base / "tokens.json.lock"):
            blob = cls._load_path(path)
            if server_url not in blob:
                return False
            del blob[server_url]
            cls._write_path(path, blob)
        return True

    @classmethod
    def has_connection(cls, server_url: str, storage_dir: Optional[Path] = None) -> bool:
        """
        True only if a usable access token is stored: present and either unexpired
        or refreshable. Ignores pre-seeded client_info, and treats an expired
        non-refreshable token as not connected so ``/start`` won't report
        ``already_connected`` and block the user from re-authenticating.
        """
        path = (storage_dir or _default_storage_dir()) / "tokens.json"
        entry = cls._load_path(path).get(server_url, {})
        return cls._entry_is_usable(entry)

    def get_metadata(self) -> Dict[str, Any]:
        """Return this server's stored entry (tokens, client_info, obtained_at, expires_at)."""
        return self._read_entry(self.server_url)

    # ------------------------------------------------------------------ #
    # Low level file I/O
    # ------------------------------------------------------------------ #

    def _read_entry(self, server_url: str) -> Dict[str, Any]:
        # Always hand back a dict so callers (get_tokens/get_client_info/
        # get_metadata -> get_fresh_token) can index it safely even if the store
        # was corrupted/hand-edited so this server's entry is not an object.
        entry = self._load_file().get(server_url, {})
        return entry if isinstance(entry, dict) else {}

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
            handle = os.fdopen(fd, "w", encoding="utf-8")
        except BaseException:
            # fdopen did not take ownership of fd, so close the raw descriptor
            # ourselves (a leaked fd can also keep the temp file unremovable on
            # Windows) before cleaning up and re-raising.
            os.close(fd)
            tmp_path.unlink(missing_ok=True)
            raise
        try:
            with handle:  # now owns fd and closes it on exit
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
