# Copyright © 2026 Cognizant Technology Solutions Corp, www.cognizant.com.
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
"""Covers what NsAgentClient.streaming_chat hands back to its caller."""

import copy
import json
import unittest
from typing import Any
from typing import Dict
from typing import List
from unittest.mock import AsyncMock
from unittest.mock import MagicMock
from unittest.mock import patch

from nsflow.backend.utils.agentutils.constants import AGENT_NETWORK_DESIGNER_NAME
from nsflow.backend.utils.agentutils.ns_agent_client import NsAgentClient
from nsflow.backend.utils.agentutils.ns_websocket_utils import REDACTED_VALUE
from nsflow.backend.utils.agentutils.ns_websocket_utils import NsWebsocketUtils
from nsflow.backend.utils.tools.ns_configs_registry import NsConfigsRegistry

# The MCP server the fake injection adds a token for, and the header it adds.
MCP_URL: str = "https://mcp.example.invalid/mcp"
TOKEN: str = "TEST-TOKEN-NOT-REAL"
AUTHORIZATION: str = f"Bearer {TOKEN}"

# One short reply from neuro-san: one streamed line per message type.
REPLY_TYPES: List[str] = ["SYSTEM", "AI", "AGENT_FRAMEWORK"]


class TestNsAgentClient(unittest.IsolatedAsyncioTestCase):
    """
    Covers the chunks ``NsAgentClient.streaming_chat`` yields.

    neuro-san repeats the whole request on every line it streams, so the MCP tokens
    the client adds come back in ``request.sly_data``. These tests check that the
    caller only sees them masked, while the session still gets the real ones.
    """

    def setUp(self) -> None:
        """
        Give the client a config, a fake session and a fake token injection.
        """
        NsConfigsRegistry.set_current("http", "localhost", 8080)
        # The registry keeps its config on the class, so reset it for the next test.
        self.addCleanup(NsConfigsRegistry.reset)

        self.session: MagicMock = MagicMock()
        self.session.streaming_chat.side_effect = self.echo_request
        session_patch: Any = patch.object(NsWebsocketUtils, "create_agent_session", return_value=self.session)
        session_patch.start()
        self.addCleanup(session_patch.stop)

        inject_patch: Any = patch.object(
            NsWebsocketUtils, "inject_mcp_auth_headers", new=AsyncMock(side_effect=self.inject_token)
        )
        inject_patch.start()
        self.addCleanup(inject_patch.stop)

    @staticmethod
    def echo_request(chat_request: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Stream a short reply the way neuro-san does for a MAXIMAL chat filter.

        :param chat_request: The request the session was given.
        :return: One chunk per line, each repeating the request.
        """
        chunks: List[Dict[str, Any]] = []
        for reply_type in REPLY_TYPES:
            # neuro-san puts the same request object on every line. Doing the same here
            # means a fix that edited a chunk in place would also change the session's copy.
            chunks.append({"response": {"type": reply_type, "text": reply_type}, "request": chat_request})
        return chunks

    @staticmethod
    def inject_token(sly_data: Dict[str, Any]) -> None:
        """
        Add a token header, as the real injection does for a connected MCP server.

        :param sly_data: The sly_data about to be sent to neuro-san.
        """
        http_headers: Dict[str, Any] = sly_data.setdefault("http_headers", {})
        server_headers: Dict[str, Any] = http_headers.setdefault(MCP_URL, {})
        server_headers["Authorization"] = AUTHORIZATION

    @staticmethod
    def load_request() -> Dict[str, Any]:
        """
        Build the request the Editor sends to load a network through the designer.

        :return: A new ChatRequest dict.
        """
        return {
            "user_message": {"text": "Load"},
            "chat_filter": {"chat_filter_type": "MAXIMAL"},
            "sly_data": {"agent_network_hocon_file": "basic/music_nerd.hocon", "skip_designer": True},
        }

    @staticmethod
    async def stream(chat_request: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Run one chat turn through the client and collect what it yields.

        :param chat_request: The ChatRequest to send.
        :return: The yielded chunks, in order.
        """
        chunks: List[Dict[str, Any]] = []
        async for chunk in NsAgentClient(AGENT_NETWORK_DESIGNER_NAME).streaming_chat(chat_request):
            chunks.append(chunk)
        return chunks

    async def test_masks_the_token_in_every_echoed_request(self) -> None:
        """
        Every line repeats the request, and none of them carries the real token.
        """
        chunks: List[Dict[str, Any]] = await self.stream(self.load_request())

        self.assertEqual(len(chunks), len(REPLY_TYPES))
        for chunk in chunks:
            headers: Dict[str, Any] = chunk["request"]["sly_data"]["http_headers"][MCP_URL]
            self.assertEqual(headers["Authorization"], REDACTED_VALUE)
        self.assertNotIn(TOKEN, json.dumps(chunks))

    async def test_still_sends_the_real_token_to_the_session(self) -> None:
        """
        Masking works on copies, so the request the session got keeps the real token.
        """
        await self.stream(self.load_request())

        self.session.streaming_chat.assert_called_once()
        sent: Dict[str, Any] = self.session.streaming_chat.call_args.args[0]
        self.assertEqual(sent["sly_data"]["http_headers"][MCP_URL]["Authorization"], AUTHORIZATION)

    def test_leaves_a_chunk_without_sly_data_unchanged(self) -> None:
        """
        A chunk with no request, or a request with no sly_data, comes through as it was.
        """
        without_request: Dict[str, Any] = {"response": {"type": "AI", "text": "Hello"}}
        without_sly_data: Dict[str, Any] = {
            "response": {"type": "AI", "text": "Hello"},
            "request": {"user_message": {"text": "Hi"}},
        }

        for chunk in (without_request, without_sly_data):
            with self.subTest(chunk=chunk):
                expected: Dict[str, Any] = copy.deepcopy(chunk)
                self.assertEqual(NsAgentClient.redact_chunk_for_surface(chunk), expected)
                self.assertEqual(chunk, expected)

    def test_masks_credential_headers_in_the_response_sly_data(self) -> None:
        """
        sly_data that comes back in the response is masked too.
        """
        chunk: Dict[str, Any] = {
            "response": {
                "type": "AGENT_FRAMEWORK",
                "sly_data": {"http_headers": {MCP_URL: {"Authorization": AUTHORIZATION}}},
            }
        }

        redacted: Dict[str, Any] = NsAgentClient.redact_chunk_for_surface(chunk)

        self.assertEqual(redacted["response"]["sly_data"]["http_headers"][MCP_URL]["Authorization"], REDACTED_VALUE)
        # The chunk it was given still holds the real value.
        self.assertEqual(chunk["response"]["sly_data"]["http_headers"][MCP_URL]["Authorization"], AUTHORIZATION)

    async def test_keeps_non_credential_sly_data(self) -> None:
        """
        Only credential header values are masked. The rest of sly_data comes back as it was sent.
        """
        chat_request: Dict[str, Any] = self.load_request()
        chat_request["sly_data"]["http_headers"] = {MCP_URL: {"X-Request-Id": "abc-123"}}

        chunks: List[Dict[str, Any]] = await self.stream(chat_request)

        self.assertEqual(len(chunks), len(REPLY_TYPES))
        for chunk in chunks:
            sly_data: Dict[str, Any] = chunk["request"]["sly_data"]
            self.assertEqual(sly_data["agent_network_hocon_file"], "basic/music_nerd.hocon")
            self.assertIs(sly_data["skip_designer"], True)
            self.assertEqual(sly_data["http_headers"][MCP_URL]["X-Request-Id"], "abc-123")
