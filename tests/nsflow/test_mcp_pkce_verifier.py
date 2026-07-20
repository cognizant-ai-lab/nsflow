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
Tests for the base64url PKCE code_verifier workaround.

Importing ``mcp_oauth_manager`` (which creates its singleton) patches the MCP SDK's
``PKCEParameters.generate`` so the generated ``code_verifier`` is base64url
(``A-Za-z0-9-_``). Salesforce's token endpoint rejects a verifier containing ``~``
with ``invalid_grant`` / "invalid code verifier" - it documents the verifier as
base64url, stricter than RFC 7636 (which also allows ``.`` and ``~``). The stock SDK
draws from the full unreserved set including ``~``, so ~86% of verifiers would be
rejected. These tests pin that the patched generator emits only base64url chars
while still producing a valid S256 pair.
"""

import base64
import hashlib
import inspect

import mcp.client.auth.oauth2 as sdk_oauth2
import pytest
from mcp.client.auth.oauth2 import PKCEParameters

# Importing this module installs the PKCE workaround as a side effect: importing
# any name from it runs the module body, which creates the module-level singleton
# (MCPOAuthManager.__init__ -> _ensure_base64url_pkce_verifier, which patches
# PKCEParameters.generate). Order vs the mcp imports above doesn't matter - both
# bind the same class object and .generate resolves at call time.
from nsflow.backend.utils.mcp.mcp_oauth_manager import MCPOAuthManager

# The base64url alphabet (RFC 4648 §5) - the only chars the verifier may contain.
_BASE64URL = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")


def _expected_challenge(verifier: str) -> str:
    """The S256 challenge for a verifier: BASE64URL(SHA256(verifier)) without padding."""
    return base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")


def test_generated_verifier_is_base64url_only():
    """Across many draws, the verifier never contains '~' or '.' (both outside base64url)."""
    for _ in range(3000):
        verifier = PKCEParameters.generate().code_verifier
        assert "~" not in verifier  # the char Salesforce rejects
        assert "." not in verifier  # also outside base64url, dropped for strictness


def test_generated_pair_is_valid_and_base64url():
    """The patched generator yields a valid S256 pair using only base64url chars."""
    params = PKCEParameters.generate()
    # Length within RFC 7636 bounds (the SDK model also enforces 43..128).
    assert 43 <= len(params.code_verifier) <= 128
    # Only base64url characters.
    assert set(params.code_verifier) <= _BASE64URL
    # The challenge matches the verifier (S256), so the pair is cryptographically valid.
    assert params.code_challenge == _expected_challenge(params.code_verifier)


def test_verifier_has_high_entropy_charset():
    """The verifier still draws from a broad charset (not degenerate) - sanity on the workaround."""
    # 20 verifiers * 128 chars should exercise well over 40 distinct characters if the
    # base64url charset (64 chars) is intact.
    seen = set()
    for _ in range(20):
        seen.update(PKCEParameters.generate().code_verifier)
    assert seen <= _BASE64URL
    assert len(seen) > 40


# The tests below exercise the patch as wired into the SDK/manager, not just the
# generator in isolation - so a regression that decouples the workaround from the
# real OAuth flow (SDK drift or the manager failing to install) is caught here.
# pylint: disable=protected-access  # asserting on the workaround's internals


def test_patch_installed_on_sdk_class():
    """The manager installed *our* generator onto the SDK class - not merely that
    generate() happens to return base64url. This ties the workaround to the exact
    attribute the real authorization-code flow calls."""
    assert MCPOAuthManager._pkce_verifier_patched is True
    # PKCEParameters.generate is our classmethod; its __func__ is the manager's
    # generator function object (same object accessed via either class).
    assert PKCEParameters.generate.__func__ is MCPOAuthManager._base64url_pkce_parameters


def test_sdk_auth_code_grant_still_calls_generate():
    """Canary: the SDK's authorization-code grant still routes through
    ``PKCEParameters.generate`` - the exact attribute we patch. If a future SDK
    inlines or renames PKCE generation, our patch silently no-ops and Salesforce
    breaks again; failing here forces a re-verify instead of a silent regression."""
    assert "PKCEParameters.generate(" in inspect.getsource(sdk_oauth2)


def test_ensure_verifier_raises_on_sdk_shape_change():
    """If the SDK no longer exposes ``generate`` as a classmethod (rename/inline),
    installing the workaround must raise rather than silently overwrite a
    missing/foreign attribute and regress the real flow."""
    original = inspect.getattr_static(PKCEParameters, "generate", None)
    was_patched = MCPOAuthManager._pkce_verifier_patched
    try:
        # Simulate SDK drift: generate is present but no longer a classmethod.
        PKCEParameters.generate = staticmethod(lambda: None)
        MCPOAuthManager._pkce_verifier_patched = False
        with pytest.raises(RuntimeError, match="PKCEParameters.generate"):
            MCPOAuthManager._ensure_base64url_pkce_verifier()
    finally:
        # Restore the real workaround so later tests keep base64url verifiers.
        PKCEParameters.generate = original
        MCPOAuthManager._pkce_verifier_patched = was_patched


# pylint: enable=protected-access
