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

import React from 'react';
import {
  Avatar, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Typography, alpha,
} from '@mui/material';
import { useTheme } from '../../context/ThemeContext';
import { KnownMcpServer } from './knownMcpServers';

export interface ConnectKnownServerDialogProps {
  /** The server being connected; the dialog is open while this is non-null. */
  server: KnownMcpServer | null;
  onConnect: () => void;
  onCancel: () => void;
  /** True while the OAuth flow is starting or waiting for the popup to finish. */
  busy: boolean;
  /** Set once the popup is open and we're waiting on the user to authorize. */
  awaitingAuth: boolean;
  error: string | null;
}

/**
 * One-click connect for a known DCR-capable MCP server: no URL or credential
 * fields - just the server's identity and a Connect button that runs the same
 * OAuth flow as the manual dialog. Mirrors the Claude-console connector UX.
 */
export const ConnectKnownServerDialog: React.FC<ConnectKnownServerDialogProps> = ({
  server, onConnect, onCancel, busy, awaitingAuth, error,
}) => {
  const { theme } = useTheme();
  // Connect is allowed only before/after an attempt, never while starting (busy)
  // or while waiting on the popup (awaitingAuth).
  const canConnect = !busy && !awaitingAuth;

  return (
    <Dialog open={server !== null} onClose={busy ? undefined : onCancel} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ color: theme.palette.text.primary, backgroundColor: theme.palette.background.paper }}>
        Connect {server?.name}
      </DialogTitle>
      <DialogContent sx={{ backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Avatar
            src={server?.iconUrl}
            sx={{ width: 36, height: 36, p: '3px', bgcolor: '#fff', color: theme.palette.primary.main, fontSize: '1rem', '& img': { objectFit: 'contain' } }}
          >
            {server?.name?.charAt(0)}
          </Avatar>
          <Typography variant="body2" sx={{ wordBreak: 'break-all', fontFamily: 'monospace', color: theme.palette.text.secondary }}>
            {server?.url}
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ mb: 2, color: theme.palette.text.secondary }}>
          A popup will open for you to sign in to {server?.name} and authorize access. No credentials
          to enter - the client is registered automatically. The token is stored locally on this
          machine and injected into agent networks that use this server.
        </Typography>

        {awaitingAuth && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, color: theme.palette.text.secondary }}>
            <CircularProgress size={16} />
            <Typography variant="body2">Waiting for authorization in the popup window…</Typography>
          </Box>
        )}
        {error && (
          <Box sx={{ p: 1.5, backgroundColor: alpha(theme.palette.error.main, 0.12), borderRadius: 1, border: `1px solid ${theme.palette.error.main}` }}>
            {/* Explicit color so the message isn't overridden by the global
                anchor/element color rules in index.css (which render blue). */}
            <Typography variant="body2" sx={{ color: theme.palette.error.main, fontWeight: 500, wordBreak: 'break-word' }}>
              {error}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ backgroundColor: theme.palette.background.paper }}>
        <Button onClick={onCancel} disabled={busy} sx={{ color: theme.palette.text.secondary }}>
          {awaitingAuth ? 'Close' : 'Cancel'}
        </Button>
        <Button onClick={onConnect} disabled={!canConnect} sx={{ color: theme.palette.primary.main }}>
          {busy ? 'Connecting…' : awaitingAuth ? 'Waiting…' : 'Connect'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConnectKnownServerDialog;
