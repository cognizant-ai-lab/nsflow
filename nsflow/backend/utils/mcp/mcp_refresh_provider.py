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
Refresh-only OAuth provider used for silent (headless) MCP token refreshes.

The MCP SDK's ``OAuthClientProvider`` cannot refresh a token it loaded from
storage: ``_initialize()`` restores the tokens but not their expiry, so
``is_token_valid()`` reports any stored token as valid and the proactive
refresh in ``async_auth_flow`` never fires; and when the server then answers
``401``, the SDK starts the full *interactive* authorization-code flow (browser
redirect) rather than a refresh grant. See
https://github.com/modelcontextprotocol/python-sdk/issues/1250.

``SilentRefreshOAuthProvider`` makes the stored refresh token actually usable
without user interaction:

* ``_initialize`` additionally restores the token expiry we persist ourselves
  (``expires_at`` in the token store), so the SDK's own proactive refresh grant
  fires *before* the request goes out - required for servers that answer a
  stale token with ``200`` rather than ``401``.
* ``_perform_authorization`` (the interactive browser step) is replaced with
  the refresh grant, so the reactive ``401`` path also refreshes instead of
  trying to open a browser.
* ``_refresh_token`` prefers the token endpoint captured at connect time: at
  refresh time no discovery has run yet, and the SDK's fallback guess of
  ``<authorization-base>/token`` is wrong whenever the authorization server
  lives on a different host than the MCP server (e.g. Salesforce).

Adapted from neuro-san's ``RefreshTokenOauthProvider``
(https://github.com/cognizant-ai-lab/neuro-san/pull/683), reworked for nsflow's
authorization-code connections: ``client_info`` comes from the token store
(persisted at connect time by DCR or manual pre-registration) instead of
constructor arguments, and tokens/credentials never transit ``sly_data``.

WARNING - FRAGILITY: this overrides *private* methods of the SDK's OAuth
implementation (``_initialize``, ``_perform_authorization``,
``_refresh_token``), which may change without notice; the SDK version is what
these overrides were written against. Upstream work toward a proper extension
point is tracked in modelcontextprotocol/python-sdk issues #1250/#1318/#2121
and PRs #1743/#1784 - migrate to it if it lands.
"""

import logging
from typing import Optional
from typing import Tuple
from urllib.parse import urljoin

import httpx
from mcp.client.auth import OAuthClientProvider
from mcp.client.auth import TokenStorage
from mcp.client.auth.exceptions import OAuthTokenError
from mcp.shared.auth import OAuthClientMetadata

logger = logging.getLogger(__name__)


class ReauthRequiredError(Exception):
    """Raised internally when a silent refresh would require user interaction."""


async def _refuse_redirect(_authorization_url: str) -> None:
    """``redirect_handler`` for headless refreshes: interactive re-auth is impossible."""
    raise ReauthRequiredError("re-authentication required")


async def _refuse_callback() -> Tuple[str, Optional[str]]:
    """``callback_handler`` for headless refreshes: interactive re-auth is impossible."""
    raise ReauthRequiredError("re-authentication required")


class SilentRefreshOAuthProvider(OAuthClientProvider):
    """
    ``OAuthClientProvider`` variant that only ever performs the refresh grant.

    Drive it exactly like the base class (it is an ``httpx.Auth``): any request
    sent through it refreshes the stored token first when it is stale, and
    answers a ``401`` with a refresh grant. It never opens a browser - if
    interactive re-authentication would be required, it raises instead, leaving
    the stored (stale) token untouched for the caller to handle.
    """

    def __init__(  # pylint: disable=too-many-arguments  # base-class args + independent optional knobs, keyword-only
        self,
        server_url: str,
        client_metadata: OAuthClientMetadata,
        storage: TokenStorage,
        *,
        token_expiry_time: Optional[float] = None,
        token_endpoint: Optional[str] = None,
    ):
        """
        :param token_expiry_time: wall-clock expiry (epoch seconds) of the stored
            access token, restored into the SDK context at initialization. Pass
            the persisted ``expires_at`` (minus any refresh margin) so
            ``is_token_valid()`` is honest about staleness.
        :param token_endpoint: the authorization server's token endpoint as
            discovered at connect time. Without it, a proactive refresh falls
            back to the SDK's guessed endpoint and may only succeed via the
            reactive ``401``-then-discovery path.
        """
        super().__init__(
            server_url=server_url,
            client_metadata=client_metadata,
            storage=storage,
            redirect_handler=_refuse_redirect,
            callback_handler=_refuse_callback,
        )
        self._stored_token_expiry_time = token_expiry_time
        self.token_endpoint = token_endpoint

    async def _initialize(self) -> None:
        """Load stored tokens/client info, then restore the token expiry."""
        await super()._initialize()
        # The SDK loads tokens from storage without their expiry, so
        # is_token_valid() would treat an arbitrarily stale token as valid and
        # the proactive refresh in async_auth_flow could never fire. Restoring
        # the wall-clock expiry we persist ourselves makes the refresh grant
        # run before the request is sent.
        if self._stored_token_expiry_time is not None:
            self.context.token_expiry_time = self._stored_token_expiry_time

    async def _perform_authorization(self) -> httpx.Request:
        """
        Exchange the refresh token instead of starting interactive authorization.

        The base implementation opens the provider's authorize page and waits
        for a browser callback - impossible headlessly. By the time the ``401``
        path calls this, discovery has populated ``oauth_metadata``, so the
        refresh grant reaches the real token endpoint even when none was stored.
        If no refresh token is available (or it was just rejected and cleared),
        ``_refresh_token`` raises and the surrounding request fails, leaving the
        stored token untouched.
        """
        return await self._refresh_token()

    async def _refresh_token(self) -> httpx.Request:
        """
        Build the refresh-grant request (RFC 6749 section 6).

        Identical to the base implementation except that the token endpoint
        captured at connect time wins over the discovered/guessed one.
        """
        if not self.context.current_tokens or not self.context.current_tokens.refresh_token:
            raise OAuthTokenError("No refresh token available")
        if not self.context.client_info or not self.context.client_info.client_id:
            raise OAuthTokenError("No client info available")

        if self.token_endpoint:
            token_url = self.token_endpoint
        elif self.context.oauth_metadata and self.context.oauth_metadata.token_endpoint:
            token_url = str(self.context.oauth_metadata.token_endpoint)
        else:
            auth_base_url = self.context.get_authorization_base_url(self.context.server_url)
            token_url = urljoin(auth_base_url.rstrip("/") + "/", "token")

        refresh_data = {
            "grant_type": "refresh_token",
            "refresh_token": self.context.current_tokens.refresh_token,
            "client_id": self.context.client_info.client_id,
        }
        if self.context.should_include_resource_param(self.context.protocol_version):
            refresh_data["resource"] = self.context.get_resource_url()  # RFC 8707

        # prepare_token_auth applies the client's token_endpoint_auth_method
        # (client_secret_post adds the secret to the form, client_secret_basic
        # to the Authorization header).
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        refresh_data, headers = self.context.prepare_token_auth(refresh_data, headers)
        return httpx.Request("POST", token_url, data=refresh_data, headers=headers)
