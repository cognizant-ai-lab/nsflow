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
Orchestrates the MCP OAuth 2.1 flow (authorization-code + PKCE + dynamic client
registration) on the backend - the same flow Claude Desktop / claude.ai use to
connect to OAuth-protected MCP servers.

The MCP SDK's ``OAuthClientProvider`` is an ``httpx.Auth`` that performs the
whole flow reactively when a request to the MCP server returns ``401``. We drive
it *proactively* by firing a single throwaway request through that auth so the
flow runs with no live MCP session:

  * ``redirect_handler`` captures the authorization URL (instead of opening a
    browser) so the frontend can open it in a popup.
  * ``callback_handler`` blocks until our ``/callback`` endpoint receives the
    authorization code and resolves the pending flow's future.

Obtained tokens (incl. the refresh token) and the dynamic client registration
are persisted by ``FileTokenStorage``, and ``get_fresh_token`` silently refreshes
them when needed so the token injected into ``sly_data`` is never stale.
"""

import asyncio
import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, Optional, Tuple
from urllib.parse import parse_qs, urlparse

import httpx
from mcp import ClientSession
from mcp.client.auth import OAuthClientProvider
from mcp.client.streamable_http import streamablehttp_client
from mcp.shared.auth import OAuthClientInformationFull, OAuthClientMetadata, OAuthToken

# create_mcp_http_client currently lives in the private mcp.shared._httpx_utils
# (that is where the SDK's own client modules import it from as of mcp 1.27.x).
# Prefer a public path if a future SDK promotes it (underscore -> public is a
# common deprecation path), and fall back to the private module for current and
# older versions.
try:
    from mcp.shared.httpx_utils import create_mcp_http_client  # type: ignore
except ImportError:  # pragma: no cover - exercised only on older/newer SDK layouts
    from mcp.shared._httpx_utils import create_mcp_http_client

from nsflow.backend.utils.mcp.mcp_token_storage import FileTokenStorage, _stored_expiry

logger = logging.getLogger(__name__)

# How long a pending flow may sit waiting for the user before it is abandoned.
PENDING_FLOW_TTL_SECONDS = 600
# Refresh a token this many seconds before its actual expiry.
TOKEN_REFRESH_MARGIN_SECONDS = 60


async def _force_json_accept_on_oauth_requests(request: httpx.Request) -> None:
    """
    httpx request hook: force ``Accept: application/json`` on OAuth token/refresh
    requests. Some authorization servers (notably GitHub's
    ``…/login/oauth/access_token``) return a form-encoded body unless the client
    explicitly asks for JSON, which then fails the SDK's JSON token parsing.

    These OAuth requests are form-encoded (``application/x-www-form-urlencoded``),
    which uniquely distinguishes them from MCP streamable-HTTP JSON-RPC POSTs
    (``application/json``, which must keep their ``application/json,
    text/event-stream`` Accept header), so this never touches MCP traffic.
    """
    content_type = request.headers.get("content-type", "")
    if content_type.startswith("application/x-www-form-urlencoded"):
        request.headers["Accept"] = "application/json"


def _mcp_http_client_factory(
    headers=None, timeout=None, auth=None, **kwargs
) -> httpx.AsyncClient:
    """
    MCP http client factory that adds the OAuth Accept-JSON request hook.

    Accepts and forwards any extra keyword arguments so the factory stays
    compatible if a future MCP SDK passes additional parameters to
    ``httpx_client_factory`` (a common forward-compat pattern). Forwarding rather
    than dropping them means new client settings (proxy, TLS verify, etc.) still
    reach the underlying client - and since we wrap the SDK's own
    ``create_mcp_http_client``, anything it passes is something it accepts.
    """
    client = create_mcp_http_client(headers=headers, timeout=timeout, auth=auth, **kwargs)
    client.event_hooks.setdefault("request", []).append(_force_json_accept_on_oauth_requests)
    return client


class ReauthRequiredError(Exception):
    """Raised internally when a silent refresh would require user interaction."""


@dataclass
class PendingFlow:  # pylint: disable=too-many-instance-attributes  # dataclass aggregating flow fields
    """In-flight OAuth authorization for a single MCP server connection."""

    flow_id: str
    server_url: str
    created_at: float
    url_event: asyncio.Event = field(default_factory=asyncio.Event)
    # Assigned in start_flow() where a running event loop is guaranteed.
    code_future: Optional[asyncio.Future] = None
    authorization_url: Optional[str] = None
    state: Optional[str] = None
    status: str = "pending"  # pending | awaiting_user | completed | error
    error: Optional[str] = None
    task: Optional[asyncio.Task] = None
    # True if start_flow() wrote a manual client_info to disk for this flow (a
    # server without DCR). Used to clean it up if the flow fails before a token
    # is stored, so a stale, invisible registration doesn't linger.
    preseeded_client_info: bool = False


class MCPOAuthManager:
    """
    Process-wide registry and driver for MCP OAuth flows. Use the singleton.

    IMPORTANT - the backend MUST run with a single worker for MCP OAuth.
    Pending-flow state (``_by_flow_id`` / ``_by_state``) lives only in this
    process's memory, so the /start, /callback, and /status requests of one
    authorization MUST all be served by the same process. With more than one
    Uvicorn worker the callback can land on a worker that never saw the /start
    and will reject a valid ``state`` as "Unknown or expired", breaking every
    connection attempt. There is no shared/IPC store; the on-disk token store is
    likewise coordinated only by a single cross-process fcntl lock, not a
    cluster-wide coordinator.

    Required configuration: run uvicorn single-worker, i.e. ``--workers 1`` (or
    ``--reload``, which forces a single worker). The normal launch path,
    ``nsflow/run.py``, uses ``--reload`` and is therefore single-worker.

    CAVEAT - the ``nsflow.backend.main`` ``__main__`` block passes
    ``workers=os.cpu_count()``; today that is a no-op because it is paired with
    ``reload=True`` (Uvicorn ignores ``workers`` in reload mode), but if that
    block is ever run without reload it WOULD start multiple workers and break
    MCP OAuth. Keep the backend single-worker.
    """

    def __init__(self):
        self._by_flow_id: Dict[str, PendingFlow] = {}
        self._by_state: Dict[str, PendingFlow] = {}
        # Strong refs to in-flight best-effort cleanup tasks scheduled from the
        # (sync) sweep, so they aren't garbage-collected before they finish.
        self._cleanup_tasks: set = set()

    # ------------------------------------------------------------------ #
    # Configuration helpers
    # ------------------------------------------------------------------ #

    @staticmethod
    def compute_redirect_uri(request_host: Optional[str] = None) -> str:
        """
        Build the loopback redirect URI that the MCP server redirects back to.

        Must match exactly between dynamic client registration and the route
        that serves ``/callback``, so it is computed in one place. OAuth 2.1 for
        public/native clients requires a loopback redirect, so a wildcard or
        bind-all host is rewritten to the loopback IP (RFC 8252).

        Resolution order:
          1. ``NSFLOW_PUBLIC_BASE_URL`` - full base URL override (proxied/HTTPS
             deployments); used verbatim.
          2. ``request_host`` (the ``Host`` header of the originating request),
             but ONLY when it is a loopback host - so the redirect_uri follows
             whichever loopback name the user actually browses nsflow on
             (``localhost`` vs ``127.0.0.1``) and matches the value the connect
             dialog shows them to register. Some providers (e.g. Salesforce)
             reject the bare IP and require ``localhost``; others prefer the IP.
             Following the browse host makes both work with no configuration.
             Non-loopback request hosts are ignored so a spoofed ``Host`` header
             can't steer the redirect to an external origin - proxied/remote
             deployments use ``NSFLOW_PUBLIC_BASE_URL`` instead.
          3. Otherwise ``http://<host>:<port>/...`` where ``port`` is
             ``NSFLOW_OAUTH_REDIRECT_PORT`` if set, else ``NSFLOW_PORT``.

        The default port is ``NSFLOW_PORT`` because ``/callback`` is a route on
        the FastAPI backend, which binds ``NSFLOW_PORT`` (8005 in dev, 4173 when
        that same process also serves the built frontend). The dedicated
        ``NSFLOW_OAUTH_REDIRECT_PORT`` knob exists for topologies where the
        browser must reach the callback on a different port (e.g. a reverse
        proxy) - it must still resolve to wherever ``/callback`` is served.
        """
        override = os.getenv("NSFLOW_PUBLIC_BASE_URL")
        if override:
            return f"{override.rstrip('/')}/api/v1/mcp/oauth/callback"

        if request_host:
            # Host header is "<host>" or "<host>:<port>"; trust only loopback so
            # the redirect follows the browse host (localhost vs 127.0.0.1).
            hostname = request_host.rsplit(":", 1)[0].strip().lower().strip("[]")
            if hostname in ("localhost", "127.0.0.1", "::1"):
                return f"http://{request_host.strip()}/api/v1/mcp/oauth/callback"

        host = os.getenv("NSFLOW_HOST", "127.0.0.1")
        if host in ("0.0.0.0", "::", "", "localhost"):
            host = "127.0.0.1"
        # Fallback "4173" matches main.py's backend-bind fallback when NSFLOW_PORT
        # is unset; in practice run.py/main.py export NSFLOW_PORT (8005 in dev),
        # so this literal only applies to a bare, non-dev launch.
        port = os.getenv("NSFLOW_OAUTH_REDIRECT_PORT") or os.getenv("NSFLOW_PORT", "4173")
        return f"http://{host}:{port}/api/v1/mcp/oauth/callback"

    def _build_client_metadata(
        self, scope: Optional[str] = None, auth_method: str = "none",
        redirect_uri: Optional[str] = None,
    ) -> OAuthClientMetadata:
        return OAuthClientMetadata(
            redirect_uris=[redirect_uri or self.compute_redirect_uri()],
            client_name="nsflow",
            grant_types=["authorization_code", "refresh_token"],
            response_types=["code"],
            # "none" => public client secured by PKCE (default; used by DCR).
            # "client_secret_post" => confidential client with a manual secret.
            token_endpoint_auth_method=auth_method,
            scope=scope,
        )

    # ------------------------------------------------------------------ #
    # Starting / completing a flow
    # ------------------------------------------------------------------ #

    async def start_flow(
        self,
        server_url: str,
        scope: Optional[str] = None,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        redirect_uri: Optional[str] = None,
    ) -> PendingFlow:
        """
        Kick off an OAuth flow for ``server_url`` and wait until the
        authorization URL has been produced (or the flow errors out).

        If ``client_id`` is supplied, the client is pre-registered manually
        instead of via Dynamic Client Registration - required for servers that
        don't support DCR (e.g. GitHub). We pre-seed it into storage so the MCP
        SDK finds existing client_info and skips its registration step. A
        ``client_secret`` makes it a confidential client (client_secret_post);
        without one it stays a public PKCE client.
        """
        self._sweep_expired()

        # Resolve the redirect_uri once so pre-seeded client_info, DCR, and the
        # authorization request all send the same value (the provider matches it
        # exactly). Defaults to the configured/loopback value when the caller
        # (the /start endpoint) didn't derive one from the request host.
        redirect_uri = redirect_uri or self.compute_redirect_uri()

        # Public (PKCE) unless a secret was provided.
        auth_method = "client_secret_post" if client_secret else "none"

        if client_id:
            # Pre-seed the dynamic-registration result so the SDK skips DCR.
            await FileTokenStorage(server_url).set_client_info(
                OAuthClientInformationFull(
                    client_id=client_id,
                    client_secret=client_secret or None,
                    redirect_uris=[redirect_uri],
                    client_name="nsflow",
                    grant_types=["authorization_code", "refresh_token"],
                    response_types=["code"],
                    token_endpoint_auth_method=auth_method,
                    scope=scope,
                )
            )

        flow = PendingFlow(flow_id=uuid.uuid4().hex, server_url=server_url, created_at=time.time())
        flow.preseeded_client_info = bool(client_id)
        flow.code_future = asyncio.get_running_loop().create_future()
        self._by_flow_id[flow.flow_id] = flow
        flow.task = asyncio.create_task(self._run_oauth_flow(flow, scope, auth_method, redirect_uri))

        # Wait for redirect_handler to capture the URL, or the task to fail.
        try:
            await asyncio.wait_for(flow.url_event.wait(), timeout=60)
        except asyncio.TimeoutError as exc:
            flow.status = "error"
            flow.error = "Timed out building the authorization URL."
            # The /start request has failed; don't leave the background task
            # running (and generating network activity) until the TTL sweep.
            # Cancel it and deregister the flow now.
            self._discard_flow(flow)
            await self._cleanup_failed_preseed(flow)
            raise TimeoutError(flow.error) from exc
        return flow

    async def _cleanup_failed_preseed(self, flow: PendingFlow) -> None:
        """
        Remove a manually pre-seeded client_info that never produced a token.

        When the user supplies a client_id (a server without DCR), start_flow
        writes that client_info to disk before the flow runs. If the flow then
        fails before any token is stored, that entry lingers in tokens.json but
        is hidden from /connections (which only lists usable tokens), so the user
        can't delete it or fall back to DCR from the UI. Remove it here - but only
        if we pre-seeded it AND no usable token exists (so we never delete a real,
        token-bearing connection, e.g. a re-auth that failed over an existing one).
        """
        if not flow.preseeded_client_info:
            return
        if await asyncio.to_thread(FileTokenStorage.has_connection, flow.server_url):
            return
        try:
            removed = await FileTokenStorage.remove(flow.server_url)
        except Exception as exc:  # noqa: BLE001 - cleanup is best effort
            logger.info("Could not clean up stale client_info for %s: %s", flow.server_url, exc)
            return
        if removed:
            logger.info(
                "Removed stale pre-seeded client_info for %s after a failed OAuth flow.", flow.server_url
            )

    def _discard_flow(self, flow: PendingFlow) -> None:
        """Cancel a flow's background task and remove it from both registries."""
        if flow.task and not flow.task.done():
            flow.task.cancel()
        self._by_flow_id.pop(flow.flow_id, None)
        if flow.state:
            self._by_state.pop(flow.state, None)

    async def _run_oauth_flow(
        self, flow: PendingFlow, scope: Optional[str], auth_method: str = "none",
        redirect_uri: Optional[str] = None,
    ) -> None:
        """Background task: drive the SDK auth flow to completion."""
        try:
            provider = OAuthClientProvider(
                server_url=flow.server_url,
                client_metadata=self._build_client_metadata(scope, auth_method, redirect_uri),
                storage=FileTokenStorage(flow.server_url),
                redirect_handler=self._make_redirect_handler(flow),
                callback_handler=self._make_callback_handler(flow),
            )
            # Open a real MCP streamable-HTTP session through the auth provider.
            # The unauthenticated request returns 401, which triggers the SDK's
            # discovery -> DCR -> authorization (our redirect_handler) -> callback
            # (our callback_handler) -> token exchange. A plain GET does not work:
            # MCP endpoints answer GET with 405, so the 401 challenge never fires.
            async with streamablehttp_client(
                url=flow.server_url, auth=provider, httpx_client_factory=_mcp_http_client_factory
            ) as (read, write, _get_id):
                async with ClientSession(read, write) as session:
                    await session.initialize()
            # Reached here without the provider needing to authorize.
            if await asyncio.to_thread(FileTokenStorage.has_connection, flow.server_url):
                flow.status = "completed"
            else:
                flow.status = "error"
                flow.error = (
                    "Connected to the MCP server but it did not start an OAuth "
                    "authorization (no 401 challenge was returned). The server may "
                    "be open, use a different auth scheme, or require static client "
                    "credentials."
                )
                logger.warning("MCP OAuth flow for %s: %s", flow.server_url, flow.error)
                await self._cleanup_failed_preseed(flow)
        except Exception as exc:  # noqa: BLE001 - report any failure back to the UI
            # If tokens were actually obtained, treat it as success even if a
            # later handshake step failed - the goal is to acquire credentials.
            if await asyncio.to_thread(FileTokenStorage.has_connection, flow.server_url):
                flow.status = "completed"
            else:
                flow.status = "error"
                flow.error = self._describe_exception(exc)
                logger.warning(
                    "MCP OAuth flow for %s failed: %s", flow.server_url, flow.error, exc_info=True
                )
                await self._cleanup_failed_preseed(flow)
        finally:
            # Make sure a /start caller is never left blocked.
            if not flow.url_event.is_set():
                flow.url_event.set()

    @staticmethod
    def _describe_exception(exc: BaseException) -> str:
        """
        Build a readable one-line description of an exception, recursively
        unwrapping ExceptionGroups (anyio/TaskGroup wrap the real cause - e.g. a
        401 HTTPStatusError or an OAuthRegistrationError for no-DCR servers - in a
        group, whose str() is just 'unhandled errors in a TaskGroup').
        """
        parts: list = []

        def _collect(err: BaseException) -> None:
            subs = getattr(err, "exceptions", None)  # ExceptionGroup
            if subs:
                for sub in subs:
                    _collect(sub)
            else:
                text = str(err).strip()
                label = f"{type(err).__name__}: {text}" if text else type(err).__name__
                if label not in parts:
                    parts.append(label)

        _collect(exc)
        return " | ".join(parts) if parts else f"{type(exc).__name__}"

    @staticmethod
    def _normalize_authorization_url(url: str) -> str:
        """
        Repair an authorization URL that ended up with two query separators.

        When a server's discovered ``authorization_endpoint`` already carries a
        query (e.g. Microsoft's ``.../authorize?prompt=select_account``), the MCP
        SDK appends its own OAuth params with another ``?``, producing an invalid
        URL with two ``?`` (``...?prompt=select_account?response_type=code&...``)
        that the IdP rejects. RFC 6749 §3.1 allows a query on the endpoint and
        requires clients to append with ``&``. Keep the first ``?`` as the
        separator and turn any later *literal* ``?`` in the query into ``&``
        (encoded ``%3F`` values are untouched).
        """
        head, sep, tail = url.partition("?")
        if not sep:
            return url
        return f"{head}?{tail.replace('?', '&')}"

    def _make_redirect_handler(self, flow: PendingFlow):
        async def redirect_handler(authorization_url: str) -> None:
            authorization_url = self._normalize_authorization_url(authorization_url)
            flow.authorization_url = authorization_url
            params = parse_qs(urlparse(authorization_url).query)
            state_values = params.get("state")
            flow.state = state_values[0] if state_values else None
            if flow.state:
                self._by_state[flow.state] = flow
            flow.status = "awaiting_user"
            flow.url_event.set()

        return redirect_handler

    def _make_callback_handler(self, flow: PendingFlow):
        async def callback_handler() -> Tuple[str, Optional[str]]:
            # Bounded so an abandoned flow cannot block forever.
            code, state = await asyncio.wait_for(flow.code_future, timeout=PENDING_FLOW_TTL_SECONDS)
            return code, state

        return callback_handler

    def resolve_callback(self, state: str, code: Optional[str], error: Optional[str]) -> Optional[PendingFlow]:
        """
        Called by the ``/callback`` endpoint. Resolves the pending flow keyed by
        the (high-entropy, CSRF-protecting) ``state`` value. Returns the flow, or
        ``None`` if ``state`` is unknown.
        """
        # Also sweep on this read path so stale flows are cleaned up during
        # normal callback handling, not only when a new flow starts.
        self._sweep_expired()
        flow = self._by_state.get(state)
        if flow is None:
            return None
        if flow.code_future.done():
            return flow
        if error:
            flow.status = "error"
            flow.error = error
            flow.code_future.set_exception(ReauthRequiredError(error))
        else:
            flow.code_future.set_result((code, state))
        return flow

    def get_flow(self, flow_id: str) -> Optional[PendingFlow]:
        """Return the pending flow for the given id, sweeping expired flows first."""
        # Sweep on poll so completed/expired flows don't accumulate when no new
        # flow is ever started.
        self._sweep_expired()
        return self._by_flow_id.get(flow_id)

    async def wait_for_completion(self, flow: PendingFlow, timeout: float = 45) -> None:
        """
        Wait for the background OAuth task to finish the token exchange so the
        caller (the /callback endpoint) can report the true final status instead
        of an optimistic "connected". The task never re-raises - it records its
        outcome on the flow - so we just await it (shielded so a timeout here does
        not cancel the real work).
        """
        if flow.task is None:
            return
        try:
            await asyncio.wait_for(asyncio.shield(flow.task), timeout)
        except asyncio.TimeoutError:
            logger.warning("Timed out waiting for OAuth flow %s to complete", flow.server_url)
        except Exception:  # noqa: BLE001 - outcome is recorded on the flow itself
            pass

    def _sweep_expired(self) -> None:
        now = time.time()
        stale = [fid for fid, fl in self._by_flow_id.items() if now - fl.created_at > PENDING_FLOW_TTL_SECONDS]
        for fid in stale:
            flow = self._by_flow_id.pop(fid, None)
            if not flow:
                continue
            if flow.state:
                self._by_state.pop(flow.state, None)
            if flow.task and not flow.task.done():
                flow.task.cancel()
            # If a manual client_info was pre-seeded for this flow and it never
            # produced a usable token, remove it so it doesn't linger invisibly in
            # tokens.json (hidden by /connections) and block future connection
            # attempts. The work is async I/O, so schedule it (the sweep runs on
            # sync paths) and keep a reference so the best-effort task isn't
            # garbage-collected before it finishes.
            if flow.preseeded_client_info:
                self._schedule_preseed_cleanup(flow)

    def _schedule_preseed_cleanup(self, flow: PendingFlow) -> None:
        """Schedule _cleanup_failed_preseed as a background task (sweep is sync)."""
        try:
            task = asyncio.ensure_future(self._cleanup_failed_preseed(flow))
        except RuntimeError:
            # No running event loop (e.g. a synchronous test); skip best-effort cleanup.
            return
        self._cleanup_tasks.add(task)
        task.add_done_callback(self._cleanup_tasks.discard)

    # ------------------------------------------------------------------ #
    # Token retrieval for sly_data injection
    # ------------------------------------------------------------------ #

    async def get_fresh_token(self, server_url: str) -> Optional[str]:
        """
        Return a ready-to-use ``Authorization`` header value (e.g.
        ``"Bearer <token>"``) for ``server_url``, refreshing silently if the
        stored token is near expiry.

        Returns ``None`` if there is no usable connection - including the case
        where the token is past its expiry and the silent refresh could not renew
        it (no refresh token, or refresh needs re-auth). We never return a token
        we know to be expired, so the caller injects nothing and the UI/network
        can prompt a reconnect instead of sending a dead Authorization header.
        """
        storage = FileTokenStorage(server_url)
        # Read the whole entry once, off the event loop. The token itself lives in
        # this same blob (meta["tokens"]), so we parse it from here rather than
        # doing a second file read via storage.get_tokens().
        meta = await asyncio.to_thread(storage.get_metadata)
        if not meta.get("tokens"):
            return None

        # Resolve expires_at defensively: a hand-edited store could carry a
        # non-numeric value (which would raise on the arithmetic below), and an
        # unparsable value is treated as already expired so we refresh/reconnect
        # rather than inject a token we can't vouch for.
        expires_at = _stored_expiry(meta)
        if expires_at is not None and time.time() >= (expires_at - TOKEN_REFRESH_MARGIN_SECONDS):
            await self._silent_refresh(server_url)
            # Re-read: a successful refresh pushes expires_at into the future and
            # rewrites meta["tokens"] with the new access token.
            meta = await asyncio.to_thread(storage.get_metadata)
            expires_at = _stored_expiry(meta)

        # Drop a token that is actually expired (refresh failed / unavailable).
        if expires_at is not None and time.time() >= expires_at:
            logger.warning(
                "MCP token for %s is expired and could not be refreshed; reconnect required.", server_url
            )
            return None

        raw = meta.get("tokens")
        if not isinstance(raw, dict):
            return None
        try:
            tokens = OAuthToken.model_validate(raw)
        except Exception as exc:  # noqa: BLE001 - tolerate a corrupted/hand-edited store
            logger.warning(
                "MCP token for %s is unparsable; reconnect required: %s", server_url, exc
            )
            return None
        if not tokens.access_token:
            return None
        token_type = (tokens.token_type or "Bearer").strip()
        if token_type.lower() == "bearer":
            token_type = "Bearer"
        return f"{token_type} {tokens.access_token}"

    async def _silent_refresh(self, server_url: str) -> None:
        """
        Probe the server through the provider so the SDK refreshes the access
        token using the stored refresh token. If full re-authentication would be
        required, abort quietly (the stale token is left in place; the user can
        reconnect from the Connectors tab).
        """

        async def _no_reauth(_authorization_url: str) -> None:
            raise ReauthRequiredError("re-authentication required")

        async def _no_callback() -> Tuple[str, Optional[str]]:
            raise ReauthRequiredError("re-authentication required")

        provider = OAuthClientProvider(
            server_url=server_url,
            client_metadata=self._build_client_metadata(),
            storage=FileTokenStorage(server_url),
            redirect_handler=_no_reauth,
            callback_handler=_no_callback,
        )
        try:
            # Touch the MCP server through the provider; with a valid refresh
            # token the SDK refreshes silently (no redirect). If full re-auth is
            # required, _no_reauth raises and we bail out, leaving the stale token.
            async with streamablehttp_client(
                url=server_url, auth=provider, httpx_client_factory=_mcp_http_client_factory
            ) as (read, write, _get_id):
                async with ClientSession(read, write) as session:
                    await session.initialize()
        except Exception as exc:  # noqa: BLE001 - refresh is best effort
            logger.info("Silent token refresh for %s did not complete: %s", server_url, exc)


# Process-wide singleton.
mcp_oauth_manager = MCPOAuthManager()
