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

export interface ImportDialogState { open: boolean; fileName: string; jsonData: any; hasExistingData: boolean; validationError: string | null; }

export const ImportDialog: React.FC<{ state: ImportDialogState; onConfirm: () => void; onCancel: () => void; currentRootCount: number; }> = ({ state, onConfirm, onCancel, currentRootCount }) => {
  const { theme } = useTheme();
  const hasError = Boolean(state.validationError);
  return (
    <Dialog open={state.open} onClose={onCancel} maxWidth="md" fullWidth>
      <DialogTitle sx={{ color: theme.palette.text.primary, backgroundColor: theme.palette.background.paper }}>{hasError ? 'Import Error' : 'Import JSON File'}</DialogTitle>
      <DialogContent sx={{ backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary }}>
        <Typography sx={{ mb: 2 }}>File: <strong>{state.fileName}</strong></Typography>
        {hasError ? (
          <>
            <Typography color="error" sx={{ mb: 2 }}>❌ Cannot import this file due to the following error:</Typography>
            <Box sx={{ p: 2, backgroundColor: alpha('#f44336', 0.1), borderRadius: 1, border: '1px solid #f44336', fontFamily: 'monospace', mb: 2, color: '#f44336' }}>{state.validationError}</Box>
            <Typography variant="body2" sx={{ color: '#90A4AE' }}>Please fix the JSON file and try importing again.</Typography>
          </>
        ) : (
          <>
            {state.hasExistingData && (
              <>
                <Typography color="warning.main" sx={{ mb: 2 }}>⚠️ This will replace all existing SlyData with the imported data.</Typography>
                <Typography sx={{ mb: 2 }}>Current SlyData contains {currentRootCount} root-level item{currentRootCount !== 1 ? 's' : ''}.</Typography>
              </>
            )}
            <Typography sx={{ mb: 2 }}>📁 Preview of data to import:</Typography>
            <Box sx={{ p: 2, backgroundColor: alpha('#4CAF50', 0.1), borderRadius: 1, border: '1px solid #4CAF50', fontFamily: 'monospace', mb: 2, maxHeight: 300, overflow: 'auto', fontSize: '0.85rem' }}>
              <pre>{JSON.stringify(state.jsonData, null, 2)}</pre>
            </Box>
            <Typography>{state.hasExistingData ? 'Do you want to replace the existing data with this imported data?' : 'Import this JSON data into SlyData?'}</Typography>
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ backgroundColor: theme.palette.background.paper }}>
        <Button onClick={onCancel} sx={{ color: theme.palette.text.secondary }}>{hasError ? 'Close' : 'Cancel'}</Button>
        {!hasError && <Button onClick={onConfirm} sx={{ color: theme.palette.success.main }}>{state.hasExistingData ? 'Replace Data' : 'Import'}</Button>}
      </DialogActions>
    </Dialog>
  );
};
