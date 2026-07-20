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
Tests for the Salesforce PKCE code_verifier workaround.

Importing ``mcp_oauth_manager`` patches the MCP SDK's ``PKCEParameters.generate``
so the generated ``code_verifier`` never contains ``~``. Salesforce's token
endpoint rejects a verifier containing ``~`` with ``invalid_grant`` / "invalid
code verifier", even though RFC 7636 allows it; the stock SDK draws from a set
that includes ``~``, so ~86% of verifiers would be rejected. These tests pin that
the patched generator excludes ``~`` while still producing a valid, RFC-compliant
pair.
"""

import base64
import hashlib

from mcp.client.auth.oauth2 import PKCEParameters

# Importing this module installs the PKCE workaround as a module-level side
# effect (it patches PKCEParameters.generate). Order vs the mcp import above
# doesn't matter: both bind the same class object and .generate resolves at call
# time, so the patched generator is used regardless.
import nsflow.backend.utils.mcp.mcp_oauth_manager  # noqa: F401  pylint: disable=unused-import

# RFC 7636 unreserved characters that a code_verifier may contain.
_RFC7636_UNRESERVED = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~")


def _expected_challenge(verifier: str) -> str:
    """The S256 challenge for a verifier: BASE64URL(SHA256(verifier)) without padding."""
    return base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")


def test_generated_verifier_never_contains_tilde():
    """Across many draws, the patched generator never emits '~' (the char Salesforce rejects)."""
    for _ in range(3000):
        assert "~" not in PKCEParameters.generate().code_verifier


def test_generated_pair_is_valid_and_rfc_compliant():
    """The patched generator still yields a valid S256 pair using only RFC 7636 chars."""
    params = PKCEParameters.generate()
    # Length within RFC 7636 bounds (the SDK model also enforces 43..128).
    assert 43 <= len(params.code_verifier) <= 128
    # Only unreserved characters, and specifically none outside the allowed set.
    assert set(params.code_verifier) <= _RFC7636_UNRESERVED
    # The challenge matches the verifier (S256), so the pair is cryptographically valid.
    assert params.code_challenge == _expected_challenge(params.code_verifier)


def test_verifier_has_high_entropy_charset():
    """The verifier still draws from a broad charset (not degenerate) - sanity on the workaround."""
    # 20 verifiers * 128 chars should exercise well over 40 distinct characters if the
    # charset (letters+digits+"-._", 65 chars) is intact.
    seen = set()
    for _ in range(20):
        seen.update(PKCEParameters.generate().code_verifier)
    assert "~" not in seen
    assert len(seen) > 40
