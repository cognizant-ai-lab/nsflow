/*
Copyright 2025 Cognizant Technology Solutions Corp, www.cognizant.com.

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
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography, Box } from '@mui/material';
import { useTheme } from '../../context/ThemeContext';

export const ClearAllDialog: React.FC<{ open: boolean; onConfirm: () => void; onCancel: () => void; rootCount: number; }> = ({ open, onConfirm, onCancel, rootCount }) => {
  const { theme } = useTheme();
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ color: theme.palette.text.primary, backgroundColor: theme.palette.background.paper }}>Clear All SlyData?</DialogTitle>
      <DialogContent sx={{ backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary }}>
        <Typography color="warning.main" sx={{ mb: 2, fontWeight: 600 }}>⚠️ This will permanently delete all SlyData including:</Typography>
        <Box sx={{ ml: 2, mb: 2 }}>
          <Typography sx={{ color: theme.palette.text.primary }}>• {rootCount} root-level item{rootCount !== 1 ? 's' : ''}</Typography>
          <Typography sx={{ color: theme.palette.text.primary }}>• All nested key-value pairs</Typography>
          <Typography sx={{ color: theme.palette.text.primary }}>• Cached data in browser storage</Typography>
        </Box>
        <Typography sx={{ color: theme.palette.text.primary, fontWeight: 500 }}>This action cannot be undone. Are you sure you want to clear all data?</Typography>
      </DialogContent>
      <DialogActions sx={{ backgroundColor: theme.palette.background.paper }}>
        <Button onClick={onCancel} sx={{ color: theme.palette.text.secondary }}>Cancel</Button>
        <Button onClick={onConfirm} sx={{ color: theme.palette.error.main }}>Clear All Data</Button>
      </DialogActions>
    </Dialog>
  );
};
