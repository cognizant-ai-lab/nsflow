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

import asyncio
from copy import copy
from typing import Any, Dict, Generator, Optional

from neuro_san.client.streaming_input_processor import StreamingInputProcessor
from neuro_san.interfaces.agent_session import AgentSession
from neuro_san.internals.messages.origination import Origination


# pylint: disable=too-many-locals, useless-parent-delegation
class AsyncStreamingInputProcessor(StreamingInputProcessor):
    """
    Processes AgentCli input by using the neuro-san streaming API.
    """

    _sentinel = object()

    def __init__(
        self,
        default_input: str = "",
        thinking_file: str = None,
        session: AgentSession = None,
        thinking_dir: str = None,
    ):
        """
        Constructor
        """
        super().__init__(default_input, thinking_file, session, thinking_dir)

    async def async_process_once(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Use polling strategy to communicate with agent.
        :param state: The state dictionary to pass around
        :return: An updated state dictionary
        """
        empty: Dict[str, Any] = {}
        user_input: str = state.get("user_input")
        last_chat_response = state.get("last_chat_response")
        num_input = state.get("num_input")
        chat_context = state.get("chat_context", empty)
        chat_filter = state.get("chat_filter", empty)
        origin_str: str = ""

        if user_input is None or user_input == self.default_input:
            return state

        sly_data: Optional[Dict[str, Any]] = state.get("sly_data", None)
        # Note that by design, a client does not have to interpret the
        # chat_context at all. It merely needs to pass it along to continue
        # the conversation.
        chat_request: Dict[str, Any] = self.formulate_chat_request(user_input, sly_data, chat_context, chat_filter)
        self.reset()

        return_state: Dict[str, Any] = copy(state)
        returned_sly_data: Optional[Dict[str, Any]] = None
        chat_responses: Generator[Dict[str, Any], None, None] = self.session.streaming_chat(chat_request)
        async for chat_response in self.async_wrap_iter(chat_responses):

            response: Dict[str, Any] = chat_response.get("response", empty)
            # Use the async version of the message processor
            await self.processor.async_process_message(response)
            # Optionally add sleep(0) to ensure fair scheduling
            await asyncio.sleep(0)

            # Update the state if there is something to update it with
            chat_context = self.processor.get_chat_context()
            last_chat_response = self.processor.get_answer()
            returned_sly_data: Dict[str, Any] = self.processor.get_sly_data()
            origin_str = Origination.get_full_name_from_origin(self.processor.get_answer_origin())

        # Update the sly_data if new sly_data was returned
        if returned_sly_data is not None:
            if sly_data is not None:
                sly_data.update(returned_sly_data)
            else:
                sly_data = returned_sly_data.copy()

        if origin_str is None or len(origin_str) == 0:
            origin_str = "agent network"

        update = {
            "chat_context": chat_context,
            "num_input": num_input + 1,
            "last_chat_response": last_chat_response,
            "user_input": None,
            "sly_data": sly_data,
            "origin_str": origin_str,
            "token_accounting": self.processor.get_token_accounting(),
        }
        return_state.update(update)

        return return_state

    @staticmethod
    async def async_wrap_iter(sync_iterable):
        """Safely wraps a synchronous iterable into an async generator."""
        iterator = iter(sync_iterable)
        while True:
            # Use sentinel to avoid StopIteration entirely
            item = await asyncio.to_thread(next, iterator, AsyncStreamingInputProcessor._sentinel)
            if item is AsyncStreamingInputProcessor._sentinel:
                break
            yield item
