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
import logging
import os
from typing import Any, Dict, Optional

from neuro_san.internals.messages.chat_message_type import ChatMessageType
from neuro_san.message_processing.message_processor import MessageProcessor

from nsflow.backend.trust.rai_service import RaiService
from nsflow.backend.utils.editor.simple_state_registry import get_registry
from nsflow.backend.utils.logutils.websocket_logs_registry import LogsRegistry

EDITOR_TOOLS = {
    "create_new_network",
    "add_agent_to_network",
    "update_agent_in_network",
    "remove_agent_from_network",
    "set_agent_instructions_tool",
}


# pylint: disable=abstract-method
class AgentLogProcessor(MessageProcessor):
    """
    Tells the UI there's an agent message to process.
    """

    AGENT_NETWORK_DESIGNER_NAME = os.getenv("NSFLOW_WAND_NAME", "agent_network_designer")
    NSFLOW_PLUGIN_MANUAL_EDITOR = os.getenv("NSFLOW_PLUGIN_MANUAL_EDITOR", None)

    def __init__(self, agent_name: str, session_id: str = None):
        """
        Constructor

        Args:
            agent_name: The name of the agent
            sid: The connection session identifier (includes host, port, uuid)
            session_id: The user session identifier from the frontend (simpler, user-level)
        """
        # Extract session_id from sid if not provided (backward compatibility)
        # sid format: "agent_name:host:port:uuid"
        self.session_id = session_id if session_id else "default_session"
        self.logs_manager = LogsRegistry.register(agent_name, self.session_id)
        self.agent_name = agent_name
        self.logger = logging.getLogger(f"{self.agent_name}")

    async def async_process_message(self, chat_message_dict: Dict[str, Any], message_type: ChatMessageType):
        """
        Process the message to:
          - Log the message
          - Highlight the agent in the network diagram
          - Display the message in the Agents Communication panel
        :param chat_message_dict: The chat message
        :param message_type: The type of message
        """
        # initialize different items in response
        internal_chat = None
        otrace = None
        token_accounting: Dict[str, Any] = {}
        progress = None

        # Log the original chat_message_dict in full only for debugging on client interface
        # await self.logs_manager.log_event(f"{'='*50}\n{chat_message_dict}")
        # To just print on terminal, uncomment the below 3 lines
        # logging.info("\n"+"="*30 + "chat_message_dict incoming" + "="*30+"\n")
        # if self.logger.isEnabledFor(logging.DEBUG):
        #     await self.logs_manager.log_event(chat_message_dict)
        self.logger.debug(chat_message_dict)
        # logging.info("\n"+"x"*30 + "End of chat_message_dict" + "x"*30+"\n")

        if message_type not in (
            ChatMessageType.AGENT,
            ChatMessageType.AI,
            ChatMessageType.AGENT_TOOL_RESULT,
            ChatMessageType.AGENT_PROGRESS,
        ):
            # These are framework messages that contain chat context, system prompts or consolidated messages etc.
            # Don't log them. And there's no agent to highlight in the network diagram.
            # ChatMessageType.AGENT_FRAMEWORK
            # ChatMessageType.SYSTEM
            # ChatMessageType.UNKNOWN
            # We also ignore ChatMessageType.HUMAN message here because that is already available via the ChatPanel
            return

        # Get the token accounting information
        if message_type == ChatMessageType.AGENT:
            token_accounting = chat_message_dict.get("structure", token_accounting)

            # fetch progress messages fron sub_networks
            tool_output = self.extract_agent_network_definition(chat_message_dict)
            if tool_output:
                progress = {"agent_network_definition": tool_output, "agent_network_name": "new_agent_network"}
                await self.logs_manager.progress_event({"text": progress})

        if message_type == ChatMessageType.AGENT_PROGRESS:
            # logging.info("\n"+"="*30 + "progress message START " + "="*30+"\n")
            # logging.info(chat_message_dict.get("structure", progress))
            # logging.info("\n"+"x"*30 + "progress message END " + "x"*30+"\n")

            # log progress messages if any
            progress = chat_message_dict.get("structure", progress)
            if progress:
                await self.logs_manager.progress_event(json.dumps({"progress": progress}))

                # Process with state manager only if the manual editor plugin is enabled
                if self.NSFLOW_PLUGIN_MANUAL_EDITOR:
                    # Process state information if this is from agent network designer
                    self.process_for_manual_editor(progress)

        # Get the list of agents that participated in the message
        otrace = chat_message_dict.get("origin", [])
        otrace = [i.get("tool") for i in otrace]

        if message_type in (ChatMessageType.AGENT, ChatMessageType.AGENT_TOOL_RESULT):
            # Get the internal chat message between agents
            internal_chat = chat_message_dict.get("text", "")

        otrace_str = json.dumps({"otrace": otrace})
        # Always send longs with a key "text" to any web socket
        internal_chat_str = {"otrace": otrace, "text": internal_chat}
        token_accounting_str = json.dumps({"token_accounting": token_accounting})
        await self.logs_manager.log_event(f"{otrace_str}", "NeuroSan")
        await self.logs_manager.internal_chat_event(internal_chat_str)

        if token_accounting:
            await self.logs_manager.log_event(f"{token_accounting_str}", "NeuroSan")
            await RaiService.get_instance().update_metrics_from_token_accounting(
                token_accounting, self.agent_name, self.session_id
            )

    def _last_origin_tool(self, msg: Dict[str, Any]) -> Optional[str]:
        """Return the last tool in origin list"""
        origin = msg.get("origin")
        if not isinstance(origin, list) or not origin:
            return None
        last = origin[-1]
        return last.get("tool") if isinstance(last, dict) else None

    def extract_agent_network_definition(self, msg: Dict[str, Any]) -> Optional[Any]:
        """
        Return the structured agent network definition from a single AGENT message
        iff ALL of the following hold:
        - msg['type'] == 'AGENT'
        - last origin tool belongs to EDITOR_TOOLS (create/update/remove/set instructions/new)
        - msg['structure']['tool_end'] is True
        - msg['structure']['tool_output'] is a dict OR (exists and is not a string)
        Otherwise return None.
        """

        last_tool = self._last_origin_tool(msg)
        if last_tool not in EDITOR_TOOLS:
            return None

        structure = msg.get("structure")
        if not isinstance(structure, dict):
            return None
        if structure.get("tool_end") is not True:
            return None

        # Only emit structured payloads; never emit unstructured text or token accounting.
        tool_output = structure.get("tool_output", None)

        # Strictly avoid strings (to prevent unstructured creep).
        if isinstance(tool_output, dict):
            return tool_output
        if tool_output is not None and not isinstance(tool_output, str):
            return tool_output

        return None

    def process_for_manual_editor(self, progress: Dict[str, Any]) -> str:
        """process progress message for manual editor's consumption"""
        if self.agent_name == self.AGENT_NETWORK_DESIGNER_NAME:
            # Use simple state registry for copilot state updates
            try:
                network_name = progress.get("agent_network_name", "new_network")

                # Get the registry instance
                registry = get_registry()

                # Check if this is an existing session or a new one
                managers = registry.get_managers_for_network(network_name)

                if managers:
                    # Existing session - just update the state (adds to history)
                    manager = registry.get_primary_manager_for_network(network_name)
                    design_id = None
                    for did, mgr in managers.items():
                        if mgr == manager:
                            design_id = did
                            break

                    state_dict = manager.extract_state_from_progress(progress)
                    if state_dict:
                        success = manager.update_network_state(network_name, state_dict, source="copilot_logs")
                        if success:
                            self.logger.info(
                                "Updated existing session for network '%s' (design_id: %s)", network_name, design_id
                            )
                        else:
                            self.logger.warning("Failed to update existing session for network '%s'", network_name)
                else:
                    # New session - create from copilot state
                    # design_id, state_manager = registry.load_from_copilot_state(
                    # copilot_state=progress, session_id=self.session_id)
                    design_id, _ = registry.load_from_copilot_state(copilot_state=progress, session_id=self.session_id)
                    self.logger.info("Created new session for network '%s' (design_id: %s)", network_name, design_id)

            except Exception as e:
                self.logger.error("Error processing copilot state with SimpleStateRegistry: %s", e)
                self.logger.error(
                    "Unable to process agent network designer state update for session %s", self.session_id
                )
