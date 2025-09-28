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

import React, { useState } from 'react';
import { Box, IconButton, TextField, Tooltip, Typography, alpha } from '@mui/material';
import { Check as CheckIcon, Close as CloseIcon, Add as AddIcon, Delete as DeleteIcon, EditOutlined as EditIcon } from '@mui/icons-material';
import { TreeItemLabel } from '@mui/x-tree-view/TreeItem';
import type { UseTreeItemLabelSlotOwnProps } from '@mui/x-tree-view/useTreeItem';
import { useTheme } from '../../context/ThemeContext';
import { useTreeOperations } from '../../context/TreeOperationsContext';
import type { SlyTreeItem } from '../../types/slyTree';

interface CustomLabelProps extends UseTreeItemLabelSlotOwnProps {
  editable: boolean;
  editing: boolean;
  toggleItemEditing: () => void;
  onDelete?: () => void;
  onAddChild?: () => void;
  itemData?: SlyTreeItem;
}

export const CustomLabel: React.FC<CustomLabelProps> = ({ editing, editable, children, toggleItemEditing, onDelete, onAddChild, itemData, ...other }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [editingKey, setEditingKey] = useState(false);
  const [editingValue, setEditingValue] = useState(false);
  const [keyValue, setKeyValue] = useState(itemData?.key || '');
  const [valueValue, setValueValue] = useState(itemData?.hasValue ? String(itemData.value ?? '') : '');
  const { theme } = useTheme();
  const { handleUpdateKey, handleUpdateValue } = useTreeOperations();

  const handleKeySave = () => {
    if (itemData && keyValue.trim()) handleUpdateKey(itemData.id, keyValue.trim());
    setEditingKey(false);
  };
  const handleValueSave = () => {
    if (itemData && valueValue.trim()) handleUpdateValue(itemData.id, valueValue);
    setEditingValue(false);
  };
  const handleKeyCancel = () => { setKeyValue(itemData?.key || ''); setEditingKey(false); };
  const handleValueCancel = () => { setValueValue(itemData?.hasValue ? String(itemData.value ?? '') : ''); setEditingValue(false); };

  return (
    <TreeItemLabel
      {...other}
      editable={false}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, px: 1, borderRadius: 1, minHeight: 32, transition: 'all 0.2s ease', '&:hover': { backgroundColor: alpha('#ffffff', 0.08) }, fontFamily: 'Monaco, "Cascadia Code", "SF Mono", consolas, monospace', fontSize: '0.85rem' }}
    >
      <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        {/* Key editing */}
        {editingKey ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <TextField size="small" value={keyValue} onChange={(e) => setKeyValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleKeySave(); if (e.key === 'Escape') handleKeyCancel(); }} sx={{ minWidth: 80, '& .MuiOutlinedInput-root': { backgroundColor: theme.custom.slyData.inputBackground, color: theme.palette.text.primary, fontSize: '0.85rem', border: `1px solid ${theme.custom.slyData.borderColor}`, '&:hover': { borderColor: theme.palette.primary.main }, '&.Mui-focused': { borderColor: theme.palette.primary.main, backgroundColor: theme.custom.slyData.focusBackground } } }} autoFocus />
            <IconButton size="small" onClick={handleKeySave} sx={{ color: theme.palette.success.main }}><CheckIcon fontSize="small" /></IconButton>
            <IconButton size="small" onClick={handleKeyCancel} sx={{ color: theme.palette.error.main }}><CloseIcon fontSize="small" /></IconButton>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', color: theme.custom.slyData.keyColor, fontWeight: 600 }} onClick={() => setEditingKey(true)}>
            <Typography variant="body2" sx={{ fontSize: '0.85rem', color: `${theme.custom.slyData.keyColor} !important`, fontWeight: 600 }}>{itemData?.key || 'key'}</Typography>
            {isHovered && (<IconButton size="small" sx={{ color: theme.palette.primary.main }}><EditIcon fontSize="small" /></IconButton>)}
          </Box>
        )}

        <Typography sx={{ color: theme.custom.slyData.separatorColor, mx: 0.5 }}>:</Typography>

        {/* Value editing */}
        {itemData?.hasValue || (!itemData?.children?.length) ? (
          editingValue ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <TextField size="small" value={valueValue} onChange={(e) => setValueValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleValueSave(); if (e.key === 'Escape') handleValueCancel(); }} sx={{ minWidth: 100, '& .MuiOutlinedInput-root': { backgroundColor: theme.custom.slyData.inputBackground, color: theme.palette.text.primary, fontSize: '0.85rem', border: `1px solid ${theme.custom.slyData.borderColor}`, '&:hover': { borderColor: theme.palette.primary.main }, '&.Mui-focused': { borderColor: theme.palette.primary.main, backgroundColor: theme.custom.slyData.focusBackground } } }} placeholder={!itemData?.hasValue ? 'Enter value...' : ''} autoFocus />
              <IconButton size="small" onClick={handleValueSave} sx={{ color: theme.palette.success.main }}><CheckIcon fontSize="small" /></IconButton>
              <IconButton size="small" onClick={handleValueCancel} sx={{ color: theme.palette.error.main }}><CloseIcon fontSize="small" /></IconButton>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', color: itemData?.hasValue ? theme.custom.slyData.valueColor : theme.custom.slyData.emptyColor }} onClick={() => setEditingValue(true)}>
              <Typography variant="body2" sx={{ fontSize: '0.85rem', fontStyle: !itemData?.hasValue ? 'italic' : 'normal', color: `${itemData?.hasValue ? theme.custom.slyData.valueColor : theme.custom.slyData.emptyColor} !important` }}>
                {itemData?.hasValue ? (typeof itemData.value === 'string' ? `"${itemData.value}"` : String(itemData.value)) : '{}'}
              </Typography>
              {isHovered && (<IconButton size="small" sx={{ color: '#2196F3' }}><EditIcon fontSize="small" /></IconButton>)}
            </Box>
          )
        ) : (
          <Typography sx={{ color: `${(theme as any).custom.slyData.emptyColor} !important`, fontStyle: 'italic' }}>{`{${itemData?.children?.length || 0} items}`}</Typography>
        )}
      </Box>

      {(isHovered || editingKey || editingValue) && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {onAddChild && (
            <Tooltip title="Add child item">
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); onAddChild(); }} sx={{ color: '#4CAF50', '&:hover': { backgroundColor: alpha('#4CAF50', 0.1) } }}>
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {onDelete && (
            <Tooltip title="Delete">
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDelete(); }} sx={{ color: (theme as any).custom.slyData.deleteIconColor, '&:hover': { backgroundColor: alpha((theme as any).custom.slyData.deleteIconColor, 0.1) } }}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}
    </TreeItemLabel>
  );
};
