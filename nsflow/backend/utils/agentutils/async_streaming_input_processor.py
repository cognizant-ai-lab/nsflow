
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

from typing import Dict, Any, Optional, Generator
from copy import copy
import logging

from neuro_san.interfaces.agent_session import AgentSession
from neuro_san.internals.messages.origination import Origination
from neuro_san.client.streaming_input_processor import StreamingInputProcessor

class AsyncStreamingInputProcessor(StreamingInputProcessor):
    """
    Processes AgentCli input by using the neuro-san streaming API.
    """
    def __init__(self,
                 default_input: str = "",
                 thinking_file: str = None,
                 session: AgentSession = None,
                 thinking_dir: str = None):
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
        chat_request: Dict[str, Any] = self.formulate_chat_request(user_input, sly_data,
                                                                   chat_context, chat_filter)
        self.reset()

        return_state: Dict[str, Any] = copy(state)
        returned_sly_data: Optional[Dict[str, Any]] = None
        chat_responses: Generator[Dict[str, Any], None, None] = self.session.streaming_chat(chat_request)
        for chat_response in chat_responses:

            response: Dict[str, Any] = chat_response.get("response", empty)
            # Use the async version of the message processor
            await self.processor.async_process_message(response)

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
            "origin_str": origin_str
        }
        return_state.update(update)

        return return_state
