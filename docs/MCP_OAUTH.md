# MCP OAuth Connectors

nsflow can connect to **OAuth-protected MCP (Model Context Protocol) servers** so
that agent networks calling those servers are authenticated automatically — you
never have to paste a bearer token into the SlyData editor.

You connect a server once from the **Connectors** tab (a standard OAuth sign-in,
like Claude Desktop / the Claude console). nsflow stores the resulting tokens
locally and injects a fresh `Authorization` header into `sly_data.http_headers`
for any MCP URL the selected network references.

---

## How it works

- **OAuth runs on the backend.** nsflow performs the OAuth 2.1 authorization-code
  flow with **PKCE**, using **Dynamic Client Registration (DCR)** when the server
  supports it. The backend owns the loopback redirect URI and the token refresh
  logic; the frontend only opens the sign-in popup and lists/disconnects
  connections. Tokens are **never** returned to the UI.
- **Tokens are persisted locally** (including the refresh token) so connections
  survive a backend restart and can be refreshed without re-authenticating.
- **At chat time**, the backend reads the selected network's `sly_data_schema`,
  finds the MCP URLs it declares `http_headers` for, and — for each one you've
  connected — injects `sly_data.http_headers[<url>] = {"Authorization": "Bearer …"}`.
  Only URLs the network actually uses are injected. **User-supplied `http_headers`
  always win** over injected ones.
- **Secrets stay backend-only.** Credential headers (`Authorization`, etc.) are
  redacted at every point where `sly_data` could be logged or streamed back to
  the UI. Do not put secrets in `sly_data` yourself.

Relevant code: [`mcp_oauth_manager.py`](../nsflow/backend/utils/mcp/mcp_oauth_manager.py),
[`mcp_oauth_endpoints.py`](../nsflow/backend/api/v1/mcp_oauth_endpoints.py),
[`mcp_token_storage.py`](../nsflow/backend/utils/mcp/mcp_token_storage.py),
[`ns_websocket_utils.py`](../nsflow/backend/utils/agentutils/ns_websocket_utils.py),
[`McpConnectorsPanel.tsx`](../nsflow/frontend/src/components/mcp/McpConnectorsPanel.tsx).

---

## Using the Connectors tab

Open the **Connectors** tab. You'll see:

- **Quick Connect** — curated servers that support DCR. One click, nothing to
  enter: a popup opens, you approve, done. (Atlassian, Hugging Face, Intercom,
  Linear, Notion, PayPal, Postman, Sentry, Stripe, You.com, Zapier.)
- **Client ID/Secret** — curated servers that do **not** support DCR, so you must
  register an OAuth app at the provider and paste its Client ID (and Secret, if
  it's a confidential client). (Asana, GitHub, Gmail, Google Calendar, Google
  Drive, Google Maps, Salesforce, Slack.)
- **Add server** — connect any OAuth-protected MCP server by URL. Supply a Client
  ID/Secret only if the server has no DCR.

The catalog of curated servers lives in
[`knownMcpServers.ts`](../nsflow/frontend/src/components/mcp/knownMcpServers.ts),
which also documents servers deliberately excluded and why.

Connected servers appear in the list with a **Connected** chip (and an
**Auto-refresh** chip when a refresh token was issued). Click the trash icon to
disconnect — that deletes the stored credentials.

A connection whose token expired and could not be silently renewed (e.g. the
provider revoked the grant) shows a **Reconnect required** chip instead, with a
reconnect button that re-runs the sign-in — no credentials to re-enter:
pre-registered credentials are reused, and DCR servers register a fresh client
automatically. Until reconnected it behaves like a disconnected server: nothing
is injected, and selecting a network that needs it prompts you.

### Pre-registered servers (Client ID/Secret)

For servers without DCR (GitHub, Salesforce, …) you register an OAuth app once at
the provider, then paste its credentials into nsflow:

