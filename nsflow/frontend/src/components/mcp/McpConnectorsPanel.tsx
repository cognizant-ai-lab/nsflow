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
  Box, IconButton, List, ListItem, ListItemText, Paper, Tooltip, Typography, alpha, Button, Chip,
} from '@mui/material';
import {
  Hub as HubIcon, Add as AddIcon, Delete as DeleteIcon, Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { useTheme } from '../../context/ThemeContext';
import { useApiPort } from '../../context/ApiPortContext';
import { AddMcpServerDialog } from './AddMcpServerDialog';

interface McpConnection {
  server_url: string;
  obtained_at: number | null;
  expires_at: number | null;
  has_refresh_token: boolean;
}

interface OAuthMessage {
  type: string;
  status: string;
  server_url: string;
  message?: string;
}

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

  const popupRef = useRef<Window | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingServerRef = useRef<string | null>(null);
  // Consecutive non-terminal poll failures (transient 5xx / network blips); once
  // this exceeds the cap we give up so a persistently failing poll can't loop
  // forever with the dialog stuck busy.
  const pollErrorsRef = useRef(0);
  const MAX_POLL_ERRORS = 5;

  const clearPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
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

    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${apiUrl}/api/v1/mcp/oauth/status/${flowId}`);
        // The attempt ended while this fetch was in flight - drop the result and
        // stop this (now-orphaned) timer without mutating UI state.
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
        }
      } catch (err) {
        // Network error reaching the backend: also bounded by MAX_POLL_ERRORS.
        console.error('Error polling OAuth status:', err);
        // Ignore errors for an attempt that already ended; just stop the timer.
        if (isStale()) {
          clearPolling();
          return;
        }
        pollErrorsRef.current += 1;
        if (pollErrorsRef.current >= MAX_POLL_ERRORS) {
          failFlow('Lost contact with the server while authorizing. Please try again.');
        }
      }
    }, 1500);
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
    try {
      const res = await fetch(`${apiUrl}/api/v1/mcp/oauth/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_url: url,
          ...(clientId.trim() ? { client_id: clientId.trim() } : {}),
          ...(clientSecret.trim() ? { client_secret: clientSecret.trim() } : {}),
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
      // Open the provider's consent screen in a popup.
      popupRef.current = window.open(data.authorization_url, 'mcp-oauth', 'popup,width=560,height=720');
      if (!popupRef.current) {
        // Popup was blocked by the browser. Without a window there is nothing to
        // poll/postMessage, so recover the dialog instead of leaving it stuck.
        setBusy(false);
        setError('Your browser blocked the authorization popup. Please allow popups for this site and try again.');
        pendingServerRef.current = null;
        return;
      }
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
    try {
      await fetch(`${apiUrl}/api/v1/mcp/oauth/connections?server_url=${encodeURIComponent(url)}`, {
        method: 'DELETE',
      });
      refreshConnections();
    } catch (err) {
      console.error('Failed to disconnect MCP server:', err);
    }
  }, [apiUrl, refreshConnections]);

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
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>MCP Connectors</Typography>
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
            {connections.map((conn) => (
              <ListItem
                key={conn.server_url}
                sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 1, mb: 1, backgroundColor: theme.palette.background.default }}
                secondaryAction={
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
                }
              >
                <CheckCircleIcon sx={{ color: theme.palette.success.main, fontSize: '1.1rem', mr: 1 }} />
                <ListItemText
                  primary={conn.server_url}
                  primaryTypographyProps={{ sx: { wordBreak: 'break-all', fontSize: '0.85rem' } }}
                  secondary={
                    <Box component="span" sx={{ display: 'inline-flex', gap: 0.5, mt: 0.5 }}>
                      <Chip size="small" label="Connected" sx={{ height: 18, fontSize: '0.7rem', backgroundColor: alpha(theme.palette.success.main, 0.15), color: theme.palette.success.main }} />
                      {conn.has_refresh_token && (
                        <Chip size="small" label="Auto-refresh" sx={{ height: 18, fontSize: '0.7rem', backgroundColor: alpha(theme.palette.primary.main, 0.12), color: theme.palette.primary.main }} />
                      )}
                    </Box>
                  }
                />
              </ListItem>
            ))}
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
    </Paper>
  );
};

export default McpConnectorsPanel;
