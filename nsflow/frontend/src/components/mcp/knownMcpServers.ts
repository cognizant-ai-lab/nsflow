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
  /**
   * Extra query params appended to the authorization URL for providers the
   * plain OAuth flow can't satisfy - e.g. Google issues a refresh token only
   * when the authorize request carries ``access_type=offline`` (with
   * ``prompt=consent`` so a repeat grant still returns one). The backend
   * forwards these verbatim; scopes are NOT set here (the SDK derives them from
   * the server's RFC 9728 protected-resource metadata).
   */
  extraAuthorizeParams?: Record<string, string>;
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
// Entries are ordered alphabetically by name within each group (DCR first, then
// pre-registered), matching the two sections the Connectors tab renders.
export const KNOWN_MCP_SERVERS: KnownMcpServer[] = [
  {
    id: 'atlassian',
    name: 'Atlassian',
    url: 'https://mcp.atlassian.com/v1/mcp/authv2',
    iconUrl: 'https://www.atlassian.com/favicon.ico',
  },
  {
    // Auth-optional: 200s an anonymous initialize and only 401s at tool-call
    // time, so the SDK's 401-driven flow never starts. The backend detects this
    // and re-probes with a synthetic challenge pointing at Hugging Face's RFC
    // 9728 metadata; DCR then works normally (huggingface.co/oauth/register).
    id: 'huggingface',
    name: 'Hugging Face',
    url: 'https://huggingface.co/mcp',
    iconUrl: 'https://huggingface.co/favicon.ico',
  },
  {
    id: 'intercom',
    name: 'Intercom',
    url: 'https://mcp.intercom.com/mcp',
    iconUrl: 'https://www.google.com/s2/favicons?domain=intercom.com&sz=64',
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
    id: 'paypal',
    name: 'PayPal',
    url: 'https://mcp.paypal.com/mcp',
    iconUrl: 'https://www.paypal.com/favicon.ico',
  },
  {
    id: 'postman',
    name: 'Postman',
    url: 'https://mcp.postman.com/mcp',
    iconUrl: 'https://voyager.postman.com/logo/postman-logo-icon-orange.svg',
  },
  {
    id: 'sentry',
    name: 'Sentry',
    url: 'https://mcp.sentry.dev/mcp',
    iconUrl: 'https://sentry.io/favicon.ico',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    url: 'https://mcp.stripe.com',
    iconUrl: 'https://stripe.com/favicon.ico',
  },
  {
    id: 'you',
    name: 'You.com',
    url: 'https://api.you.com/mcp',
    iconUrl: 'https://you.com/favicon.ico',
  },
  {
    id: 'zapier',
    name: 'Zapier',
    url: 'https://mcp.zapier.com/api/mcp/mcp',
    iconUrl: 'https://zapier.com/favicon.ico',
  },
  // --- Pre-registered: no DCR, user supplies a Client ID / Secret ---
  {
    id: 'asana',
    name: 'Asana',
    url: 'https://mcp.asana.com/v2/mcp',
    iconUrl: 'https://asana.com/favicon.ico',
    auth: 'pre_registered',
  },
  {
    id: 'github',
    name: 'GitHub',
    url: 'https://api.githubcopilot.com/mcp',
    iconUrl: 'https://github.com/favicon.ico',
    auth: 'pre_registered',
  },
  // Google MCP services (Gmail, Calendar, Drive, Maps): all auth-optional like
  // Hugging Face (handled by the backend's synthetic-challenge fallback), and
  // all lack DCR - register one OAuth client in the Google Cloud Console and
  // enable the relevant API + scopes on its consent screen. access_type=offline
  // + prompt=consent make Google return a refresh token (it omits one
  // otherwise); scopes come from each server's protected-resource metadata.
  {
    id: 'gmail',
    name: 'Gmail',
    url: 'https://gmailmcp.googleapis.com/mcp/v1',
    // The s2 favicon service returns the generic Google "G" for mail/calendar/
    // drive subdomains; use Google's per-product logos so each tile is distinct.
    iconUrl: 'https://ssl.gstatic.com/images/branding/product/1x/gmail_2020q4_48dp.png',
    auth: 'pre_registered',
    extraAuthorizeParams: { access_type: 'offline', prompt: 'consent' },
  },
  {
    id: 'googlecalendar',
    name: 'Google Calendar',
    url: 'https://calendarmcp.googleapis.com/mcp/v1',
    iconUrl: 'https://ssl.gstatic.com/images/branding/product/1x/calendar_2020q4_48dp.png',
    auth: 'pre_registered',
    extraAuthorizeParams: { access_type: 'offline', prompt: 'consent' },
  },
  {
    id: 'googledrive',
    name: 'Google Drive',
    url: 'https://drivemcp.googleapis.com/mcp/v1',
    iconUrl: 'https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_48dp.png',
    auth: 'pre_registered',
    extraAuthorizeParams: { access_type: 'offline', prompt: 'consent' },
  },
  {
    id: 'googlemaps',
    name: 'Google Maps',
    url: 'https://mapstools.googleapis.com/mcp',
    iconUrl: 'https://www.google.com/s2/favicons?domain=maps.google.com&sz=64',
    auth: 'pre_registered',
    extraAuthorizeParams: { access_type: 'offline', prompt: 'consent' },
  },
  {
    // Sends a real 401 challenge (not auth-optional) and has no DCR, so register
    // a Salesforce External Client App and paste its Client ID / Secret.
    id: 'salesforce',
    name: 'Salesforce',
    url: 'https://api.salesforce.com/platform/mcp/v1/platform/sobject-all',
    iconUrl: 'https://www.salesforce.com/favicon.ico',
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
 * Auth-optional servers (200 an anonymous initialize, only 401 at tool-call
 * time) used to be excluded because the OAuth flow never started. They are now
 * supported via the backend's synthetic-challenge fallback when they publish
 * RFC 9728 protected-resource metadata - Hugging Face and the Google services
 * (Maps, Gmail, Calendar, Drive) are all listed above.
 */
