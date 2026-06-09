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
import time
import uuid
from typing import Any, Dict, Optional

from neuro_san.internals.messages.chat_message_type import ChatMessageType
from neuro_san.message_processing.message_processor import MessageProcessor

from nsflow.backend.trust.rai_service import RaiService
from nsflow.backend.utils.agentutils import network_schema_cache
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
        # Open spans keyed by " / "-joined otrace. Each value carries the start
        # timestamp, kind (agent/sub_network/tool/...), and any params from a
        # tool_start marker so we can close it later with a proper duration.
        self._open_spans: Dict[str, Dict[str, Any]] = {}
        # Current invocation (one user turn). Stamped on every emitted trace event
        # so the frontend can bucket steps per message.
        self._invocation_id: Optional[str] = None
        self._invocation_started_at: Optional[float] = None

    async def begin_invocation(self, user_input: str) -> str:
        """
        Start a new invocation (user turn). Emits an `invocation_start` trace event
        and returns the new invocation_id so the caller can correlate the end.
        Any previously-open spans are cleared so a new turn doesn't inherit
        dangling state from the prior one.
        """
        self._invocation_id = uuid.uuid4().hex
        self._invocation_started_at = time.time()
        self._open_spans.clear()
        await self.logs_manager.trace_event({
            "invocation_id": self._invocation_id,
            "kind": "invocation_start",
            "prompt": user_input,
            "received_at": self._invocation_started_at,
            "start_s": self._invocation_started_at,
            "duration_s": 0.0,
            "otrace": [],
            "agent": "",
            "depth": 0,
        })
        return self._invocation_id

    async def end_invocation(self) -> None:
        """Emit an `invocation_end` event closing the current turn."""
        if not self._invocation_id:
            return
        now = time.time()
        await self.logs_manager.trace_event({
            "invocation_id": self._invocation_id,
            "kind": "invocation_end",
            "received_at": now,
            "start_s": self._invocation_started_at or now,
            "duration_s": max(now - (self._invocation_started_at or now), 0.0),
            "otrace": [],
            "agent": "",
            "depth": 0,
        })
        self._invocation_id = None
        self._invocation_started_at = None
        self._open_spans.clear()

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
        structure: Dict[str, Any] = chat_message_dict.get("structure", {})
        progress = None

        # Log the original chat_message_dict in full only for debugging on client interface
        self.logger.debug(chat_message_dict)

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

        # Extract token accounting from AGENT messages
        if message_type == ChatMessageType.AGENT and "total_tokens" in structure:
            token_accounting = structure

        # Fetch agent network definition fron sub_networks to show progress
        if message_type == ChatMessageType.AGENT:
            tool_output = self.extract_agent_network_definition(chat_message_dict)
            if tool_output:
                progress = {
                    "agent_network_definition": tool_output,
                }
                await self.logs_manager.progress_event({"text": progress})

        if message_type == ChatMessageType.AGENT_PROGRESS:
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

        # Build internal chat message for AGENT and AGENT_TOOL_RESULT
        if message_type in (ChatMessageType.AGENT, ChatMessageType.AGENT_TOOL_RESULT):
            internal_chat = chat_message_dict.get("text", "")

            # Append structure if it exists and isn't token accounting
            if structure and "total_tokens" not in structure:
                internal_chat += "\n" + json.dumps(structure)

            # Prepend tool name for tool results
            if message_type == ChatMessageType.AGENT_TOOL_RESULT:
                tool_name = chat_message_dict.get("tool_result_origin", [{}])[-1].get("tool", "unknown")
                internal_chat = f"result from {tool_name}\n{internal_chat}"

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

        # Build trace spans from the message stream. Three triggers can close
        # (or open) a span at the current otrace path; everything funnels into
        # one helper so we get consistent events for agents, tools, and
        # sub-network calls.
        if message_type in (ChatMessageType.AGENT, ChatMessageType.AGENT_TOOL_RESULT):
            await self._update_trace_spans(
                otrace=otrace,
                structure=structure,
                token_accounting=token_accounting,
                message_type=message_type,
                tool_result_origin=chat_message_dict.get("tool_result_origin"),
            )

    def _last_origin_tool(self, msg: Dict[str, Any]) -> Optional[str]:
        """Return the last tool in origin list"""
        origin = msg.get("origin")
        if not isinstance(origin, list) or not origin:
            return None
        last = origin[-1]
        return last.get("tool") if isinstance(last, dict) else None

    def _classify_kind(
        self,
        otrace: list,
        structure: Dict[str, Any],
        token_accounting: Dict[str, Any],
        saw_token_accounting: bool,
    ) -> str:
        """
        Classify a span. Authoritative source is the network's HOCON schema;
        runtime signals are a fallback.

        Priority:
          1. "network_total"       -> token_accounting carries a "models" map
          2. HOCON schema lookup   -> declared `class`/`toolbox` -> "tool", else "agent"
          3. "sub_network"         -> leaf path starts with "/" (external network)
          4. Runtime heuristic     -> token_accounting present -> "agent", else "tool" on tool_end
        """
        if token_accounting and "models" in token_accounting:
            return "network_total"

        leaf = otrace[-1] if otrace else ""
        schema_kind = network_schema_cache.get_kind(self.agent_name, leaf)
        if schema_kind:
            return schema_kind

        if isinstance(leaf, str) and leaf.startswith("/"):
            return "sub_network"
        if token_accounting or saw_token_accounting:
            return "agent"
        if isinstance(structure, dict) and structure.get("tool_end") is True:
            return "tool"
        return "agent"

    async def _update_trace_spans(
        self,
        otrace: list,
        structure: Dict[str, Any],
        token_accounting: Dict[str, Any],
        message_type: ChatMessageType,
        tool_result_origin: Optional[list],
    ) -> None:
        """
        Maintain open spans keyed by otrace path and emit a `trace_event` when a
        span closes. A close fires on any of:
          - token_accounting for that path (LLM-bearing agent done)
          - `tool_end: True` in structure (coded tool / sub-network done)
          - an AGENT_TOOL_RESULT message carrying `tool_result_origin`
        Open fires on:
          - `invoking_start: True` in structure (pushes a child for invoked_agent_name)
          - any new otrace we haven't seen before (opportunistic)
        """
        if not otrace:
            return

        now = time.time()
        key = " / ".join(str(x) for x in otrace)

        # Open: a parent invoked something (sub-agent or coded tool — we can't
        # tell yet, since neuro-san dispatches both through the same
        # on_tool_start callback). Just record the start time; classification
        # happens at close based on whether token_accounting was ever seen.
        if isinstance(structure, dict) and structure.get("invoking_start") is True:
            invoked = structure.get("invoked_agent_name")
            if invoked:
                child_path = list(otrace) + [invoked]
                child_key = " / ".join(str(x) for x in child_path)
                if child_key not in self._open_spans:
                    self._open_spans[child_key] = {
                        "otrace": child_path,
                        "start_t": now,
                        "params": structure.get("params"),
                        "saw_token_accounting": False,
                    }
                # The parent itself is implicitly active too; make sure it has a start.
                self._open_spans.setdefault(
                    key,
                    {"otrace": list(otrace), "start_t": now, "saw_token_accounting": False},
                )
            return

        # Opportunistic open: any otrace we see for the first time gets a start time.
        if key not in self._open_spans:
            self._open_spans[key] = {
                "otrace": list(otrace),
                "start_t": now,
                "saw_token_accounting": False,
            }

        # Record that this span produced an LLM call (anywhere along the way).
        if token_accounting:
            self._open_spans[key]["saw_token_accounting"] = True

        close_now = False
        if token_accounting:
            close_now = True
        elif isinstance(structure, dict) and structure.get("tool_end") is True:
            close_now = True
        elif message_type == ChatMessageType.AGENT_TOOL_RESULT and tool_result_origin:
            close_now = True

        if not close_now:
            return

        span = self._open_spans.pop(
            key,
            {"otrace": list(otrace), "start_t": now, "saw_token_accounting": bool(token_accounting)},
        )
        # Prefer upstream-reported duration when we have it; otherwise wall-clock.
        if token_accounting and token_accounting.get("time_taken_in_seconds") is not None:
            duration_s = float(token_accounting.get("time_taken_in_seconds") or 0.0)
            start_s = now - duration_s
        else:
            start_s = span.get("start_t", now)
            duration_s = max(now - start_s, 0.0)

        kind = self._classify_kind(
            otrace,
            structure,
            token_accounting,
            saw_token_accounting=bool(span.get("saw_token_accounting")),
        )

        await self.logs_manager.trace_event({
            "invocation_id": self._invocation_id,
            "otrace": list(otrace),
            "agent": otrace[-1],
            "depth": max(len(otrace) - 1, 0),
            "kind": kind,
            "duration_s": duration_s,
            "received_at": now,
            "start_s": start_s,
            "total_tokens": token_accounting.get("total_tokens") if token_accounting else None,
            "prompt_tokens": token_accounting.get("prompt_tokens") if token_accounting else None,
            "completion_tokens": token_accounting.get("completion_tokens") if token_accounting else None,
            "total_cost": token_accounting.get("total_cost") if token_accounting else None,
            "successful_requests": token_accounting.get("successful_requests") if token_accounting else None,
            "is_network_total": kind == "network_total",
            "params": span.get("params"),
        })

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
                    design_id, _ = registry.load_from_copilot_state(copilot_state=progress, session_id=self.session_id)
                    self.logger.info("Created new session for network '%s' (design_id: %s)", network_name, design_id)

            except Exception as e:
                self.logger.error("Error processing copilot state with SimpleStateRegistry: %s", e)
                self.logger.error(
                    "Unable to process agent network designer state update for session %s", self.session_id
                )
