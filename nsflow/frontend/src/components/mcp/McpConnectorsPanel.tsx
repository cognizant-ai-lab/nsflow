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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Avatar, Box, IconButton, List, ListItem, ListItemText, Paper, Tooltip, Typography, alpha, Button, Chip,
} from '@mui/material';
import {
  Hub as HubIcon, Add as AddIcon, Delete as DeleteIcon, Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { useTheme } from '../../context/ThemeContext';
import { useApiPort } from '../../context/ApiPortContext';
import { AddMcpServerDialog } from './AddMcpServerDialog';
import { ConnectKnownServerDialog } from './ConnectKnownServerDialog';
import { ConnectPreRegisteredServerDialog } from './ConnectPreRegisteredServerDialog';
import { KNOWN_MCP_SERVERS, KnownMcpServer } from './knownMcpServers';

interface McpConnection {
  server_url: string;
  obtained_at: number | null;
  expires_at: number | null;
  has_refresh_token: boolean;
  /** True when the token expired and the silent refresh failed - the user must reconnect. */
  needs_reauth: boolean;
}

interface OAuthMessage {
  type: string;
  status: string;
  server_url: string;
  message?: string;
}

// Normalize a server URL for comparison so a trailing slash / host case
// difference doesn't treat two forms of the same server as distinct. Module
// scope (pure) so handleConnect can reference it and the catalog map below.
const normalizeUrl = (u: string) => u.trim().replace(/\/+$/, '').toLowerCase();
// Catalog lookup by normalized URL (icons, extra authorize params). Built from
// the module constant, so it's stable across renders.
const KNOWN_BY_URL = new Map(KNOWN_MCP_SERVERS.map((s) => [normalizeUrl(s.url), s]));

const McpConnectorsPanel: React.FC = () => {
  const { theme } = useTheme();
  const { apiUrl, isReady } = useApiPort();

  const [connections, setConnections] = useState<McpConnection[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState('');
  const [busy, setBusy] = useState(false);
  const [awaitingAuth, setAwaitingAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The known DCR server being connected via the one-click dialog (null = closed).
  const [knownServer, setKnownServer] = useState<KnownMcpServer | null>(null);
  // The known pre-registered server being connected via the credentials dialog (null = closed).
  const [preRegServer, setPreRegServer] = useState<KnownMcpServer | null>(null);

  const popupRef = useRef<Window | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingServerRef = useRef<string | null>(null);
  // Consecutive non-terminal poll failures (transient 5xx / network blips); once
  // this exceeds the cap we give up so a persistently failing poll can't loop
  // forever with the dialog stuck busy.
  const pollErrorsRef = useRef(0);
  const MAX_POLL_ERRORS = 5;

  const clearPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const refreshConnections = useCallback(async () => {
    if (!isReady || !apiUrl) return;
    try {
      const res = await fetch(`${apiUrl}/api/v1/mcp/oauth/connections`);
      if (!res.ok) return;
      const data = await res.json();
      setConnections(Array.isArray(data?.connections) ? data.connections : []);
    } catch (err) {
      console.error('Failed to load MCP connections:', err);
    }
  }, [apiUrl, isReady]);

  useEffect(() => { refreshConnections(); }, [refreshConnections]);

  // Fetch the OAuth callback URL once so the dialog can show users the exact
  // value to register for servers that need manual OAuth app credentials.
  useEffect(() => {
    if (!isReady || !apiUrl) return;
    fetch(`${apiUrl}/api/v1/mcp/oauth/redirect_uri`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data?.redirect_uri) setRedirectUri(data.redirect_uri); })
      .catch((err) => console.error('Failed to fetch MCP redirect URI:', err));
  }, [apiUrl, isReady]);

  const finishSuccess = useCallback(() => {
    clearPolling();
    setBusy(false);
    setAwaitingAuth(false);
    setDialogOpen(false);
    setKnownServer(null);
    setPreRegServer(null);
    setServerUrl('');
    setClientId('');
    setClientSecret('');
    pendingServerRef.current = null;
    refreshConnections();
  }, [clearPolling, refreshConnections]);

  // Listen for the postMessage the /callback popup sends on completion.
  useEffect(() => {
    // The popup is served by our backend, so a trustworthy mcp-oauth message
    // can only originate from the backend's own origin. Reject anything else so
    // another page can't forge a payload that prematurely closes the dialog or
    // clears polling.
    let backendOrigin: string | null = null;
    try {
      if (apiUrl) backendOrigin = new URL(apiUrl).origin;
    } catch {
      backendOrigin = null;
    }
    const onMessage = (event: MessageEvent) => {
      if (!backendOrigin || event.origin !== backendOrigin) return;
      const data = event.data as OAuthMessage;
      if (!data || data.type !== 'mcp-oauth') return;
      // Only accept a message for the connect attempt currently in progress, and
      // only when its server_url matches exactly. This drops messages from a
      // directly-opened callback page, an unknown/expired-state callback (which
      // carries an empty server_url), or a late popup from a previous attempt -
      // none of which should disturb the current dialog/polling state.
      if (!pendingServerRef.current || data.server_url !== pendingServerRef.current) return;
      if (data.status === 'ok') {
        finishSuccess();
      } else {
        clearPolling();
        setBusy(false);
        setAwaitingAuth(false);
        // Clear the pending server so a late message from this attempt can't be
        // mistaken for a subsequent one (especially when retrying the same URL).
        pendingServerRef.current = null;
        setError(data.message || 'Authorization failed or was cancelled. Please try again.');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [finishSuccess, clearPolling, apiUrl]);

  useEffect(() => () => clearPolling(), [clearPolling]);

  const openDialog = () => {
    setServerUrl('');
    setClientId('');
    setClientSecret('');
    setError(null);
    setBusy(false);
    setAwaitingAuth(false);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (busy) return;
    clearPolling();
    // Drop any in-progress attempt so a late postMessage from an earlier popup
    // can't be treated as relevant to the next attempt, and close an orphaned
    // popup if the user cancels mid-authorization.
    pendingServerRef.current = null;
    setAwaitingAuth(false);
    if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    popupRef.current = null;
    setDialogOpen(false);
    setError(null);
  };

  // Poll status as a fallback when the popup can't postMessage (e.g. blocked).
  const startPolling = useCallback((flowId: string) => {
    clearPolling();
    pollErrorsRef.current = 0;
    // The server this poll belongs to. A poll's fetch may resolve after the
    // attempt has ended (cancel/close, success, or a new attempt started); if
    // the pending server no longer matches, the result is stale and must not
    // touch UI state - otherwise it could overwrite a successful connect with an
    // error or re-disable the dialog after cancel.
    const polledServer = pendingServerRef.current;
    const isStale = () => pendingServerRef.current !== polledServer;

    // Stop polling and re-enable the dialog with an error so the flow can never
    // be left stuck in a busy/awaiting state with Cancel disabled.
    const failFlow = (message: string) => {
      clearPolling();
      setBusy(false);
      setAwaitingAuth(false);
      // Clear the pending server so a late postMessage from this (now-failed)
      // flow can't be accepted as belonging to a later attempt.
      pendingServerRef.current = null;
      setError(message);
    };

    // Self-scheduling loop: the next poll is scheduled only after the current
    // one finishes, so a slow request can never overlap with the next tick (which
    // setInterval would allow - causing concurrent in-flight polls and
    // out-of-order updates).
    const scheduleNext = () => {
      pollTimerRef.current = setTimeout(poll, 1500);
    };

    const poll = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/v1/mcp/oauth/status/${flowId}`);
        // The attempt ended while this fetch was in flight - drop the result and
        // stop without mutating UI state or rescheduling.
        if (isStale()) {
          clearPolling();
          return;
        }
        if (res.status === 404) {
          // The flow is gone (expired/swept, or the backend restarted). It will
          // never complete, so treat it as terminal instead of polling forever.
          failFlow('The authorization session expired or was lost. Please try connecting again.');
          return;
        }
        if (!res.ok) {
          // Transient server error: tolerate a few, then give up.
          pollErrorsRef.current += 1;
          if (pollErrorsRef.current >= MAX_POLL_ERRORS) {
            failFlow('Lost contact with the server while authorizing. Please try again.');
          } else {
            scheduleNext();
          }
          return;
        }
        pollErrorsRef.current = 0;
        const data = await res.json();
        // Re-check: the attempt may have ended while res.json() awaited.
        if (isStale()) {
          clearPolling();
          return;
        }
        if (data.status === 'completed') {
          finishSuccess();
        } else if (data.status === 'error') {
          failFlow(data.error || 'Authorization failed. Please try again.');
        } else {
          // Still pending - poll again.
          scheduleNext();
        }
      } catch (err) {
        // Network error reaching the backend: also bounded by MAX_POLL_ERRORS.
        console.error('Error polling OAuth status:', err);
        // Ignore errors for an attempt that already ended; just stop.
        if (isStale()) {
          clearPolling();
          return;
        }
        pollErrorsRef.current += 1;
        if (pollErrorsRef.current >= MAX_POLL_ERRORS) {
          failFlow('Lost contact with the server while authorizing. Please try again.');
        } else {
          scheduleNext();
        }
      }
    };

    scheduleNext();
  }, [apiUrl, clearPolling, finishSuccess]);

  const handleConnect = useCallback(async () => {
    const url = serverUrl.trim();
    if (!url) return;
    if (!isReady || !apiUrl) {
      setError('Backend is not ready yet. Please wait a moment and try again.');
      return;
    }
    setBusy(true);
    setAwaitingAuth(false);
    setError(null);
    pendingServerRef.current = url;
    // Catalog-supplied authorize knobs (e.g. Google's access_type=offline) ride
    // along, matched on the normalized URL so they apply on Quick Connect,
    // pre-registered, reconnect, and a manually typed known URL.
    const extraAuthorizeParams = KNOWN_BY_URL.get(normalizeUrl(url))?.extraAuthorizeParams;
    try {
      const res = await fetch(`${apiUrl}/api/v1/mcp/oauth/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_url: url,
          ...(clientId.trim() ? { client_id: clientId.trim() } : {}),
          ...(clientSecret.trim() ? { client_secret: clientSecret.trim() } : {}),
          ...(extraAuthorizeParams ? { extra_authorize_params: extraAuthorizeParams } : {}),
        }),
      });
      // Parse defensively: a backend/proxy can return a non-JSON error body
      // (e.g. an HTML 502 from a gateway), which must not surface as a generic
      // network error that hides the real status.
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (!res.ok) {
        setBusy(false);
        pendingServerRef.current = null;
        setError(data?.detail || `Could not start the OAuth flow with this server (HTTP ${res.status}).`);
        return;
      }
      if (!data) {
        setBusy(false);
        pendingServerRef.current = null;
        setError('Received an unexpected (non-JSON) response while starting the OAuth flow.');
        return;
      }
      if (data.already_connected) {
        finishSuccess();
        return;
      }
      // Open a blank popup we control, sever its opener link, then navigate it to
      // the provider's consent screen. Nulling opener BEFORE the cross-origin
      // navigation stops the (server-supplied) consent page from reverse-
      // tabnabbing this window, while still returning a handle - unlike passing
      // "noopener" to window.open(), which returns null and would defeat the
      // blocked-popup detection and close-on-cancel below. The trade-off is that
      // the /callback page can no longer postMessage us, so completion is
      // detected via status polling (already the fallback).
      const popup = window.open('about:blank', 'mcp-oauth', 'popup,width=560,height=720');
      if (!popup) {
        // Popup was blocked by the browser. Without a window there is nothing to
        // drive the flow, so recover the dialog instead of leaving it stuck.
        setBusy(false);
        setError('Your browser blocked the authorization popup. Please allow popups for this site and try again.');
        pendingServerRef.current = null;
        return;
      }
      try {
        popup.opener = null;
      } catch {
        // Some browsers make opener read-only; best-effort hardening only.
      }
      popup.location.href = data.authorization_url;
      popupRef.current = popup;
      // Startup is done; we're now waiting on the user in the popup. Clear busy
      // so the dialog can be cancelled/closed during the wait (Connect stays
      // disabled via awaitingAuth) - otherwise the user is stuck until the
      // backend TTL if they abandon the popup without completing the redirect.
      setBusy(false);
      setAwaitingAuth(true);
      if (data.flow_id) startPolling(data.flow_id);
    } catch (err) {
      console.error('Failed to start MCP OAuth flow:', err);
      setBusy(false);
      setAwaitingAuth(false);
      pendingServerRef.current = null;
      setError('Network error starting the OAuth flow.');
    }
  }, [serverUrl, clientId, clientSecret, apiUrl, isReady, finishSuccess, startPolling]);

  const handleDisconnect = useCallback(async (url: string) => {
    // Guard like refreshConnections: without a resolved backend URL this would
    // fetch "undefined/api/..." - noisy and guaranteed to fail.
    if (!isReady || !apiUrl) return;
    try {
      await fetch(`${apiUrl}/api/v1/mcp/oauth/connections?server_url=${encodeURIComponent(url)}`, {
        method: 'DELETE',
      });
      refreshConnections();
    } catch (err) {
      console.error('Failed to disconnect MCP server:', err);
    }
  }, [apiUrl, isReady, refreshConnections]);

  // Shared preamble for opening any connect dialog: refuse mid-flow, then seed
  // serverUrl (which handleConnect reads) and clear leftover credentials/state
  // so the shared OAuth machinery runs a clean flow. Returns whether it is safe
  // for the caller to open its dialog.
  //
  // The mid-flow guard matters: a previous attempt may still have a popup open /
  // poll running, and resetting state without cancelling it lets a late poll or
  // postMessage close or error the newly opened dialog. (Today the modal
  // backdrop already blocks this; the guard protects the invariant.)
  const beginConnectAttempt = (url: string): boolean => {
    if (busy || awaitingAuth || pendingServerRef.current) return false;
    setError(null);
    setBusy(false);
    setAwaitingAuth(false);
    setClientId('');
    setClientSecret('');
    setServerUrl(url);
    return true;
  };

  // Open the one-click connect dialog for a known DCR server.
  const openKnownConnect = (server: KnownMcpServer) => {
    if (!beginConnectAttempt(server.url)) return;
    setKnownServer(server);
  };

  const closeKnownConnect = () => {
    if (busy) return;
    clearPolling();
    // Drop any in-progress attempt and close an orphaned popup, mirroring closeDialog.
    pendingServerRef.current = null;
    setAwaitingAuth(false);
    if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    popupRef.current = null;
    setKnownServer(null);
    setError(null);
  };

  // Open the credentials dialog for a known server without DCR. Like
  // openKnownConnect, but the user will supply a Client ID / Secret which
  // handleConnect passes to /start.
  const openPreRegConnect = (server: KnownMcpServer) => {
    if (!beginConnectAttempt(server.url)) return;
    setPreRegServer(server);
  };

  const closePreRegConnect = () => {
    if (busy) return;
    clearPolling();
    pendingServerRef.current = null;
    setAwaitingAuth(false);
    if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    popupRef.current = null;
    setPreRegServer(null);
    setError(null);
  };

  // Known servers the user hasn't connected yet (matched on a normalized URL so
  // a trailing slash / host case difference doesn't show an already-connected
  // server as still suggested), split by connection method.
  const connectedUrls = new Set(connections.map((c) => normalizeUrl(c.server_url)));
  const unconnected = KNOWN_MCP_SERVERS.filter((s) => !connectedUrls.has(normalizeUrl(s.url)));
  const dcrSuggestions = unconnected.filter((s) => s.auth !== 'pre_registered');
  const preRegSuggestions = unconnected.filter((s) => s.auth === 'pre_registered');

  // Re-run the OAuth flow for a connection whose silent refresh failed. Nothing
  // needs to be re-entered: pre-registered credentials are reused, and DCR
  // servers register a fresh client automatically. Known DCR servers get their
  // one-click dialog; everything else (custom or pre-registered) opens the
  // Add-server dialog pre-seeded with the URL, credentials optional.
  //
  // The flow is always seeded with conn.server_url - the exact key the token
  // store holds - never the catalog's canonical URL. If the two differ
  // cosmetically (e.g. a trailing slash from an original Add-server connect),
  // using the catalog form would create a second entry and orphan the marked
  // one as a permanent "Reconnect required" row.
  const openReconnect = (conn: McpConnection) => {
    if (!beginConnectAttempt(conn.server_url)) return;
    const known = KNOWN_BY_URL.get(normalizeUrl(conn.server_url));
    if (known && known.auth !== 'pre_registered') {
      setKnownServer(known);
    } else {
      setDialogOpen(true);
    }
  };

  // A titled row of clickable connector tiles; `onPick` opens the right dialog.
  const renderSuggestionGroup = (title: string, servers: KnownMcpServer[], onPick: (s: KnownMcpServer) => void) => {
    if (servers.length === 0) return null;
    return (
      <Box sx={{ p: 1.5, borderBottom: `1px solid ${theme.palette.divider}`, flexShrink: 0 }}>
        <Typography variant="caption" sx={{ display: 'block', mb: 1, color: theme.palette.text.secondary }}>
          {title}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {servers.map((s) => (
            <Tooltip key={s.id} title={`Connect ${s.name} — ${s.url}`}>
              <Box
                role="button"
                tabIndex={0}
                aria-label={`Connect ${s.name}`}
                onClick={() => onPick(s)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(s); }
                }}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.75, cursor: 'pointer',
                  border: `1px solid ${theme.palette.divider}`, borderRadius: 1,
                  backgroundColor: theme.palette.background.default,
                  '&:hover': { borderColor: theme.palette.primary.main, backgroundColor: alpha(theme.palette.primary.main, 0.06) },
                }}
              >
                <Avatar
                  src={s.iconUrl}
                  sx={{ width: 22, height: 22, fontSize: '0.7rem', p: '2px', bgcolor: '#fff', color: theme.palette.primary.main, '& img': { objectFit: 'contain' } }}
                >
                  {s.name.charAt(0)}
                </Avatar>
                <Typography variant="body2" sx={{ fontWeight: 500, color: theme.palette.text.primary }}>{s.name}</Typography>
              </Box>
            </Tooltip>
          ))}
        </Box>
      </Box>
    );
  };

  return (
    <Paper
      elevation={1}
      sx={{
        height: '100%', backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary,
        display: 'flex', flexDirection: 'column', overflow: 'hidden', border: `1px solid ${theme.palette.divider}`,
      }}
    >
      {/* Header */}
      <Box sx={{ p: 1.5, borderBottom: `1px solid ${theme.palette.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HubIcon sx={{ color: theme.palette.primary.main, fontSize: '1.25rem' }} />
          <Typography variant="subtitle1" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>MCP Connectors</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Tooltip title="Refresh">
            <IconButton
              size="small"
              aria-label="Refresh MCP connections"
              onClick={refreshConnections}
              sx={{ color: theme.palette.text.secondary, p: 0.5 }}
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={openDialog}
            sx={{ textTransform: 'none', color: theme.palette.primary.main }}
          >
            Add server
          </Button>
        </Box>
      </Box>

      {/* DCR servers connect in one click; pre-registered servers need the user
          to supply a Client ID / Secret from an OAuth app they register. */}
      {renderSuggestionGroup('Quick Connect', dcrSuggestions, openKnownConnect)}
      {renderSuggestionGroup('Client ID/Secret', preRegSuggestions, openPreRegConnect)}

      {/* Connections list */}
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 1 }}>
        {connections.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2, color: theme.palette.text.secondary }}>
            <HubIcon sx={{ fontSize: 48, color: theme.palette.text.disabled }} />
            <Typography variant="body1" sx={{ color: theme.palette.text.primary }}>No MCP servers connected</Typography>
            <Typography variant="body2" sx={{ textAlign: 'center', maxWidth: 320 }}>
              Connect an OAuth-protected MCP server. Its access token is injected into agent networks
              that use it, so you don't have to paste credentials manually.
            </Typography>
          </Box>
        ) : (
          <List dense>
            {connections.map((conn) => {
              const known = KNOWN_BY_URL.get(normalizeUrl(conn.server_url));
              return (
              <ListItem
                key={conn.server_url}
                sx={{
                  border: `1px solid ${theme.palette.divider}`, borderRadius: 1, mb: 1,
                  backgroundColor: theme.palette.background.default,
                  // MUI reserves 48px for ONE secondaryAction button; reauth rows
                  // show two, so widen the reserve or the URL text flows under them.
                  ...(conn.needs_reauth ? { pr: 12 } : {}),
                }}
                secondaryAction={
                  <Box component="span" sx={{ display: 'inline-flex', gap: 0.5 }}>
                    {conn.needs_reauth && (
                      <Tooltip title="Reconnect">
                        <IconButton
                          edge="end"
                          size="small"
                          aria-label={`Reconnect ${conn.server_url}`}
                          onClick={() => openReconnect(conn)}
                          sx={{ color: theme.palette.warning.main }}
                        >
                          <RefreshIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Disconnect">
                      <IconButton
                        edge="end"
                        size="small"
                        aria-label={`Disconnect ${conn.server_url}`}
                        onClick={() => handleDisconnect(conn.server_url)}
                        sx={{ color: theme.palette.error.main }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                }
              >
                {known ? (
                  <Tooltip title={conn.needs_reauth ? 'Reconnect required' : 'Connected'}>
                    <Avatar
                      src={known.iconUrl}
                      sx={{ width: 22, height: 22, mr: 1, fontSize: '0.7rem', p: '2px', bgcolor: '#fff', color: theme.palette.primary.main, '& img': { objectFit: 'contain' } }}
                    >
                      {known.name.charAt(0)}
                    </Avatar>
                  </Tooltip>
                ) : (
                  <CheckCircleIcon sx={{ color: conn.needs_reauth ? theme.palette.warning.main : theme.palette.success.main, fontSize: '1.1rem', mr: 1 }} />
                )}
                <ListItemText
                  primary={conn.server_url}
                  primaryTypographyProps={{ sx: { wordBreak: 'break-all', fontSize: '0.85rem' } }}
                  secondary={
                    <Box component="span" sx={{ display: 'inline-flex', gap: 0.5, mt: 0.5 }}>
                      {conn.needs_reauth ? (
                        <Chip size="small" label="Reconnect required" sx={{ height: 18, fontSize: '0.7rem', backgroundColor: alpha(theme.palette.warning.main, 0.15), color: theme.palette.warning.main }} />
                      ) : (
                        <>
                          <Chip size="small" label="Connected" sx={{ height: 18, fontSize: '0.7rem', backgroundColor: alpha(theme.palette.success.main, 0.15), color: theme.palette.success.main }} />
                          {conn.has_refresh_token && (
                            <Chip size="small" label="Auto-refresh" sx={{ height: 18, fontSize: '0.7rem', backgroundColor: alpha(theme.palette.primary.main, 0.12), color: theme.palette.primary.main }} />
                          )}
                        </>
                      )}
                    </Box>
                  }
                />
              </ListItem>
              );
            })}
          </List>
        )}
      </Box>

      <AddMcpServerDialog
        open={dialogOpen}
        serverUrl={serverUrl}
        onServerUrlChange={setServerUrl}
        clientId={clientId}
        onClientIdChange={setClientId}
        clientSecret={clientSecret}
        onClientSecretChange={setClientSecret}
        redirectUri={redirectUri}
        onConnect={handleConnect}
        onCancel={closeDialog}
        busy={busy}
        awaitingAuth={awaitingAuth}
        error={error}
      />

      <ConnectKnownServerDialog
        server={knownServer}
        onConnect={handleConnect}
        onCancel={closeKnownConnect}
        busy={busy}
        awaitingAuth={awaitingAuth}
        error={error}
      />

      <ConnectPreRegisteredServerDialog
        server={preRegServer}
        redirectUri={redirectUri}
        clientId={clientId}
        onClientIdChange={setClientId}
        clientSecret={clientSecret}
        onClientSecretChange={setClientSecret}
        onConnect={handleConnect}
        onCancel={closePreRegConnect}
        busy={busy}
        awaitingAuth={awaitingAuth}
        error={error}
      />
    </Paper>
  );
};

export default McpConnectorsPanel;
