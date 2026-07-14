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
import json
import logging
import os
import tempfile
import uuid
from typing import Any
from typing import Dict
from typing import List
from typing import Optional
from urllib.parse import urlsplit
from urllib.parse import urlunsplit

from fastapi import WebSocket
from fastapi import WebSocketDisconnect
from neuro_san.client.agent_session_factory import AgentSessionFactory

from nsflow.backend.utils.agentutils.agent_log_processor import AgentLogProcessor
from nsflow.backend.utils.agentutils.agent_network_utils import AgentNetworkUtils
from nsflow.backend.utils.agentutils.async_streaming_input_processor import AsyncStreamingInputProcessor
from nsflow.backend.utils.logutils.websocket_logs_registry import LogsRegistry
from nsflow.backend.utils.mcp.mcp_oauth_manager import mcp_oauth_manager
from nsflow.backend.utils.mcp.mcp_token_storage import FileTokenStorage
from nsflow.backend.utils.tools.ns_configs_registry import NsConfigsRegistry

# Initialize a lock
user_sessions_lock = asyncio.Lock()
user_sessions = {}

# Global storage for latest sly_data by network name and session
# Key format: "agent_name:session_id"
latest_sly_data_storage: Dict[str, Any] = {}

# http_headers entries whose values are credentials and must never leave the
# backend (logs, the sly_data websocket stream, or the persisted /slydata store).
# We inject Authorization for OAuth-connected MCP servers; the others are masked
# defensively in case a user put them in http_headers themselves.
_SENSITIVE_HEADER_NAMES = frozenset(
    {"authorization", "proxy-authorization", "cookie", "set-cookie", "x-api-key", "api-key", "x-auth-token"}
)
# Placeholder shown in place of a credential header value in any surfaced
# (logged / streamed / persisted) sly_data. inject_mcp_auth_headers treats this
# exact value as "no real token" so a round-tripped redacted header is replaced
# with a fresh token rather than sent to the agent verbatim.
REDACTED_VALUE = "***redacted***"


