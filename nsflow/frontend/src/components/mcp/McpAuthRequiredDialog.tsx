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
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography, alpha,
} from '@mui/material';
import { useTheme } from '../../context/ThemeContext';

export interface McpAuthRequiredDialogProps {
  open: boolean;
  networkName: string;
  /** MCP server URLs this network needs but that aren't connected yet. */
  missing: string[];
  /**
   * Subset of `missing` that WAS connected but whose session expired and could
   * not be renewed - worded as "reconnect" rather than first-time "connect".
   */
  needsReauth?: string[];
  onOk: () => void;
}

/**
 * Shown when a selected network requires authenticated MCP servers the user has
 * not connected (or whose connection expired beyond silent refresh). Directs the
 * user to the Connectors tab; OK returns them home.
 */
export const McpAuthRequiredDialog: React.FC<McpAuthRequiredDialogProps> = ({
  open, networkName, missing, needsReauth = [], onOk,
}) => {
  const { theme } = useTheme();
  const reauth = new Set(needsReauth);
  // All-expired vs first-time (or mixed) determines the wording.
  const allReauth = missing.length > 0 && missing.every((url) => reauth.has(url));

  return (
    <Dialog open={open} onClose={onOk} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ color: theme.palette.text.primary, backgroundColor: theme.palette.background.paper }}>
        Authentication required
      </DialogTitle>
      <DialogContent sx={{ backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary }}>
        <Typography variant="body2" sx={{ mb: 2, color: theme.palette.text.secondary }}>
          {allReauth ? (
            networkName ? <>Your connection to MCP server(s) the agent network <b>{networkName}</b> uses
              has expired and could not be renewed:</> : 'Your connection to MCP server(s) this agent network uses has expired and could not be renewed:'
          ) : (
            networkName ? <>The agent network <b>{networkName}</b> needs access to MCP server(s) you
              haven't connected yet:</> : 'This agent network needs access to MCP server(s) you haven\'t connected yet:'
          )}
        </Typography>
        <Box
          sx={{
            mb: 2, p: 1, borderRadius: 1, fontFamily: 'monospace', fontSize: '0.8rem',
            wordBreak: 'break-all', backgroundColor: alpha(theme.palette.primary.main, 0.08),
            border: `1px solid ${theme.palette.divider}`, color: theme.palette.text.primary,
          }}
        >
          {missing.map((url) => (
            <div key={url}>
              {url}
              {!allReauth && reauth.has(url) && (
                <em style={{ color: theme.palette.warning.main }}> (expired - reconnect)</em>
              )}
            </div>
          ))}
        </Box>
        <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
          {allReauth
            ? <>Please reconnect them in the <b>Connectors</b> tab, then select this network again.</>
            : reauth.size > 0
              ? <>Please connect them - and reconnect the expired ones - in the <b>Connectors</b> tab first, then select this network again.</>
              : <>Please connect them in the <b>Connectors</b> tab first, then select this network again.</>}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ backgroundColor: theme.palette.background.paper }}>
        <Button onClick={onOk} sx={{ color: theme.palette.primary.main }}>OK</Button>
      </DialogActions>
    </Dialog>
  );
};

export default McpAuthRequiredDialog;
