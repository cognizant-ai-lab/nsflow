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

from mcp.client.auth.oauth2 import PKCEParameters

# Importing this module installs the PKCE workaround as a side effect: creating
# the module-level singleton runs MCPOAuthManager.__init__, which patches
# PKCEParameters.generate. Order vs the mcp import above doesn't matter - both
# bind the same class object and .generate resolves at call time.
import nsflow.backend.utils.mcp.mcp_oauth_manager  # noqa: F401  pylint: disable=unused-import

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
