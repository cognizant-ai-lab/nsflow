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
import { Box, IconButton } from '@mui/material';
import { Check as CheckIcon, Close as CloseIcon } from '@mui/icons-material';
import { TreeItemLabelInput } from '@mui/x-tree-view/TreeItemLabelInput';
import type { UseTreeItemLabelInputSlotOwnProps } from '@mui/x-tree-view/useTreeItem';
import { useTheme } from '../../context/ThemeContext';

interface CustomLabelInputProps extends UseTreeItemLabelInputSlotOwnProps {
  handleCancelItemLabelEditing: (event: React.SyntheticEvent) => void;
  handleSaveItemLabel: (event: React.SyntheticEvent, label: string) => void;
  value: string;
}

export const CustomLabelInput = React.forwardRef<HTMLInputElement, CustomLabelInputProps>(function CustomLabelInput(
  props: CustomLabelInputProps,
  ref
) {
  const { handleCancelItemLabelEditing, handleSaveItemLabel, value, ...other } = props;
  const { theme } = useTheme();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
      <TreeItemLabelInput
        {...other}
        ref={ref}
        value={value}
        sx={{ flexGrow: 1, '& .MuiOutlinedInput-root': { backgroundColor: theme.custom.slyData.inputBackground, color: theme.palette.text.primary, fontSize: '0.85rem', fontFamily: 'Monaco, "Cascadia Code", "SF Mono", consolas, monospace' } }}
      />
      <IconButton color="success" size="small" onClick={(event: React.MouseEvent) => { handleSaveItemLabel(event, value); }} sx={{ color: theme.custom.slyData.addIconColor }}>
        <CheckIcon fontSize="small" />
      </IconButton>
      <IconButton color="error" size="small" onClick={handleCancelItemLabelEditing} sx={{ color: theme.custom.slyData.deleteIconColor }}>
        <CloseIcon fontSize="small" />
      </IconButton>
    </Box>
  );
});