1. In the provider's developer console, create an OAuth app / client.
2. Set its **callback / redirect URI** to **exactly** the value nsflow shows in
   the connect dialog (see [Redirect URI](#the-redirect--callback-uri) below).
3. Enable the **authorization-code** flow and **PKCE**; request the scopes the MCP
   server needs.
4. Paste the resulting **Client ID** (and **Secret**, if any) into the dialog and
   click **Connect**. A popup opens for you to approve.

---

### Auth-optional servers (no 401 challenge)

Some MCP servers (e.g. **Google Maps**, **Hugging Face**) answer an
unauthenticated request with `200` and only require a token when you actually
call a tool. The standard OAuth flow can't start from that: the SDK begins
authorization only when the server returns a `401` challenge, which never comes.

nsflow handles these automatically. When the connect probe succeeds without
authenticating, the backend looks for the server's **protected-resource
metadata** (RFC 9728, at `/.well-known/oauth-protected-resource`). If it's
published — the signal that the server does support OAuth — nsflow retries the
probe with a **synthetic 401 challenge** pointing at that metadata, and the
normal flow (metadata fetch, client registration or your pre-registered
credentials, authorization, token exchange) runs from there unchanged. Scopes
come from the metadata, so you don't set them.

If a server serves anonymous requests and publishes **no** such metadata, it
either needs no auth (nothing to connect) or uses a scheme nsflow can't
bootstrap (e.g. API keys); the connect attempt reports that instead of the
generic "no 401 challenge" error.

> **Google (Maps, and Drive/Gmail/Calendar):** Google has no DCR, so register an
> OAuth client in the Google Cloud Console (Client ID/Secret), enable the
> relevant API, and add its scope to the consent screen. nsflow appends
> `access_type=offline` and `prompt=consent` to the authorization request so
> Google returns a **refresh token** (it omits one otherwise), which is what
> keeps the connection alive without re-authorizing.

## The redirect / callback URI

The provider redirects back to nsflow's callback route after you approve:

```text
http://<host>:<port>/api/v1/mcp/oauth/callback
```

Because nsflow runs locally, this is a **loopback** redirect (RFC 8252) — the
backend itself serves `/callback`, receives the authorization code, exchanges it
for tokens, and closes the popup.

### localhost vs 127.0.0.1 (handled automatically)

Providers match the redirect URI **character-for-character**, and they disagree on
the loopback host: some (e.g. **Salesforce**) reject the bare IP and require
`localhost`; others prefer `127.0.0.1`.

nsflow resolves this automatically: **the callback host follows whichever loopback
name you browse nsflow on.** Open nsflow at `http://localhost:4173` and it uses
`localhost`; open it at `http://127.0.0.1:4173` and it uses `127.0.0.1`. The
connect dialog (and `GET /api/v1/mcp/oauth/redirect_uri`) always show the exact
value that will be sent — **register that string**, and open nsflow the same way
you registered.

> Only loopback hosts are trusted from the request; a non-loopback `Host` header
> is ignored (it falls back to the configured default) so it can't steer the
> redirect to an external origin.

### Overriding the callback URL (proxied / remote / HTTPS deployments)

If nsflow runs behind a reverse proxy, on a remote host, or must present a fixed
HTTPS callback, set the full base URL explicitly — it is used verbatim and wins
over the automatic behavior:

```bash
export NSFLOW_PUBLIC_BASE_URL=https://nsflow.example.com
# -> https://nsflow.example.com/api/v1/mcp/oauth/callback
```

To force a specific loopback form regardless of how you browse:

```bash
export NSFLOW_PUBLIC_BASE_URL=http://localhost:4173
```

> **`NSFLOW_OAUTH_REDIRECT_PORT` (legacy — rarely needed).** Overrides only the
> *port* of the advertised callback. It predates the browse-host behavior above,
> which already picks up a port-mapped setup (Docker `-p`, SSH tunnel) from the
> address you browse on; and `NSFLOW_PUBLIC_BASE_URL` covers everything else.
> Prefer those. If set, it must still resolve to wherever `/callback` is served —
> the env vars change only the advertised URL, never where the backend listens.

---

## Environment variables

- **`NSFLOW_MCP_STORAGE_DIR`** — directory holding `tokens.json` (the credential
  store). Default: `~/.nsflow/mcp_oauth`.
- **`NSFLOW_PUBLIC_BASE_URL`** — full base URL override for the callback
  (proxied / remote / HTTPS deployments). Used verbatim; highest priority.
  Default: derived from the browse host / loopback.
- **`NSFLOW_OAUTH_REDIRECT_PORT`** — legacy port-only override for the advertised
  callback. Rarely needed: the browse host already carries the right port, and
  `NSFLOW_PUBLIC_BASE_URL` covers the rest. Default: `NSFLOW_PORT`.
- **`NSFLOW_HOST` / `NSFLOW_PORT`** — backend bind host / port. Default:
  `127.0.0.1` / `4173` (`8005` in dev).

---

## Token storage & security

- Credentials are stored in a single JSON file, `tokens.json`, under
  `NSFLOW_MCP_STORAGE_DIR` (default `~/.nsflow/mcp_oauth`), written `0600` with a
  cross-process lock. It contains the access token, refresh token, registered
  client info, and discovered token endpoint per server URL.
- Tokens are **never** sent to the frontend and are **redacted** anywhere
  `sly_data` might be logged or streamed.
- Disconnecting a server from the Connectors tab removes its entry from the file.
- nsflow keeps the access token fresh using the stored refresh token where the
  server supports it: when you select a network and at chat time, a token near
  expiry is exchanged silently (a standard OAuth refresh grant on the backend)
  before being injected. If a connection can no longer be refreshed (e.g. the
  grant was revoked), nsflow injects nothing, flags it **Reconnect required**
  in the Connectors tab, and prompts you when a selected network needs it —
  just **reconnect** it from the tab.

---

## Troubleshooting

**`redirect_uri_mismatch` / "redirect_uri must match configuration"** — the URI
nsflow sent isn't a byte-for-byte match with the one registered on the provider.
Usually `localhost` vs `127.0.0.1`, a port difference, or a trailing slash. Check
the exact value at `GET /api/v1/mcp/oauth/redirect_uri` (or the connect dialog)
and make the registered callback identical. Remember the callback follows the host
you browse nsflow on — open it the same way you registered (or register both
loopback forms if the provider allows multiple callback URLs).

**`unsupported_response_type` / "response type not supported"** — typically a
malformed authorize URL (e.g. a provider whose `authorization_endpoint` already
carries a query, producing a double `?`). nsflow normalizes these, so on current
builds this should not occur; if it does, capture the backend log line for the
authorize request and file it.

**Popup blocked** — allow popups for the nsflow origin and retry. nsflow also
polls the flow status as a fallback, so completion is still detected if the
popup can't message back.

**A network prompts you to connect before chatting** — if a network *requires* an
MCP URL you haven't connected — or one whose connection expired and could not be
renewed — nsflow surfaces a gate directing you to the Connectors tab. Connect (or
reconnect) the server, then retry.

Which URLs are *required* comes from the network's `sly_data_schema`: the
`http_headers.required` array (a sibling of `http_headers.properties`) lists the
URLs the network cannot function without. A network author who wants a URL to
receive an injected token **when connected** without *forcing* the connection —
because the server accepts an alternative credential (an API key via
`MCP_SERVERS_INFO_FILE`) or needs no auth at all — should declare it under
`http_headers.properties` but leave it out of `http_headers.required`. If a tool
declares no `required` array, every URL it declares is treated as required
(gate on all).
