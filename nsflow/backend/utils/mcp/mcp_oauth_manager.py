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
import base64
import hashlib
import logging
import os
import secrets
import string
import time
import uuid
from dataclasses import dataclass
from dataclasses import field
from typing import Dict
from typing import Optional
from typing import Tuple
from urllib.parse import parse_qs
from urllib.parse import urlencode
from urllib.parse import urlparse
from urllib.parse import urlsplit

from mcp import ClientSession
from mcp.client.auth import OAuthClientProvider
from mcp.client.auth.exceptions import OAuthTokenError
from mcp.client.auth.oauth2 import PKCEParameters
from mcp.client.streamable_http import streamablehttp_client
from mcp.shared.auth import OAuthClientInformationFull
from mcp.shared.auth import OAuthClientMetadata
from mcp.shared.auth import OAuthToken

from nsflow.backend.utils.mcp.mcp_http import _challenge_http_client_factory
from nsflow.backend.utils.mcp.mcp_http import _discover_protected_resource_metadata
from nsflow.backend.utils.mcp.mcp_http import _mcp_http_client_factory
from nsflow.backend.utils.mcp.mcp_refresh_provider import ReauthRequiredError
from nsflow.backend.utils.mcp.mcp_refresh_provider import SilentRefreshOAuthProvider
from nsflow.backend.utils.mcp.mcp_token_storage import FileTokenStorage
from nsflow.backend.utils.mcp.mcp_token_storage import ReauthFlowTokenStorage
from nsflow.backend.utils.mcp.mcp_token_storage import _stored_expiry

logger = logging.getLogger(__name__)

# How long a pending flow may sit waiting for the user before it is abandoned.
PENDING_FLOW_TTL_SECONDS = 600
# Refresh a token this many seconds before its actual expiry.
TOKEN_REFRESH_MARGIN_SECONDS = 60

