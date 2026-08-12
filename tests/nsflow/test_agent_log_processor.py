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
import unittest
from unittest.mock import patch

from neuro_san.message.types.chat_message_type import ChatMessageType

from nsflow.backend.utils.agentutils.agent_log_processor import AgentLogProcessor


class _FakeLogsManager:
    """Stand-in for WebsocketLogsManager that records every event it receives."""

    def __init__(self):
        self.progress_events = []
        self.log_events = []
        self.internal_chat_events = []

    async def progress_event(self, message):
        """Record a progress-channel event exactly as emitted."""
        self.progress_events.append(message)

    async def log_event(self, message, source):
        """Record a log-channel event."""
        self.log_events.append((message, source))

    async def internal_chat_event(self, message):
        """Record an internal-chat event."""
        self.internal_chat_events.append(message)


class TestProgressWireShape(unittest.IsolatedAsyncioTestCase):
    """The progress channel must emit one canonical shape: {"text": <dict>} (issue #260).

    Historically AGENT_PROGRESS frames were emitted as a JSON string
    '{"progress": {...}}' while AGENT tool_output frames were emitted as a
    dict {"text": {...}}, forcing clients to dual-parse.
    """

    def setUp(self):
        self.logs_manager = _FakeLogsManager()
        registry_patch = patch(
            "nsflow.backend.utils.agentutils.agent_log_processor.LogsRegistry.register",
            return_value=self.logs_manager,
        )
        # Keep the manual-editor mirroring out of these tests regardless of env.
        plugin_patch = patch.object(AgentLogProcessor, "NSFLOW_PLUGIN_MANUAL_EDITOR", None)
        registry_patch.start()
        plugin_patch.start()
        self.addCleanup(registry_patch.stop)
        self.addCleanup(plugin_patch.stop)
        self.processor = AgentLogProcessor("agent_network_designer", "session-1")

    async def test_agent_progress_emits_canonical_dict_shape(self):
        """AGENT_PROGRESS frames go out as {"text": <structure dict>}, not a JSON string."""
        structure = {
            "agent_network_name": "my_network",
            "agent_network_definition": {"frontman": {"instructions": "hi", "tools": ["helper"]}},
        }
        message = {"structure": structure, "origin": []}

        await self.processor.async_process_message(message, ChatMessageType.AGENT_PROGRESS)

        self.assertEqual(len(self.logs_manager.progress_events), 1)
        event = self.logs_manager.progress_events[0]
        self.assertIsInstance(event, dict, "progress events must be dicts, never JSON strings")
        self.assertEqual(event, {"text": structure})

    async def test_agent_tool_output_emits_canonical_dict_shape(self):
        """AGENT editor-tool frames keep their existing {"text": {...}} dict shape."""
        definition = {"frontman": {"instructions": "hi", "tools": []}}
        message = {
            "origin": [{"tool": "add_agent_to_network"}],
            "structure": {"tool_end": True, "tool_output": definition},
            "text": "",
        }

        await self.processor.async_process_message(message, ChatMessageType.AGENT)

        self.assertEqual(len(self.logs_manager.progress_events), 1)
        event = self.logs_manager.progress_events[0]
        self.assertIsInstance(event, dict, "progress events must be dicts, never JSON strings")
        self.assertEqual(event, {"text": {"agent_network_definition": definition}})

    async def test_both_message_types_share_one_wire_shape(self):
        """Both producer paths emit the same {"text": <dict>} envelope (incl. connectivity style)."""
        structure = {"connectivity_info": [{"origin": "frontman", "tools": ["helper"]}]}
        await self.processor.async_process_message(
            {"structure": structure, "origin": []}, ChatMessageType.AGENT_PROGRESS
        )
        await self.processor.async_process_message(
            {
                "origin": [{"tool": "update_agent_in_network"}],
                "structure": {"tool_end": True, "tool_output": {"frontman": {}}},
                "text": "",
            },
            ChatMessageType.AGENT,
        )

        self.assertEqual(len(self.logs_manager.progress_events), 2)
        for event in self.logs_manager.progress_events:
            self.assertIsInstance(event, dict)
            self.assertEqual(set(event.keys()), {"text"})
            self.assertIsInstance(event["text"], dict)

    async def test_string_tool_output_emits_nothing(self):
        """Unstructured string tool_output must never reach the progress channel."""
        message = {
            "origin": [{"tool": "add_agent_to_network"}],
            "structure": {"tool_end": True, "tool_output": "unstructured text"},
            "text": "",
        }

        await self.processor.async_process_message(message, ChatMessageType.AGENT)

        self.assertEqual(self.logs_manager.progress_events, [])

    async def test_empty_structure_progress_emits_nothing(self):
        """An AGENT_PROGRESS frame with an empty structure emits no progress event."""
        await self.processor.async_process_message({"structure": {}, "origin": []}, ChatMessageType.AGENT_PROGRESS)

        self.assertEqual(self.logs_manager.progress_events, [])

    async def test_non_editor_tool_output_emits_nothing(self):
        """AGENT frames from tools outside EDITOR_TOOLS never reach the progress channel."""
        message = {
            "origin": [{"tool": "web_search"}],
            "structure": {"tool_end": True, "tool_output": {"results": [1, 2]}},
            "text": "",
        }

        await self.processor.async_process_message(message, ChatMessageType.AGENT)

        self.assertEqual(self.logs_manager.progress_events, [])


if __name__ == "__main__":
    unittest.main()
