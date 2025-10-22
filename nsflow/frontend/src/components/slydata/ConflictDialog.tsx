// Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
// All Rights Reserved.
// Issued under the Academic Public License.
//
// You can be released from the terms, and requirements of the Academic Public
// License by purchasing a commercial license.
// Purchase of a commercial license is mandatory for any use of the
// nsflow SDK Software in commercial settings.
//
// END COPYRIGHT

import React from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography, alpha } from '@mui/material';
import { useTheme } from '../../context/ThemeContext';

export interface ConflictDialogState { open: boolean; parentId: string; parentKey: string; currentValue: any; }

export const ConflictDialog: React.FC<{ state: ConflictDialogState; onConfirm: () => void; onCancel: () => void; }> = ({ state, onConfirm, onCancel }) => {
  const { theme } = useTheme();
  return (
    <Dialog open={state.open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ color: theme.palette.text.primary, backgroundColor: theme.palette.background.paper }}>Replace Current Value?</DialogTitle>
      <DialogContent sx={{ backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary }}>
        <Typography sx={{ mb: 2, color: theme.palette.text.primary }}>The key "{state.parentKey}" currently has a value:</Typography>
        <Box sx={{ p: 2, backgroundColor: alpha(theme.palette.primary.main, 0.1), borderRadius: 1, fontFamily: 'monospace', mb: 2, color: theme.custom.slyData.valueColor, border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}` }}>
          {typeof state.currentValue === 'string' ? `"${state.currentValue}"` : String(state.currentValue)}
        </Box>
        <Typography sx={{ color: theme.palette.text.primary }}>Adding a child key-value pair will replace this value with a nested object. Do you want to proceed?</Typography>
      </DialogContent>
      <DialogActions sx={{ backgroundColor: theme.palette.background.paper }}>
        <Button onClick={onCancel} sx={{ color: theme.palette.error.main }}>Cancel</Button>
        <Button onClick={onConfirm} sx={{ color: theme.palette.success.main }}>Replace Value</Button>
      </DialogActions>
    </Dialog>
  );
};
