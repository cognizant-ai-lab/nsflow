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
  TextField, Typography, alpha,
} from '@mui/material';
import { useTheme } from '../../context/ThemeContext';
import { KnownMcpServer } from './knownMcpServers';

export interface ConnectPreRegisteredServerDialogProps {
  /** The server being connected; the dialog is open while this is non-null. */
  server: KnownMcpServer | null;
  /** The OAuth callback URL the user must register on their OAuth app. */
  redirectUri: string;
  clientId: string;
  onClientIdChange: (value: string) => void;
  clientSecret: string;
  onClientSecretChange: (value: string) => void;
  onConnect: () => void;
  onCancel: () => void;
  /** True while the OAuth flow is starting or waiting for the popup to finish. */
  busy: boolean;
  /** Set once the popup is open and we're waiting on the user to authorize. */
  awaitingAuth: boolean;
  error: string | null;
}

/**
 * Connect a known MCP server that does NOT support Dynamic Client Registration:
 * the URL is fixed (no typing), but the user must register an OAuth app at the
 * provider - whose callback is the shown redirect URI - and paste its Client ID
 * (and Secret, for confidential clients). The flow is otherwise identical to the
 * one-click dialog: the server still 401s and the user still approves in a popup.
 */
export const ConnectPreRegisteredServerDialog: React.FC<ConnectPreRegisteredServerDialogProps> = ({
  server, redirectUri, clientId, onClientIdChange, clientSecret, onClientSecretChange,
  onConnect, onCancel, busy, awaitingAuth, error,
}) => {
  const { theme } = useTheme();
  // Client ID is required; the secret is optional (public PKCE client without it).
  const canConnect = clientId.trim().length > 0 && !busy && !awaitingAuth;
  const inputsDisabled = busy || awaitingAuth;

  return (
    <Dialog open={server !== null} onClose={busy ? undefined : onCancel} maxWidth="sm" fullWidth>
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
          {server?.name} doesn't support automatic client registration. Register an OAuth app with
          {' '}{server?.name}, set its callback / redirect URI to exactly the value below, then paste
          the resulting Client ID (and Secret, if any). A popup will then open for you to authorize.
        </Typography>

        <Typography variant="caption" sx={{ display: 'block', mb: 0.5, color: theme.palette.text.secondary }}>
          Redirect / callback URI to register:
        </Typography>
        {redirectUri && (
          <Box
            sx={{
              mb: 2, p: 1, borderRadius: 1, fontFamily: 'monospace', fontSize: '0.8rem',
              wordBreak: 'break-all', userSelect: 'all',
              backgroundColor: alpha(theme.palette.primary.main, 0.08),
              border: `1px solid ${theme.palette.divider}`, color: theme.palette.text.primary,
            }}
          >
            {redirectUri}
          </Box>
        )}

        <TextField
          autoFocus
          fullWidth
          size="small"
          label="Client ID"
          value={clientId}
          disabled={inputsDisabled}
          onChange={(e) => onClientIdChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canConnect) onConnect(); }}
          sx={{ mb: 2 }}
        />
        <TextField
          fullWidth
          size="small"
          type="password"
          label="Client Secret (optional)"
          value={clientSecret}
          disabled={inputsDisabled}
          onChange={(e) => onClientSecretChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canConnect) onConnect(); }}
          autoComplete="new-password"
          sx={{ mb: 2 }}
        />

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

export default ConnectPreRegisteredServerDialog;
