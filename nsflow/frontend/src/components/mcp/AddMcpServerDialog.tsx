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
  Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  TextField, Typography, alpha,
} from '@mui/material';
import { useTheme } from '../../context/ThemeContext';

export interface AddMcpServerDialogProps {
  open: boolean;
  serverUrl: string;
  onServerUrlChange: (value: string) => void;
  /** Optional pre-registered OAuth client id (for servers without dynamic registration, e.g. GitHub). */
  clientId: string;
  onClientIdChange: (value: string) => void;
  /** Optional client secret (only for confidential clients). */
  clientSecret: string;
  onClientSecretChange: (value: string) => void;
  /** The OAuth callback URL to register when creating a manual OAuth app. */
  redirectUri: string;
  onConnect: () => void;
  onCancel: () => void;
  /** True while the OAuth flow is starting or waiting for the popup to finish. */
  busy: boolean;
  /** Set once the popup is open and we're waiting on the user to authorize. */
  awaitingAuth: boolean;
  error: string | null;
}

export const AddMcpServerDialog: React.FC<AddMcpServerDialogProps> = ({
  open, serverUrl, onServerUrlChange, clientId, onClientIdChange, clientSecret, onClientSecretChange,
  redirectUri, onConnect, onCancel, busy, awaitingAuth, error,
}) => {
  const { theme } = useTheme();
  const canConnect = serverUrl.trim().length > 0 && !busy;

  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ color: theme.palette.text.primary, backgroundColor: theme.palette.background.paper }}>
        Connect MCP Server
      </DialogTitle>
      <DialogContent sx={{ backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary }}>
        <Typography variant="body2" sx={{ mb: 2, color: theme.palette.text.secondary }}>
          Enter the URL of an OAuth-protected MCP server. A popup will open for you to sign in and
          authorize access. Tokens are stored locally on this machine and injected into the agent
          network automatically.
        </Typography>
        <TextField
          autoFocus
          fullWidth
          size="small"
          label="MCP Server URL"
          value={serverUrl}
          disabled={busy}
          onChange={(e) => onServerUrlChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canConnect) onConnect(); }}
          sx={{ mb: 2 }}
        />

        <Typography variant="caption" sx={{ display: 'block', mb: 1, color: theme.palette.text.secondary }}>
          Optional — only for servers that don't support dynamic client registration (e.g. GitHub).
          Register an OAuth app whose callback / redirect URI is exactly:
        </Typography>
        {redirectUri && (
          <Box
            sx={{
              mb: 1.5, p: 1, borderRadius: 1, fontFamily: 'monospace', fontSize: '0.8rem',
              wordBreak: 'break-all', userSelect: 'all',
              backgroundColor: alpha(theme.palette.primary.main, 0.08),
              border: `1px solid ${theme.palette.divider}`, color: theme.palette.text.primary,
            }}
          >
            {redirectUri}
          </Box>
        )}
        <TextField
          fullWidth
          size="small"
          label="Client ID (optional)"
          value={clientId}
          disabled={busy}
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
          disabled={busy}
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
        <Button onClick={onCancel} disabled={busy} sx={{ color: theme.palette.text.secondary }}>Cancel</Button>
        <Button onClick={onConnect} disabled={!canConnect} sx={{ color: theme.palette.primary.main }}>
          {busy ? 'Connecting…' : 'Connect'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
