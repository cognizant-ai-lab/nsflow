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