# pylint: disable=too-many-instance-attributes
class NsWebsocketUtils:
    """
    Encapsulates session management and WebSocket interactions for a NeuroSAN agent.
    Manages:
    - WebSocket message handling
    - Agent streaming communication
    - Live logging and internal chat broadcasting via WebSocketLogsManager
    """

    LOG_BUFFER_SIZE = 100
    DEFAULT_INPUT: str = ""
    DEFAULT_PROMPT: str = "Please enter your response ('quit' to terminate):\n"

    def __init__(self, agent_name: str, websocket: WebSocket, session_id: str = None):
        """
        Initialize the Agent service API wrapper.
        :param agent_name: Name of the NeuroSAN agent(Network) to connect to.
        :param websocket: The WebSocket connection instance.
        :param session_id: Unique session identifier for this user connection.
                          If not provided, a new one will be generated.
        """
        try:
            config = NsConfigsRegistry.get_current()
        except RuntimeError as e:
            raise RuntimeError(
                "No active NsConfigStore. \
                               Please set it via /set_config before using endpoints."
            ) from e

        self.server_host = config.host
        self.server_port = config.port
        self.connection = config.connection_type

        self.agent_name = agent_name
        self.session_id = session_id or str(uuid.uuid4().hex)
        self.use_direct = False
        self.websocket = websocket
        self.active_chat_connections: Dict[str, WebSocket] = {}
        self.chat_context: Dict[str, Any] = {}
        # Set up the thinking file and directory from environment variables or defaults
        if "THINKING_FILE" not in os.environ:
            logging.warning("THINKING_FILE environment variable is not set. Using default temporary file.")
        self.thinking_file = os.getenv("THINKING_FILE", tempfile.gettempdir() + "/agent_thinking.txt")
        self.thinking_dir = os.getenv("THINKING_DIR", None)
        logging.info("Using thinking file: %s", self.thinking_file)
        logging.info("Using thinking dir: %s", self.thinking_dir)

        self.logs_manager = LogsRegistry.register(agent_name, self.session_id)
        self.session = self.create_agent_session()

    async def handle_user_input(self):  # pylint: disable=too-many-locals  # cohesive websocket message loop
        """
        Handle incoming WebSocket messages and process them using the agent session."""
        websocket = self.websocket
        await websocket.accept()
        # Use session_id from the frontend
        self.active_chat_connections[self.session_id] = websocket
        await self.logs_manager.log_event(
            f"Chat client {self.session_id} connected to agent: {self.agent_name}", "nsflow"
        )

        async with user_sessions_lock:
            if self.session_id not in user_sessions:
                user_sessions[self.session_id] = await self.create_user_session(self.session_id)
            user_session = user_sessions[self.session_id]

        try:
            while True:
                websocket_data = await websocket.receive_text()
                message_data = json.loads(websocket_data)
                user_input = message_data.get("message", "")
                sly_data = message_data.get("sly_data", {})
                chat_context = message_data.get("chat_context", {})
                # log the chat_context message
                await self.logs_manager.log_event(f"chat_context received: {chat_context}", "nsflow")

                input_processor = user_session["input_processor"]
                state = user_session.get("state")
                # Update user input in state
                state["user_input"] = user_input
                # Merge the client's sly_data into the session state. http_headers
                # is deep-merged so a round-tripped redaction sentinel (the UI in
                # editor mode echoes back the last streamed, masked sly_data) can't
                # clobber the real secrets the backend retains - see
                # _merge_user_sly_data.
                self._merge_user_sly_data(state["sly_data"], sly_data)
                # Inject Authorization headers for any OAuth-connected MCP servers
                # this network uses, so the agent can call them without the user
                # having to paste a token. User-supplied http_headers win.
                await self.inject_mcp_auth_headers(state["sly_data"])
                # Update chat context in state based on user input
                if bool(chat_context):
                    state["chat_context"].update(chat_context)
                # Update the state
                state = await input_processor.async_process_once(state)
                # The live sly_data still carries any MCP Authorization tokens we
                # injected. Keep the real values only in the request path and the
                # backend-only session state; everything that leaves the backend
                # (logs, the sly_data stream, the persisted /slydata store) uses a
                # redacted copy so tokens never surface.
                surfaced_sly_data = self.redact_sly_data_for_surface(state.get("sly_data"))
                loggable_state = {**state, "sly_data": surfaced_sly_data}
                await self.logs_manager.log_event(f"state after process_once: {loggable_state}", "nsflow")
                user_session["state"] = state
                last_chat_response = state.get("last_chat_response")

                # Start a background task and pass necessary data
                if last_chat_response:
                    # try:
                    response_str = json.dumps({"message": {"type": "AI", "text": last_chat_response}})
                    sly_data_str = {"text": surfaced_sly_data}
                    await websocket.send_text(response_str)
                    await self.logs_manager.log_event(f"Streaming response sent: {response_str}", "nsflow")
                    await self.logs_manager.sly_data_event(sly_data_str)

                # Store the latest sly_data for this network and session (redacted;
                # this is served verbatim by GET /slydata).
                if state.get("sly_data") is not None:
                    storage_key = f"{self.agent_name}:{self.session_id}"
                    latest_sly_data_storage[storage_key] = surfaced_sly_data

                await self.logs_manager.log_event(f"Streaming chat finished for client: {self.session_id}", "nsflow")

        except WebSocketDisconnect:
            await self.logs_manager.log_event(f"WebSocket chat client disconnected: {self.session_id}", "nsflow")
        except Exception as e:
            logging.error("Unexpected error in WebSocket handler for %s: %s", self.session_id, e)
            await self.logs_manager.log_event(f"Error in session {self.session_id}: {e}", "nsflow")
        finally:
            # clean up
            self.active_chat_connections.pop(self.session_id, None)
            async with user_sessions_lock:
                user_sessions.pop(self.session_id, None)

    async def create_user_session(self, sid: str) -> Dict[str, Any]:
        """method to create a user session with the given WebSocket connection.
        :param sid: Unique session identifier for this user connection.
                          If not provided, a new one will be generated.
        "return user_session: A dictionary with user_session related keys
        """

        # Agent session gets created in init
        chat_filter: Dict[str, Any] = {"chat_filter_type": "MAXIMAL"}
        state: Dict[str, Any] = {
            "last_chat_response": None,
            "num_input": 0,
            "chat_filter": chat_filter,
            "sly_data": {},
            "chat_context": {},
        }

        input_processor = AsyncStreamingInputProcessor(
            default_input="", thinking_file=self.thinking_file, session=self.session, thinking_dir=self.thinking_dir
        )
        # Add a processor to handle agent logs
        # and to highlight the agents that respond in the agent network diagram
        agent_log_processor = AgentLogProcessor(self.agent_name, sid)
        input_processor.processor.add_processor(agent_log_processor)

        # Note: If nothing is specified the server assumes the chat_filter_type
        #       should be "MINIMAL", however for this client which is aimed at
        #       developers, we specifically want a default MAXIMAL client to
        #       show all the bells and whistles of the output that a typical
        #       end user will not care about and not appreciate the extra
        #       data charges on their cell phone.

        user_session = {"input_processor": input_processor, "state": state, "sid": sid}
        return user_session

    def create_agent_session(self):
        """Open a session with the factory"""
        # Open a session with the factory
        factory: AgentSessionFactory = self.get_agent_session_factory()
        metadata: Dict[str, str] = {"user_id": os.environ.get("USER")}
        session = factory.create_session(
            self.connection, self.agent_name, self.server_host, self.server_port, self.use_direct, metadata
        )
        logging.info("Created agent session for agent: %s", str(session.get_request_path(self.connection)))
        return session

    def get_connectivity(self):
        """Simple method to get connectivity details"""
        data: Dict[str, Any] = {}
        return self.session.connectivity(data)

    def get_agent_session_factory(self) -> AgentSessionFactory:
        """
        This allows subclasses to add different kinds of connections.

        :return: An AgentSessionFactory instance that will allow creation of the
                 session with the agent network.
        """
        return AgentSessionFactory()

    async def inject_mcp_auth_headers(  # pylint: disable=too-many-locals,too-many-branches  # header-merge logic over many optional fields
        self, sly_data: Dict[str, Any]
    ) -> None:
        """
        Merge OAuth Bearer tokens for connected MCP servers into sly_data's
        ``http_headers`` so the agent network can authenticate to them.

        Only servers this network declares it needs auth for (in its
        ``sly_data_schema``) are injected, so a token is never broadcast to an
        unrelated network or to an MCP server that needs no auth. If the network's
        HOCON cannot be read locally (e.g. it lives on a remote neuro-san server),
        we fall back to injecting every connected server. Any header the user
        already supplied for a given URL is left untouched.

        :param sly_data: The sly_data dict to enrich in place.
        """
        try:
            # Both of these do synchronous disk I/O (reading tokens.json and
            # restoring/parsing the network HOCON) and run on every chat message,
            # so offload them to a worker thread to keep the websocket handler's
            # event loop responsive. get_fresh_token below is already async.
            connections = await asyncio.to_thread(FileTokenStorage.list_connections)
            if not connections:
                return
            connected_urls = [conn["server_url"] for conn in connections]

            referenced = await asyncio.to_thread(self.get_network_mcp_urls)
            # Build (header_key, token_url) pairs. URLs are matched on a normalized
            # form so cosmetic differences (trailing slash, host case, default
            # port) between the stored connection URL and the network's declared
            # URL don't block injection. But each original string is kept for its
            # real job: header_key is the URL the network declares in its schema
            # (what neuro-san's MCP adapter looks the header up by), and token_url
            # is the stored connection URL (the key the token store is keyed on).
            if referenced is None:
                # HOCON not locally readable: inject every connection, keyed by
                # its own URL (we have no network-side form to match against).
                targets = [(url, url) for url in connected_urls]
            else:
                connected_by_norm = {self._normalize_mcp_url(url): url for url in connected_urls}
                targets = []
                for ref in referenced:
                    token_url = connected_by_norm.get(self._normalize_mcp_url(ref))
                    if token_url is not None:
                        targets.append((ref, token_url))
            logging.info(
                "MCP auth injection for network '%s': connected=%s referenced=%s targets=%s",
                self.agent_name,
                sorted(connected_urls),
                "ALL(fallback)" if referenced is None else sorted(referenced),
                sorted({header_key for header_key, _ in targets}),
            )
            if not targets:
                return

            # http_headers comes from user-provided sly_data, so it may be missing
            # or not a dict. Coerce anything non-dict to an empty object before we
            # index into it, so a malformed value can't crash injection.
            http_headers = sly_data.get("http_headers")
            if not isinstance(http_headers, dict):
                if http_headers is not None:
                    logging.warning(
                        "MCP auth: sly_data.http_headers is %s, not a dict; overwriting it.",
                        type(http_headers).__name__,
                    )
                http_headers = {}
                sly_data["http_headers"] = http_headers
            for header_key, token_url in targets:
                existing = http_headers.get(header_key)
                headers = existing if isinstance(existing, dict) else {}
                # HTTP header names are case-insensitive, so find any existing
                # "Authorization" regardless of casing.
                auth_key = self._find_header_key(headers, "Authorization")
                existing_auth = headers.get(auth_key) if auth_key else None
                # Respect a user-provided Authorization for this URL (any casing) -
                # but ignore our own redaction placeholder, which can come back from
                # a UI that round-trips a previously surfaced (masked) sly_data.
                # Treating the sentinel as real would send "***redacted***" to the agent.
                if existing_auth and existing_auth != REDACTED_VALUE:
                    logging.info("MCP auth: keeping user-supplied Authorization for %s", header_key)
                    continue
                authorization = await mcp_oauth_manager.get_fresh_token(token_url)
                if not authorization:
                    logging.warning("MCP auth: no usable token for %s (connection may need re-auth)", token_url)
                    continue
                # Drop any differently-cased existing key so we don't end up with
                # two Authorization headers, then set the canonical casing.
                if auth_key and auth_key != "Authorization":
                    headers.pop(auth_key, None)
                headers["Authorization"] = authorization
                http_headers[header_key] = headers
                logging.info("MCP auth: injected Authorization header into sly_data for %s", header_key)
        except Exception as e:  # noqa: BLE001 - never break chat on auth injection
            logging.warning("Failed to inject MCP auth headers: %s", e)

    @staticmethod
    def _merge_user_sly_data(state_sly_data: Dict[str, Any], incoming: Any) -> None:
        """
        Merge the client's ``incoming`` sly_data into ``state_sly_data`` in place.

        Top-level keys are replaced as a plain dict update would, EXCEPT
        ``http_headers``, which is deep-merged per URL/header. Any incoming header
        value equal to ``REDACTED_VALUE`` is skipped entirely - never overwriting a
        real value the backend already holds, and never added as a literal. This
        is required because the UI (editor mode) round-trips the last streamed
        sly_data, which we surface with credential headers masked; a plain
        ``update`` would replace the live tokens/cookies in the session state with
        ``***redacted***`` and forward that to the agent.
        """
        if not isinstance(incoming, dict):
            return
        # Non-http_headers keys keep the original shallow-replace behavior.
        for key, value in incoming.items():
            if key != "http_headers":
                state_sly_data[key] = value

        incoming_headers = incoming.get("http_headers")
        if not isinstance(incoming_headers, dict):
            # A non-dict http_headers from the client is left to injection-time
            # coercion; only replace when there is nothing usable to preserve.
            if "http_headers" in incoming and "http_headers" not in state_sly_data:
                state_sly_data["http_headers"] = incoming_headers
            return

        merged = state_sly_data.get("http_headers")
        if not isinstance(merged, dict):
            merged = {}
            state_sly_data["http_headers"] = merged
        for url, headers in incoming_headers.items():
            if not isinstance(headers, dict):
                merged[url] = headers
                continue
            target = merged.get(url)
            if not isinstance(target, dict):
                target = {}
                merged[url] = target
            for name, value in headers.items():
                # Drop a round-tripped redaction sentinel so it can't clobber a
                # real secret already stored, or be forwarded to the agent verbatim.
                if value == REDACTED_VALUE:
                    continue
                target[name] = value

    @staticmethod
    def _find_header_key(headers: Dict[str, Any], name: str) -> Optional[str]:
        """
        Return the actual key in ``headers`` that matches ``name``
        case-insensitively (HTTP header names are case-insensitive), or None.
        """
        target = name.lower()
        for key in headers:
            if isinstance(key, str) and key.lower() == target:
                return key
        return None

    @staticmethod
    def redact_sly_data_for_surface(sly_data: Any) -> Any:
        """
        Return a copy of sly_data safe to log, stream to the UI, or persist, with
        credential header values inside ``http_headers`` masked.

        The MCP Authorization tokens we inject (and any auth headers a user put in
        http_headers) must reach the agent but never leave the backend. The real
        values stay in the request path and the backend-only session state; only
        this surfaced copy is masked. Masking (rather than dropping the key) keeps
        the SlyData panel showing that a header exists without revealing the
        secret, and ``inject_mcp_auth_headers`` ignores the mask sentinel so a
        round-tripped redacted value is never mistaken for a real token.

        Only http_headers is touched - all other sly_data is returned unchanged.
        """
        if not isinstance(sly_data, dict):
            return sly_data
        if "http_headers" not in sly_data:
            return sly_data
        http_headers = sly_data.get("http_headers")
        # Shallow-copy sly_data; rewrite only the http_headers subtree so the
        # original (with live tokens) is left untouched.
        redacted = dict(sly_data)
        if not isinstance(http_headers, dict):
            # A malformed http_headers (e.g. a string or list) could itself be or
            # contain a secret; never surface it verbatim - mask the whole value.
            redacted["http_headers"] = REDACTED_VALUE
            return redacted
        redacted["http_headers"] = {
            url: (
                {
                    name: (
                        REDACTED_VALUE if isinstance(name, str) and name.lower() in _SENSITIVE_HEADER_NAMES else value
                    )
                    for name, value in headers.items()
                }
                if isinstance(headers, dict)
                else headers
            )
            for url, headers in http_headers.items()
        }
        return redacted

    @staticmethod
    def _normalize_mcp_url(url: str) -> str:
        """
        Canonicalize an MCP URL for equality comparison only - never for storage
        or token lookup. Folds away cosmetic differences that still address the
        same endpoint: scheme/host case, a redundant default port, and a trailing
        slash. On any parse failure, falls back to the stripped original so a
        weird URL simply matches itself (exact-string behavior).
        """
        try:
            parts = urlsplit(url.strip())
        except (ValueError, AttributeError):
            return url.strip()
        scheme = parts.scheme.lower()
        host = (parts.hostname or "").lower()
        port = parts.port
        # Drop a port only when it is the scheme's well-known default (http:80,
        # https:443), since e.g. "https://h/mcp" and "https://h:443/mcp" are the
        # same endpoint written two ways. The default is scheme-dependent, so we
        # match the (scheme, port) pair explicitly rather than stripping any port:
        # a non-default port like :8443 genuinely identifies a different endpoint
        # and must be preserved.
        if (scheme == "http" and port == 80) or (scheme == "https" and port == 443):
            port = None
        netloc = host if port is None else f"{host}:{port}"
        path = parts.path.rstrip("/")
        return urlunsplit((scheme, netloc, path, parts.query, ""))

    def get_network_mcp_urls(self):
        """Instance convenience for this connection's network. See
        :meth:`collect_network_mcp_urls`."""
        return self.collect_network_mcp_urls(self.agent_name)

    @classmethod
    def collect_network_mcp_urls(cls, agent_name: str):
        """
        Collect the MCP server URLs a network expects auth headers for.

        These come solely from the network's declared ``sly_data_schema`` - the
        MCP URLs listed under
        ``tools[].function.sly_data_schema.properties.http_headers.properties``.
        This is the explicit contract: a network that requires authenticated MCP
        access advertises exactly which URLs need ``http_headers`` (see neuro-san
        ``mcp_github.hocon``). We deliberately do NOT also harvest every MCP URL
        the tools reference, because a network may call MCP servers that need no
        auth at all - those must not be flagged as a missing connection nor have
        a token injected for them.

        Loads the network through ``AgentNetworkUtils.get_agent_network`` - the
        same restore path the rest of the app uses - so the config is plain and
        fully resolved (commondefs/defaults applied), and missing/remote networks
        raise.

        :return: The set of schema-declared URLs (possibly empty), or None if the
                 network is not readable locally (invalid name, or a network on a
                 remote neuro-san server), signalling the caller to fall back to
                 all connections.
        """
        try:
            agent_network = AgentNetworkUtils().get_agent_network(agent_name)
            if agent_network is None:
                return None
            config = agent_network.get_config()
        except Exception as e:  # noqa: BLE001 - invalid/remote/unreadable network
            logging.info("MCP auth: network '%s' not readable locally: %s", agent_name, e)
            return None

        # Schema-declared URLs are the explicit auth contract.
        urls: set = set()
        cls._collect_schema_http_header_urls(config, urls)
        return urls

    @classmethod
    def missing_mcp_connections(cls, agent_name: str) -> Optional[List[str]]:
        """
        MCP URLs the network declares it needs auth for (in its ``sly_data_schema``)
        that have no usable stored connection yet - i.e. the servers the user
        still needs to connect in the Connectors tab before this network can
        authenticate.

        Matching is normalized (trailing slash / host case / default port).

        :return: A sorted list of unconnected required URLs (possibly empty), or
                 None if the network is not locally readable (we can't determine
                 requirements, so the caller should not block on it).
        """
        required = cls.collect_network_mcp_urls(agent_name)
        if required is None:
            return None
        connections = FileTokenStorage.list_connections()
        connected = {cls._normalize_mcp_url(conn["server_url"]) for conn in connections}
        return sorted(url for url in required if cls._normalize_mcp_url(url) not in connected)

    @staticmethod
    def _collect_schema_http_header_urls(config: Any, urls: set) -> None:
        """
        Add MCP URLs declared in any tool's ``sly_data_schema`` to ``urls``.

        Reads ``tools[].function.sly_data_schema.properties.http_headers.properties``
        - each key there is an MCP URL the network advertises it needs an
        ``http_headers`` entry for. Every level is type-guarded so a partial or
        unconventional schema is simply skipped rather than raising.

        A URL key must be quoted in HOCON (it contains ``:`` and ``/``), and
        neuro-san's restorer preserves those surrounding quotes in the parsed
        key (e.g. ``'"https://api.githubcopilot.com/mcp"'``), so each key is
        unquoted before the ``http(s)`` check.
        """
        tools = config.get("tools") if isinstance(config, dict) else None
        if not isinstance(tools, list):
            return
        for tool in tools:
            if not isinstance(tool, dict):
                continue
            function = tool.get("function")
            schema = function.get("sly_data_schema") if isinstance(function, dict) else None
            props = schema.get("properties") if isinstance(schema, dict) else None
            http_headers = props.get("http_headers") if isinstance(props, dict) else None
            header_props = http_headers.get("properties") if isinstance(http_headers, dict) else None
            if not isinstance(header_props, dict):
                continue
            for url in header_props:
                if not isinstance(url, str):
                    continue
                url = url.strip().strip('"').strip("'").strip()
                if url.startswith(("http://", "https://")):
                    urls.add(url)

    @classmethod
    def get_latest_sly_data(cls, network_name: str, session_id: str = None) -> dict:
        """
        Retrieve the latest sly_data for a given network and session.

        Args:
            network_name: The name of the network to get sly_data for
            session_id: The session identifier. If None, tries to get any data for the network

        Returns:
            dict: The latest sly_data for the network:session, or empty dict if none available
        """
        if session_id:
            storage_key = f"{network_name}:{session_id}"
            return latest_sly_data_storage.get(storage_key, {})
        # Fallback: try to find any session data for this network (backward compatibility)
        return latest_sly_data_storage.get(network_name, {})