# Core OAuth authorize parameters the SDK owns and computes for security
# (PKCE, CSRF, resource binding). extra_authorize_params may never set or
# override these - not even ones the SDK happens to omit for a given flow -
# so a catalog or /start value can't alter the request's security semantics;
# only provider-specific knobs (access_type, prompt, login_hint, ...) pass.
_RESERVED_AUTHORIZE_PARAMS = frozenset(
    {
        "response_type",
        "client_id",
        "redirect_uri",
        "scope",
        "state",
        "code_challenge",
        "code_challenge_method",
        "resource",
    }
)


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

    # Set once the SDK's PKCE generator has been replaced; class-level so the
    # global patch installs exactly once (see _ensure_base64url_pkce_verifier).
    _pkce_verifier_patched: bool = False

    def __init__(self):
        self._by_flow_id: Dict[str, PendingFlow] = {}
        self._by_state: Dict[str, PendingFlow] = {}
        # Strong refs to in-flight best-effort cleanup tasks scheduled from the
        # (sync) sweep, so they aren't garbage-collected before they finish.
        self._cleanup_tasks: set = set()
        # Per-server locks serializing silent refreshes (see _refresh_lock).
        self._refresh_locks: Dict[str, asyncio.Lock] = {}
        self._ensure_base64url_pkce_verifier()

    @classmethod
    def _ensure_base64url_pkce_verifier(cls) -> None:
        """
        Replace the MCP SDK's PKCE generator with a base64url one, once.

        Salesforce's token endpoint rejects a ``code_verifier`` containing ``~``
        with ``invalid_grant`` / "invalid code verifier" - it documents the
        verifier as base64url (RFC 4648 §5), which is stricter than RFC 7636's
        unreserved set (RFC 7636 additionally allows ``.`` and ``~``). The MCP
        SDK draws verifier chars from the full unreserved set, so ~86% include a
        ``~`` and are rejected even though the pair is cryptographically valid.
        The SDK exposes no hook to supply our own verifier, so we swap its
        ``PKCEParameters.generate`` for :meth:`_base64url_pkce_parameters`.
        base64url is the subset every provider accepts, so this is safe globally.
        """
        if cls._pkce_verifier_patched:
            return
        PKCEParameters.generate = classmethod(cls._base64url_pkce_parameters)
        cls._pkce_verifier_patched = True

    @staticmethod
    def _base64url_pkce_parameters(pkce_cls: type) -> PKCEParameters:
        """
        Build PKCE parameters whose ``code_verifier`` is base64url (``A-Za-z0-9-_``).

        Installed as the SDK's ``PKCEParameters.generate`` (see
        :meth:`_ensure_base64url_pkce_verifier`), hence ``pkce_cls`` is the SDK's
        ``PKCEParameters`` class passed in by the classmethod protocol. Still 128
        chars (~768 bits of entropy) and a valid S256 pair.
        """
        charset = string.ascii_letters + string.digits + "-_"  # base64url (RFC 4648 §5)
        verifier = "".join(secrets.choice(charset) for _ in range(128))
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
        return pkce_cls(code_verifier=verifier, code_challenge=challenge)

    def _refresh_lock(self, server_url: str) -> asyncio.Lock:
        """
        Per-server lock serializing silent refreshes within this process.

        Two concurrent triggers (the network-selection gate and chat-time
        injection, or two browser tabs) must never POST the same single-use
        refresh token twice: providers that rotate refresh tokens treat reuse
        as theft and revoke the whole grant. Single-worker is already a hard
        requirement for MCP OAuth (see class docstring), so an in-process lock
        fully serializes refreshes.
        """
        lock = self._refresh_locks.get(server_url)
        if lock is None:
            lock = asyncio.Lock()
            self._refresh_locks[server_url] = lock
        return lock

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
        that same process also serves the built frontend). ``NSFLOW_OAUTH_REDIRECT_PORT``
        is a legacy port-only override, kept for backward compatibility: it
        predates the request-host derivation (which already picks up a
        port-mapped setup from the browse address), and ``NSFLOW_PUBLIC_BASE_URL``
        expresses everything it can. Prefer those. Either way, these env vars
        change only the ADVERTISED URL - the value must still resolve to
        wherever ``/callback`` is actually served.
        """
        override = os.getenv("NSFLOW_PUBLIC_BASE_URL")
        if override:
            return f"{override.rstrip('/')}/api/v1/mcp/oauth/callback"

        if request_host:
            # The Host header is client-controllable, so parse it strictly and
            # rebuild the authority rather than interpolating the raw value:
            # a header like "localhost:4173@evil.com" would pass a naive host
            # check yet resolve to evil.com as the real authority (userinfo@host),
            # leaking the OAuth code off-origin. Trust only a bare loopback host
            # with an optional numeric port and nothing else (no userinfo, path,
            # query, or fragment).
            try:
                parsed = urlsplit(f"//{request_host.strip()}", scheme="http")
                hostname = (parsed.hostname or "").lower()
                port = parsed.port  # raises ValueError on a bad/out-of-range port
                suspicious = bool(parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment)
            except ValueError:  # malformed Host (bad port, unbalanced IPv6, ...)
                hostname, port, suspicious = "", None, True
            if not suspicious and hostname in ("localhost", "127.0.0.1", "::1"):
                host = f"[{hostname}]" if ":" in hostname else hostname
                authority = f"{host}:{port}" if port is not None else host
                return f"http://{authority}/api/v1/mcp/oauth/callback"

        host = os.getenv("NSFLOW_HOST", "127.0.0.1")
        if host in ("0.0.0.0", "::", "", "localhost"):
            host = "127.0.0.1"
        # Fallback "4173" matches main.py's backend-bind fallback when NSFLOW_PORT
        # is unset; in practice run.py/main.py export NSFLOW_PORT (8005 in dev),
        # so this literal only applies to a bare, non-dev launch.
        port = os.getenv("NSFLOW_OAUTH_REDIRECT_PORT") or os.getenv("NSFLOW_PORT", "4173")
        return f"http://{host}:{port}/api/v1/mcp/oauth/callback"

    def _build_client_metadata(
        self,
        scope: Optional[str] = None,
        auth_method: str = "none",
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

    async def start_flow(  # pylint: disable=too-many-arguments  # independent optional OAuth knobs, keyword-only
        self,
        server_url: str,
        *,
        scope: Optional[str] = None,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        redirect_uri: Optional[str] = None,
        extra_authorize_params: Optional[Dict[str, str]] = None,
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
            # Pre-seed the user-supplied credentials so the SDK skips DCR.
            # manual=True lets a later reconnect reuse them (the user shouldn't
            # re-enter credentials), unlike DCR-issued registrations which are
            # re-registered on reconnect.
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
                ),
                manual=True,
            )

        flow = PendingFlow(flow_id=uuid.uuid4().hex, server_url=server_url, created_at=time.time())
        flow.preseeded_client_info = bool(client_id)
        flow.code_future = asyncio.get_running_loop().create_future()
        self._by_flow_id[flow.flow_id] = flow
        flow.task = asyncio.create_task(
            self._run_oauth_flow(
                flow,
                scope,
                auth_method=auth_method,
                redirect_uri=redirect_uri,
                extra_authorize_params=extra_authorize_params,
            )
        )

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
        if we pre-seeded it AND the entry holds no tokens at all (so we never
        delete a real, token-bearing connection, e.g. a re-auth that failed over
        an existing one). Checked on the raw entry, NOT has_connection: a
        connection marked needs_reauth reports not-connected but still holds the
        refresh token and client registration the user would lose if a canceled
        reconnect attempt deleted it.
        """
        if not flow.preseeded_client_info:
            return
        meta = await asyncio.to_thread(FileTokenStorage(flow.server_url).get_metadata)
        if meta.get("tokens"):
            return
        try:
            removed = await FileTokenStorage.remove(flow.server_url)
        except Exception as exc:  # noqa: BLE001 - cleanup is best effort
            logger.info("Could not clean up stale client_info for %s: %s", flow.server_url, exc)
            return
        if removed:
            logger.info("Removed stale pre-seeded client_info for %s after a failed OAuth flow.", flow.server_url)

    def _discard_flow(self, flow: PendingFlow) -> None:
        """Cancel a flow's background task and remove it from both registries."""
        if flow.task and not flow.task.done():
            flow.task.cancel()
        self._by_flow_id.pop(flow.flow_id, None)
        if flow.state:
            self._by_state.pop(flow.state, None)

    def _flow_provider(  # pylint: disable=too-many-arguments  # independent optional OAuth knobs, keyword-only
        self,
        flow: PendingFlow,
        scope: Optional[str],
        *,
        auth_method: str,
        redirect_uri: Optional[str],
        extra_authorize_params: Optional[Dict[str, str]] = None,
    ) -> OAuthClientProvider:
        """Build the SDK provider an interactive (re)connect flow runs through."""
        return OAuthClientProvider(
            server_url=flow.server_url,
            client_metadata=self._build_client_metadata(scope, auth_method, redirect_uri),
            # ReauthFlowTokenStorage hides any stored (dead) tokens: on a
            # reconnect the stock provider would otherwise present the old
            # Bearer token, a tolerant server answers 200, and the flow
            # aborts without ever authorizing.
            storage=ReauthFlowTokenStorage(FileTokenStorage(flow.server_url)),
            redirect_handler=self._make_redirect_handler(flow, extra_authorize_params),
            callback_handler=self._make_callback_handler(flow),
        )

    @staticmethod
    async def _probe_mcp_session(server_url: str, provider: OAuthClientProvider, http_client_factory) -> None:
        """
        Open a real MCP streamable-HTTP session through the auth provider.

        An unauthenticated request normally returns 401, which triggers the
        SDK's discovery -> DCR -> authorization (our redirect_handler) ->
        callback (our callback_handler) -> token exchange. A plain GET does not
        work: MCP endpoints answer GET with 405, so the challenge never fires.
        """
        async with streamablehttp_client(
            url=server_url, auth=provider, httpx_client_factory=http_client_factory
        ) as (read, write, _get_id):
            async with ClientSession(read, write) as session:
                await session.initialize()

    async def _run_oauth_flow(  # pylint: disable=too-many-arguments  # independent optional OAuth knobs, keyword-only
        self,
        flow: PendingFlow,
        scope: Optional[str],
        *,
        auth_method: str = "none",
        redirect_uri: Optional[str] = None,
        extra_authorize_params: Optional[Dict[str, str]] = None,
    ) -> None:
        """Background task: drive the SDK auth flow to completion."""
        provider: Optional[OAuthClientProvider] = None
        try:
            provider = self._flow_provider(
                flow,
                scope,
                auth_method=auth_method,
                redirect_uri=redirect_uri,
                extra_authorize_params=extra_authorize_params,
            )
            await self._probe_mcp_session(flow.server_url, provider, _mcp_http_client_factory)
            connected = await asyncio.to_thread(FileTokenStorage.has_connection, flow.server_url)
            prm_url = None
            if not connected:
                # Auth-optional server: it answered the probe without demanding
                # authentication (e.g. Google Maps and Hugging Face 200 an
                # anonymous initialize and only reject tool calls), so the SDK's
                # 401-driven flow never started. If the server still publishes
                # RFC 9728 protected-resource metadata, OAuth is available -
                # re-probe with a synthetic challenge pointing at it; the stock
                # SDK flow runs unmodified from that 401 onward.
                prm_url = await _discover_protected_resource_metadata(flow.server_url)
                if prm_url:
                    logger.info(
                        "MCP server %s is auth-optional; retrying with a synthetic challenge (%s)",
                        flow.server_url,
                        prm_url,
                    )
                    provider = self._flow_provider(
                        flow,
                        scope,
                        auth_method=auth_method,
                        redirect_uri=redirect_uri,
                        extra_authorize_params=extra_authorize_params,
                    )
                    await self._probe_mcp_session(flow.server_url, provider, _challenge_http_client_factory(prm_url))
                    connected = await asyncio.to_thread(FileTokenStorage.has_connection, flow.server_url)
            if connected:
                flow.status = "completed"
                await self._persist_token_endpoint(provider, flow.server_url)
            else:
                flow.status = "error"
                if prm_url:
                    # We DID find protected-resource metadata and drove the
                    # synthetic-challenge flow, but no token landed - the user
                    # cancelled/closed the popup, it timed out, or the provider
                    # rejected the authorization.
                    flow.error = (
                        "Found the MCP server's OAuth metadata but authorization "
                        "did not complete (it was cancelled, timed out, or the "
                        "provider rejected it). Please try connecting again."
                    )
                else:
                    flow.error = (
                        "Connected to the MCP server without authentication: it "
                        "returned no 401 challenge and publishes no OAuth "
                        "protected-resource metadata (RFC 9728). It may be an open "
                        "server, or use an auth scheme nsflow cannot bootstrap "
                        "(e.g. API keys)."
                    )
                logger.warning("MCP OAuth flow for %s: %s", flow.server_url, flow.error)
                await self._cleanup_failed_preseed(flow)
        except Exception as exc:  # noqa: BLE001 - report any failure back to the UI
            # If tokens were actually obtained, treat it as success even if a
            # later handshake step failed - the goal is to acquire credentials.
            if await asyncio.to_thread(FileTokenStorage.has_connection, flow.server_url):
                flow.status = "completed"
                await self._persist_token_endpoint(provider, flow.server_url)
            else:
                flow.status = "error"
                flow.error = self._describe_exception(exc)
                logger.warning("MCP OAuth flow for %s failed: %s", flow.server_url, flow.error, exc_info=True)
                await self._cleanup_failed_preseed(flow)
        finally:
            # Make sure a /start caller is never left blocked.
            if not flow.url_event.is_set():
                flow.url_event.set()

    @staticmethod
    async def _persist_token_endpoint(provider: Optional[OAuthClientProvider], server_url: str) -> None:
        """
        Record the token endpoint the flow discovered alongside the stored tokens.

        A later silent refresh runs with a fresh provider that has no discovery
        state; without the stored endpoint the SDK falls back to guessing
        ``<authorization-base>/token``, which is wrong whenever the authorization
        server lives on a different host than the MCP server (e.g. Salesforce's
        login.salesforce.com vs api.salesforce.com). Best effort: a miss only
        means the refresh must fall back to discovery via the 401 path.
        """
        try:
            metadata = provider.context.oauth_metadata if provider else None
            token_endpoint = str(metadata.token_endpoint) if metadata and metadata.token_endpoint else None
            if token_endpoint:
                await FileTokenStorage(server_url).set_token_endpoint(token_endpoint)
        except Exception as exc:  # noqa: BLE001 - metadata capture must never fail the flow
            logger.info("Could not persist the token endpoint for %s: %s", server_url, exc)

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

    def _make_redirect_handler(self, flow: PendingFlow, extra_authorize_params: Optional[Dict[str, str]] = None):
        async def redirect_handler(authorization_url: str) -> None:
            authorization_url = self._normalize_authorization_url(authorization_url)
            params = parse_qs(urlparse(authorization_url).query)
            if extra_authorize_params:
                # Provider-specific authorize knobs the SDK has no notion of -
                # e.g. Google only issues a refresh token when the authorize
                # request carries access_type=offline (and prompt=consent for
                # repeat grants). Supplied by the connector catalog or the user.
                # Drop any core OAuth param (whether or not the SDK set it this
                # flow) and any key already in the URL, so a stray/malicious
                # catalog or /start value can't override the SDK's authoritative,
                # security-relevant params. Values coerced to str defensively.
                extra = {
                    k: str(v)
                    for k, v in extra_authorize_params.items()
                    if k not in params and k not in _RESERVED_AUTHORIZE_PARAMS
                }
                if extra:
                    separator = "&" if "?" in authorization_url else "?"
                    authorization_url = f"{authorization_url}{separator}{urlencode(extra)}"
            flow.authorization_url = authorization_url
            # state was parsed above and is never among the appended keys (the
            # SDK's params are authoritative), so `params` still holds it.
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
            if meta.get("needs_reauth"):
                # A previous refresh already failed definitively; skip the
                # (expensive) probe - only reconnecting can recover this entry.
                logger.info("MCP token for %s needs re-auth; skipping silent refresh.", server_url)
            else:
                # Serialize refreshes per server so concurrent triggers can't
                # POST the same single-use refresh token twice (rotation
                # providers revoke the grant on reuse).
                async with self._refresh_lock(server_url):
                    # Re-read under the lock: a concurrent holder may already
                    # have refreshed (or marked) this entry while we waited.
                    meta = await asyncio.to_thread(storage.get_metadata)
                    expires_at = _stored_expiry(meta)
                    if (
                        expires_at is not None
                        and time.time() >= (expires_at - TOKEN_REFRESH_MARGIN_SECONDS)
                        and not meta.get("needs_reauth")
                    ):
                        needs_reauth = await self._silent_refresh(server_url)
                        # Re-read: a successful refresh pushes expires_at into the
                        # future and rewrites meta["tokens"] with the new token.
                        meta = await asyncio.to_thread(storage.get_metadata)
                        expires_at = _stored_expiry(meta)
                        if needs_reauth and expires_at is not None and time.time() >= expires_at:
                            # The refresh failed *definitively* (rejected/absent
                            # refresh token, not a transient network error):
                            # persist that so the UI can prompt a reconnect
                            # (Connectors panel chip, network-selection gate)
                            # instead of showing a dead connection as
                            # "Connected". Cleared by the next successful token
                            # write (the re-auth).
                            try:
                                await storage.set_needs_reauth()
                            except Exception as exc:  # noqa: BLE001 - marking must not break token lookup
                                logger.info("Could not persist needs_reauth for %s: %s", server_url, exc)

        # Drop a token that is actually expired (refresh failed / unavailable / skipped).
        if expires_at is not None and time.time() >= expires_at:
            logger.warning("MCP token for %s is expired and could not be refreshed; reconnect required.", server_url)
            return None

        raw = meta.get("tokens")
        if not isinstance(raw, dict):
            return None
        try:
            tokens = OAuthToken.model_validate(raw)
        except Exception as exc:  # noqa: BLE001 - tolerate a corrupted/hand-edited store
            logger.warning("MCP token for %s is unparsable; reconnect required: %s", server_url, exc)
            return None
        if not tokens.access_token:
            return None
        token_type = (tokens.token_type or "Bearer").strip()
        if token_type.lower() == "bearer":
            token_type = "Bearer"
        return f"{token_type} {tokens.access_token}"

    @staticmethod
    def _refresh_failure_needs_reauth(exc: BaseException) -> bool:
        """
        True if a failed silent refresh *definitively* requires re-authentication
        - the refresh token is absent or was rejected (``OAuthTokenError``), or
        the SDK demanded interactive authorization (``ReauthRequiredError``) -
        as opposed to a transient failure (network down, auth server 5xx) that a
        later attempt may recover from. Walks causes/contexts and exception
        groups, since the SDK and anyio wrap the original error.
        """
        seen: set = set()
        stack = [exc]
        while stack:
            err = stack.pop()
            if err is None or id(err) in seen:
                continue
            seen.add(id(err))
            if isinstance(err, (OAuthTokenError, ReauthRequiredError)):
                return True
            stack.extend(getattr(err, "exceptions", ()) or ())
            stack.append(err.__cause__)
            stack.append(err.__context__)
        return False

    async def _silent_refresh(self, server_url: str) -> bool:
        """
        Exchange the stored refresh token for a fresh access token, headlessly.

        Probes the server through ``SilentRefreshOAuthProvider``, which restores
        our persisted expiry so the SDK's proactive refresh grant fires *before*
        the probe request (a server that answers a stale token with ``200``
        instead of ``401`` would otherwise never trigger a refresh), and answers
        a ``401`` with the refresh grant rather than interactive re-auth. On any
        failure (no refresh token, revoked grant, ...) it aborts quietly, leaving
        the stale token in place; get_fresh_token then refuses to inject it and
        the user can reconnect from the Connectors tab.

        :return: True when the failure definitively requires re-authentication
                 (see _refresh_failure_needs_reauth); False on success or a
                 transient failure.
        """
        storage = FileTokenStorage(server_url)
        meta = await asyncio.to_thread(storage.get_metadata)
        expires_at = _stored_expiry(meta)
        token_endpoint = meta.get("token_endpoint")

        provider = SilentRefreshOAuthProvider(
            server_url=server_url,
            client_metadata=self._build_client_metadata(),
            storage=storage,
            # Report the expiry with the refresh margin already applied, so a
            # token get_fresh_token deems stale is equally invalid to the SDK's
            # is_token_valid() and the proactive refresh fires.
            token_expiry_time=(expires_at - TOKEN_REFRESH_MARGIN_SECONDS) if expires_at is not None else None,
            token_endpoint=token_endpoint if isinstance(token_endpoint, str) else None,
        )
        try:
            # Touch the MCP server through the provider; the refresh grant runs
            # inside its auth flow before/with this request. If re-auth would be
            # required instead, the provider raises and we bail out, leaving the
            # stale token.
            async with streamablehttp_client(
                url=server_url, auth=provider, httpx_client_factory=_mcp_http_client_factory
            ) as (read, write, _get_id):
                async with ClientSession(read, write) as session:
                    await session.initialize()
        except Exception as exc:  # noqa: BLE001 - refresh is best effort
            needs_reauth = self._refresh_failure_needs_reauth(exc)
            logger.info(
                "Silent token refresh for %s did not complete (%s): %s",
                server_url,
                "re-auth required" if needs_reauth else "transient",
                exc,
            )
            return needs_reauth
        # No exception, but the probe may have succeeded on a dead token: an
        # auth-optional server (Google Maps, Hugging Face) answers 200 without a
        # valid token, so a rejected refresh never surfaces as a 401/exception.
        # The recorded refresh status is then the only signal - a client error
        # (invalid_grant, revoked/expired refresh token) means re-auth.
        return self._refresh_status_needs_reauth(provider.refresh_http_status)

    @staticmethod
    def _refresh_status_needs_reauth(status: Optional[int]) -> bool:
        """
        Classify a refresh-grant HTTP status when the probe raised nothing.

        A 4xx (invalid_grant, revoked/expired refresh token) definitively needs
        re-auth. A 5xx / rate-limit (408, 429) is transient - retry later. None
        means no refresh was attempted (nothing to mark), and 200 succeeded.
        """
        if status is None:
            return False
        return 400 <= status < 500 and status not in (408, 429)


# Process-wide singleton.
mcp_oauth_manager = MCPOAuthManager()
