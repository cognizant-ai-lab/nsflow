/*
Copyright © 2025 Cognizant Technology Solutions Corp, www.cognizant.com.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

/**
 * How a known server's OAuth *client* is registered. Both methods use the same
 * authorization-code + PKCE flow where the user clicks "approve" - they differ
 * only in how the client is registered:
 *  - 'dcr'           : Dynamic Client Registration - the backend registers a
 *                      client on the fly, so it's one click with nothing to enter.
 *  - 'pre_registered': the server advertises no registration_endpoint, so the
 *                      user must register an OAuth app at the provider and enter
 *                      its Client ID / Secret (e.g. GitHub, Asana v2). The server
 *                      still returns a 401 and the user still approves in a popup.
 */
export type KnownMcpAuth = 'dcr' | 'pre_registered';

export interface KnownMcpServer {
  /** Stable id used as a React key. */
  id: string;
  /** Display name shown on the connector tile. */
  name: string;
  /** Canonical MCP server URL passed to the OAuth /start flow. */
  url: string;
  /** Optional logo; the tile falls back to the name's first letter if unset or it fails to load. */
  iconUrl?: string;
  /** Client registration method; defaults to 'dcr' when omitted. */
  auth?: KnownMcpAuth;
}

/**
 * Curated MCP servers, vetted with ``is_dcr.py``. Entries without ``auth`` are
 * DCR ("one-click", no credentials); ``auth: 'pre_registered'`` entries need a
 * pre-registered OAuth app (Client ID / Secret) because the server advertises no
 * ``registration_endpoint``.
 *
 * For now this is hand-maintained. Detecting DCR automatically - probing the
 * server's OAuth metadata (`/.well-known/oauth-authorization-server`) for a
 * `registration_endpoint` - is a future enhancement.
 */
export const KNOWN_MCP_SERVERS: KnownMcpServer[] = [
  {
    id: 'you',
    name: 'You.com',
    url: 'https://api.you.com/mcp',
    iconUrl: 'https://you.com/favicon.ico',
  },
  {
    id: 'linear',
    name: 'Linear',
    url: 'https://mcp.linear.app/mcp',
    iconUrl: 'https://linear.app/favicon.ico',
  },
  {
    id: 'notion',
    name: 'Notion',
    url: 'https://mcp.notion.com/mcp',
    iconUrl: 'https://www.notion.so/images/favicon.ico',
  },
  {
    id: 'sentry',
    name: 'Sentry',
    url: 'https://mcp.sentry.dev/mcp',
    iconUrl: 'https://sentry.io/favicon.ico',
  },
  {
    id: 'atlassian',
    name: 'Atlassian',
    url: 'https://mcp.atlassian.com/v1/mcp/authv2',
    iconUrl: 'https://www.atlassian.com/favicon.ico',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    url: 'https://mcp.stripe.com',
    iconUrl: 'https://stripe.com/favicon.ico',
  },
  {
    id: 'paypal',
    name: 'PayPal',
    url: 'https://mcp.paypal.com/mcp',
    iconUrl: 'https://www.paypal.com/favicon.ico',
  },
  {
    id: 'intercom',
    name: 'Intercom',
    url: 'https://mcp.intercom.com/mcp',
    iconUrl: 'https://www.google.com/s2/favicons?domain=intercom.com&sz=64',
  },
  {
    id: 'zapier',
    name: 'Zapier',
    url: 'https://mcp.zapier.com/api/mcp/mcp',
    iconUrl: 'https://zapier.com/favicon.ico',
  },
  {
    id: 'postman',
    name: 'Postman',
    url: 'https://mcp.postman.com/mcp',
    iconUrl: 'https://voyager.postman.com/logo/postman-logo-icon-orange.svg',
  },
  // --- Pre-registered: no DCR, user supplies a Client ID / Secret ---
  {
    id: 'github',
    name: 'GitHub',
    url: 'https://api.githubcopilot.com/mcp',
    iconUrl: 'https://github.com/favicon.ico',
    auth: 'pre_registered',
  },
  {
    id: 'asana',
    name: 'Asana',
    url: 'https://mcp.asana.com/v2/mcp',
    iconUrl: 'https://asana.com/favicon.ico',
    auth: 'pre_registered',
  },
  {
    id: 'slack',
    name: 'Slack',
    url: 'https://mcp.slack.com/mcp',
    iconUrl: 'https://slack.com/favicon.ico',
    auth: 'pre_registered',
  },
];

/*
 * Known MCP servers deliberately NOT listed, and why - so they aren't re-added
 * after passing `is_dcr.py` (which only inspects published metadata and can't
 * see these runtime gates):
 *
 *   Figma  (https://mcp.figma.com/mcp)
 *     Advertises DCR, but the registration endpoint
 *     (https://api.figma.com/v1/oauth/mcp/register) returns a bare "403
 *     Forbidden" to our backend - an edge/WAF block (no OAuth error body) that
 *     rejects non-browser clients by TLS fingerprint, which we can't (and
 *     shouldn't) spoof. Its token endpoint IS reachable, so a *pre-registered*
 *     Figma OAuth app might work, but whether Figma's /oauth/mcp authorize
 *     endpoint accepts a user app + loopback redirect is unverified.
 *
 *   Canva  (https://mcp.canva.com/mcp)
 *     DCR registration succeeds (201), but Canva gates actual MCP access behind
 *     an approval waitlist (brand/trust/compliance review). Pre-approved tools
 *     (Claude, ChatGPT, etc.) are allowlisted; an arbitrary integration like
 *     nsflow is not, so authorization/use is denied despite the client_id.
 *     See https://www.canva.dev/docs/mcp/.
 *
 *   Microsoft 365  (https://microsoft365.mcp.claude.com/mcp)
 *     This is Claude's own hosted broker (note the *.mcp.claude.com host). It
 *     only honors Claude's registered redirect URIs, so it rejects nsflow's
 *     loopback callback ("redirect URI is incorrect"). Not a general endpoint.
 *
 * Also excluded - auth-optional servers that never return a 401 challenge, so
 * the OAuth flow never starts (the endpoint serves anonymous requests):
 * Hugging Face (https://huggingface.co/mcp) and Google Drive/Gmail/Calendar
 * (https://{drive,gmail,calendar}mcp.googleapis.com/mcp/v1).
 */
