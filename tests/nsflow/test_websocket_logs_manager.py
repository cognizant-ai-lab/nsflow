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
import json
import unittest
from unittest.mock import AsyncMock
from unittest.mock import patch

from fastapi import WebSocketDisconnect

from nsflow.backend.utils.logutils.websocket_logs_manager import WebsocketLogsManager


class _FakeWebSocket:
    """Minimal WebSocket stand-in recording everything sent to it."""

    def __init__(self):
        self.sent = []

    async def accept(self):
        """Accept the connection (no-op)."""

    async def send_text(self, text):
        """Record the serialized frame."""
        self.sent.append(text)


class TestProgressChannelWireShape(unittest.IsolatedAsyncioTestCase):
    """The progress channel wire format is {"message": {"text": <dict>}} (issue #260)."""

    def setUp(self):
        self.manager = WebsocketLogsManager("my_agent", "session-1")

    async def test_progress_event_wire_shape(self):
        """progress_event wraps the payload as {"message": {"text": <dict>}} on the wire."""
        ws = _FakeWebSocket()
        self.manager.active_progress_connections.append(ws)

        await self.manager.progress_event({"text": {"agent_network_name": "net"}})

        self.assertEqual(len(ws.sent), 1)
        frame = json.loads(ws.sent[0])
        self.assertEqual(frame, {"message": {"text": {"agent_network_name": "net"}}})
        self.assertIsInstance(frame["message"]["text"], dict)

    async def test_lifecycle_events_are_dicts_with_correct_names(self):
        """Connect/disconnect lifecycle frames carry dict payloads and distinct event names."""
        ws = _FakeWebSocket()
        events = AsyncMock()
        sleep_patch = patch(
            "nsflow.backend.utils.logutils.websocket_logs_manager.asyncio.sleep",
            side_effect=WebSocketDisconnect,
        )
        with patch.object(self.manager, "progress_event", events), sleep_patch:
            await self.manager.handle_progress_websocket(ws)

        self.assertEqual(events.await_count, 2)
        connected = events.await_args_list[0].args[0]
        disconnected = events.await_args_list[1].args[0]
        self.assertEqual(connected, {"text": {"event": "progress_client_connected", "agent": "my_agent"}})
        self.assertEqual(disconnected, {"text": {"event": "progress_client_disconnected", "agent": "my_agent"}})
        self.assertEqual(self.manager.active_progress_connections, [])


if __name__ == "__main__":
    unittest.main()
