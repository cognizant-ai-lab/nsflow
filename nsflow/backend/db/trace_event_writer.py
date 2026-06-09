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
Persist trace events to nss_local.db on a background task so the live WebSocket
broadcast in WebsocketLogsManager.trace_event is never blocked by DB I/O.
"""

import asyncio
import logging
from typing import Any, Dict, Optional

from nsflow.backend.db.database import NssSessionLocal
from nsflow.backend.db.models import TraceEvent

_logger = logging.getLogger(__name__)


def _do_insert(session_id: str, step: Dict[str, Any]) -> None:
    """Synchronous insert; intended to be run via asyncio.to_thread."""
    if NssSessionLocal is None:
        return
    db = NssSessionLocal()
    try:
        row = TraceEvent(
            invocation_id=step.get("invocation_id") or "",
            session_id=session_id,
            network=step.get("network") or "",
            agent=step.get("agent"),
            kind=step.get("kind") or "agent",
            otrace=step.get("otrace"),
            depth=step.get("depth"),
            duration_s=step.get("duration_s"),
            start_s=step.get("start_s"),
            received_at=step.get("received_at") or 0.0,
            total_tokens=step.get("total_tokens"),
            prompt_tokens=step.get("prompt_tokens"),
            completion_tokens=step.get("completion_tokens"),
            total_cost=step.get("total_cost"),
            successful_requests=step.get("successful_requests"),
            is_network_total=bool(step.get("is_network_total")),
            model=step.get("model"),
            provider=step.get("provider"),
            prompt=step.get("prompt"),
        )
        db.add(row)
        db.commit()
    except Exception as exc:  # pylint: disable=broad-except
        # Persistence is best-effort: never let a DB failure surface to the
        # live trace path. The WebSocket broadcast already succeeded.
        db.rollback()
        _logger.warning("trace_event persistence failed: %s", exc)
    finally:
        db.close()


def schedule_persist(session_id: str, step: Dict[str, Any]) -> Optional[asyncio.Task]:
    """
    Fire-and-forget persistence. Returns the scheduled Task (mainly so tests
    can await it); callers can ignore the return value in production.

    The insert runs in a worker thread so the SQLite I/O doesn't sit on the
    event loop. Errors are swallowed and logged so they cannot affect the
    in-flight WebSocket broadcast.
    """
    if NssSessionLocal is None:
        return None
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # No loop (e.g. called from a sync context); do the write inline as a
        # last-resort. Should not happen in the WS handler, but keeps the
        # contract safe.
        try:
            _do_insert(session_id, step)
        except Exception as exc:  # pylint: disable=broad-except
            _logger.warning("trace_event sync persistence failed: %s", exc)
        return None

    return loop.create_task(asyncio.to_thread(_do_insert, session_id, step))
