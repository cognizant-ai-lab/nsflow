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

"""Lifecycle for one Network Consultant subprocess."""

import asyncio
from asyncio.subprocess import Process
from pathlib import Path

from nsflow.backend.utils.logutils.websocket_logs_registry import LogsRegistry


class ConsultantJob:
    """One running or completed consultant subprocess."""

    TAIL_POLL_INTERVAL_SECONDS = 1.0

    def __init__(
        self,
        process: Process,
        log_path: Path,
        agent_name: str,
        session_id: str,
    ) -> None:
        """Track a subprocess and mirror its log to the selected chat session."""
        self._process = process
        self._log_path = log_path
        self._agent_name = agent_name
        self._returncode: int | None = None
        asyncio.create_task(self._wait())
        asyncio.create_task(self._tail_to_logs_panel(session_id))

    def is_running(self) -> bool:
        """Return whether the subprocess is still running."""
        return self._returncode is None

    def exit_code(self) -> int | None:
        """Return the subprocess exit code once it has finished."""
        return self._returncode

    def log_path(self) -> Path:
        """Return the job's log file path."""
        return self._log_path

    def agent_name(self) -> str:
        """Return the network name associated with the job."""
        return self._agent_name

    def terminate(self) -> None:
        """Ask the subprocess to terminate gracefully."""
        self._process.terminate()

    def kill(self) -> None:
        """Force the subprocess to stop."""
        self._process.kill()

    async def wait(self) -> int:
        """Wait for the subprocess to finish and return its exit code."""
        return await self._process.wait()

    async def _wait(self) -> None:
        """Record the subprocess exit code when it finishes."""
        self._returncode = await self.wait()

    async def _tail_to_logs_panel(self, session_id: str) -> None:
        """Mirror newly appended log lines to the session's logs panel."""
        manager = LogsRegistry.register(self._agent_name, session_id)
        position = 0
        while True:
            lines, position = self._read_new_log_lines(position)
            for line in lines:
                stripped_line = line.rstrip("\n")
                if stripped_line:
                    await manager.log_event(stripped_line, source="NetworkConsultant")
            if not self.is_running():
                break
            await asyncio.sleep(self.TAIL_POLL_INTERVAL_SECONDS)

    def _read_new_log_lines(self, position: int) -> tuple[list[str], int]:
        """Read only log lines appended after the supplied file position."""
        try:
            with self._log_path.open("r", encoding="utf-8", errors="replace") as log_file:
                log_file.seek(position)
                lines = log_file.readlines()
                return lines, log_file.tell()
        except FileNotFoundError:
            return [], position
