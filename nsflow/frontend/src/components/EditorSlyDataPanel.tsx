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

import { useState, useEffect, useCallback } from 'react';
import * as React from 'react';
import { RichTreeView } from '@mui/x-tree-view/RichTreeView';
import { TreeViewItemId } from '@mui/x-tree-view/models';
import { TreeItem, TreeItemLabel, TreeItemProps } from '@mui/x-tree-view/TreeItem';
import { TreeItemLabelInput } from '@mui/x-tree-view/TreeItemLabelInput';
import { useTreeItemUtils } from '@mui/x-tree-view/hooks';
import { 
  Box, 
  Typography, 
  IconButton, 
  Paper,
  Tooltip,
  alpha,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField
} from '@mui/material';
import { 
  EditOutlined as EditIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  DataObject as DataObjectIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
  ExpandMore as ExpandAllIcon,
  ExpandLess as CollapseAllIcon
} from '@mui/icons-material';
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import ScrollableMessageContainer from "./ScrollableMessageContainer";
import {
  UseTreeItemLabelInputSlotOwnProps,
  UseTreeItemLabelSlotOwnProps,
} from '@mui/x-tree-view/useTreeItem';
import { useChatContext } from '../context/ChatContext';
import { useApiPort } from '../context/ApiPortContext';
import { useTheme } from '../context/ThemeContext';

// Create context for tree operations
interface TreeOperationsContextType {
  handleDeleteItem: (id: string) => void;
  handleAddItem: (parentId: string) => void;
  handleAddWithConflictCheck: (parentId: string) => void;
  handleUpdateKey: (id: string, newKey: string) => void;
  handleUpdateValue: (id: string, newValue: any) => void;
  treeData: SlyTreeItem[];
}

const TreeOperationsContext = React.createContext<TreeOperationsContextType | null>(null);

const useTreeOperations = () => {
  const context = React.useContext(TreeOperationsContext);
  if (!context) {
    throw new Error('useTreeOperations must be used within TreeOperationsProvider');
  }
  return context;
};

interface SlyTreeItem {
  id: string;
  label: string;
  children?: SlyTreeItem[];
  isKeyValuePair?: boolean;
  key?: string;
  value?: any;
  type?: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  parentId?: string;
  depth?: number;
  hasValue?: boolean; // true if item has a primitive value, false if it has children
}

interface CustomLabelProps extends UseTreeItemLabelSlotOwnProps {
  editable: boolean;
  editing: boolean;
  toggleItemEditing: () => void;
  onDelete?: () => void;
  onAddChild?: () => void;
  itemData?: SlyTreeItem;
}

interface CustomLabelInputProps extends UseTreeItemLabelInputSlotOwnProps {
  handleCancelItemLabelEditing: (event: React.SyntheticEvent) => void;
  handleSaveItemLabel: (event: React.SyntheticEvent, label: string) => void;
  value: string;
}

// Custom Label Component with separate key/value editing
const CustomLabel = ({
  editing,
  editable,
  children,
  toggleItemEditing,
  onDelete,
  onAddChild,
  itemData,
  ...other
}: CustomLabelProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const [editingKey, setEditingKey] = useState(false);
  const [editingValue, setEditingValue] = useState(false);
  const [keyValue, setKeyValue] = useState(itemData?.key || '');
  const [valueValue, setValueValue] = useState(
    itemData?.hasValue ? String(itemData.value || '') : ''
  );

  const { theme } = useTheme();
  const { handleUpdateKey, handleUpdateValue } = useTreeOperations();

  const handleKeySave = () => {
    if (itemData && keyValue.trim()) {
      handleUpdateKey(itemData.id, keyValue.trim());
    }
    setEditingKey(false);
  };

  const handleValueSave = () => {
    if (itemData && valueValue.trim()) {
      handleUpdateValue(itemData.id, valueValue);
    }
    setEditingValue(false);
  };

  const handleKeyCancel = () => {
    setKeyValue(itemData?.key || '');
    setEditingKey(false);
  };

  const handleValueCancel = () => {
    setValueValue(itemData?.hasValue ? String(itemData.value || '') : '');
    setEditingValue(false);
  };

  return (
    <TreeItemLabel
      {...other}
      editable={false} // We handle editing manually
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        py: 0.5,
        px: 1,
        // ml: `${indentLevel}px`, // Indentation now handled at TreeItem level
        borderRadius: 1,
        minHeight: 32,
        transition: 'all 0.2s ease',
        '&:hover': {
          backgroundColor: alpha('#ffffff', 0.08),
        },
        fontFamily: 'Monaco, "Cascadia Code", "SF Mono", consolas, monospace',
        fontSize: '0.85rem',
      }}
    >
      <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        {/* Key editing */}
        {editingKey ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <TextField
              size="small"
              value={keyValue}
              onChange={(e) => setKeyValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleKeySave();
                if (e.key === 'Escape') handleKeyCancel();
              }}
              sx={{
                minWidth: 80,
                '& .MuiOutlinedInput-root': {
                  backgroundColor: theme.custom.slyData.inputBackground,
                  color: theme.palette.text.primary,
                  fontSize: '0.85rem',
                  border: `1px solid ${theme.custom.slyData.borderColor}`,
                  '&:hover': {
                    borderColor: theme.palette.primary.main,
                  },
                  '&.Mui-focused': {
                    borderColor: theme.palette.primary.main,
                    backgroundColor: theme.custom.slyData.focusBackground,
                  }
                }
              }}
              autoFocus
            />
            <IconButton size="small" onClick={handleKeySave} sx={{ color: theme.palette.success.main }}>
              <CheckIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={handleKeyCancel} sx={{ color: theme.palette.error.main }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        ) : (
          <Box 
            sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 0.5,
              cursor: 'pointer',
              color: theme.custom.slyData.keyColor,
              fontWeight: 600
            }}
            onClick={() => setEditingKey(true)}
          >
            <Typography 
              variant="body2" 
              sx={{ 
                fontSize: '0.85rem',
                color: `${theme.custom.slyData.keyColor} !important`,
                fontWeight: 600
              }}
            >
              {itemData?.key || 'key'}
            </Typography>
            {isHovered && (
              <IconButton size="small" sx={{ color: theme.palette.primary.main }}>
                <EditIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        )}

        <Typography sx={{ color: theme.custom.slyData.separatorColor, mx: 0.5 }}>:</Typography>

        {/* Value editing */}
        {itemData?.hasValue || (!itemData?.children?.length) ? (
          editingValue ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <TextField
                size="small"
                value={valueValue}
                onChange={(e) => setValueValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleValueSave();
                  if (e.key === 'Escape') handleValueCancel();
                }}
                sx={{
                  minWidth: 100,
                  '& .MuiOutlinedInput-root': {
                    backgroundColor: theme.custom.slyData.inputBackground,
                    color: theme.palette.text.primary,
                    fontSize: '0.85rem',
                    border: `1px solid ${theme.custom.slyData.borderColor}`,
                    '&:hover': {
                      borderColor: theme.palette.primary.main,
                    },
                    '&.Mui-focused': {
                      borderColor: theme.palette.primary.main,
                      backgroundColor: theme.custom.slyData.focusBackground,
                    }
                  }
                }}
                placeholder={!itemData?.hasValue ? "Enter value..." : ""}
                autoFocus
              />
              <IconButton size="small" onClick={handleValueSave} sx={{ color: theme.palette.success.main }}>
                <CheckIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={handleValueCancel} sx={{ color: theme.palette.error.main }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          ) : (
            <Box 
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 0.5,
                cursor: 'pointer',
                color: itemData?.hasValue ? theme.custom.slyData.valueColor : theme.custom.slyData.emptyColor,
              }}
              onClick={() => setEditingValue(true)}
            >
              <Typography 
                variant="body2" 
                sx={{ 
                  fontSize: '0.85rem',
                  fontStyle: !itemData?.hasValue ? 'italic' : 'normal',
                  color: `${itemData?.hasValue ? theme.custom.slyData.valueColor : theme.custom.slyData.emptyColor} !important`
                }}
              >
                {itemData?.hasValue 
                  ? (typeof itemData.value === 'string' 
                      ? `"${itemData.value}"` 
                      : String(itemData.value))
                  : '{}'}
              </Typography>
              {isHovered && (
                <IconButton size="small" sx={{ color: '#2196F3' }}>
                  <EditIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          )
        ) : (
          <Typography 
            sx={{ 
              color: `${theme.custom.slyData.emptyColor} !important`, 
              fontStyle: 'italic' 
            }}
          >
            {`{${itemData.children.length} items}`}
          </Typography>
        )}
      </Box>
      
      {(isHovered || editingKey || editingValue) && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {onAddChild && (
            <Tooltip title="Add child item">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddChild();
                }}
                sx={{ 
                  color: '#4CAF50',
                  '&:hover': { backgroundColor: alpha('#4CAF50', 0.1) }
                }}
              >
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          
          {onDelete && (
            <Tooltip title="Delete">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                sx={{ 
                  color: theme.custom.slyData.deleteIconColor,
                  '&:hover': { backgroundColor: alpha(theme.custom.slyData.deleteIconColor, 0.1) }
                }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}
    </TreeItemLabel>
  );
};

// Custom Label Input Component
const CustomLabelInput = React.forwardRef<HTMLInputElement, CustomLabelInputProps>(
  function CustomLabelInput(props: CustomLabelInputProps, ref: React.Ref<HTMLInputElement>) {
    const { handleCancelItemLabelEditing, handleSaveItemLabel, value, ...other } = props;
    const { theme } = useTheme();

    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
        <TreeItemLabelInput 
          {...other} 
          ref={ref}
          value={value}
          sx={{
            flexGrow: 1,
            '& .MuiOutlinedInput-root': {
              backgroundColor: theme.custom.slyData.inputBackground,
              color: theme.palette.text.primary,
              fontSize: '0.85rem',
              fontFamily: 'Monaco, "Cascadia Code", "SF Mono", consolas, monospace',
            }
          }}
        />
        <IconButton
          color="success"
          size="small"
          onClick={(event: React.MouseEvent) => {
            handleSaveItemLabel(event, value);
          }}
          sx={{ color: theme.custom.slyData.addIconColor }}
        >
          <CheckIcon fontSize="small" />
        </IconButton>
        <IconButton 
          color="error" 
          size="small" 
          onClick={handleCancelItemLabelEditing}
          sx={{ color: theme.custom.slyData.deleteIconColor }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
    );
  }
);

// Custom Tree Item Component  
const CustomTreeItem = React.forwardRef<HTMLLIElement, TreeItemProps>(
  function CustomTreeItem(props: TreeItemProps, ref: React.Ref<HTMLLIElement>) {
    const { handleDeleteItem, handleAddWithConflictCheck, treeData } = useTreeOperations();
    const { interactions, status } = useTreeItemUtils({
      itemId: props.itemId,
      children: props.children,
    });

    // Find current item data
    const itemData = treeData.find(item => item.id === props.itemId) ||
                     treeData.flatMap(item => getAllNestedItems(item)).find(item => item.id === props.itemId);

    const handleContentDoubleClick: UseTreeItemLabelSlotOwnProps['onDoubleClick'] = (event) => {
      event.defaultMuiPrevented = true;
    };

    const handleInputBlur: UseTreeItemLabelInputSlotOwnProps['onBlur'] = (event) => {
      event.defaultMuiPrevented = true;
    };

    const handleInputKeyDown: UseTreeItemLabelInputSlotOwnProps['onKeyDown'] = (event) => {
      event.defaultMuiPrevented = true;
    };

    const handleDelete = () => {
      if (itemData?.id && itemData.id !== 'root') {
        handleDeleteItem(itemData.id);
      }
    };

    const handleAddChild = () => {
      if (itemData?.id) {
        handleAddWithConflictCheck(itemData.id);
      }
    };

    const indentLevel = (itemData?.depth || 0) * 8; // 8px per level (same as user's change)

    return (
      <TreeItem
        {...props}
        ref={ref}
        slots={{ label: CustomLabel, labelInput: CustomLabelInput }}
        slotProps={{
          label: {
            onDoubleClick: handleContentDoubleClick,
            editable: status.editable,
            editing: status.editing,
            toggleItemEditing: interactions.toggleItemEditing,
            itemData,
            onDelete: handleDelete, // All items can be deleted now
            onAddChild: handleAddChild,
          } as CustomLabelProps,
          labelInput: {
            onBlur: handleInputBlur,
            onKeyDown: handleInputKeyDown,
            handleCancelItemLabelEditing: interactions.handleCancelItemLabelEditing,
            handleSaveItemLabel: interactions.handleSaveItemLabel,
          } as CustomLabelInputProps,
        }}
        sx={{
          '& > .MuiTreeItem-content': {
            marginLeft: `${indentLevel}px`, // Indent the entire content including collapse arrow
          }
        }}
      />
    );
  }
);

const EditorSlyDataPanel: React.FC = () => {
  const { slyDataMessages, targetNetwork } = useChatContext();
  const { apiUrl } = useApiPort();
  const { theme } = useTheme();

  const [treeData, setTreeData] = useState<SlyTreeItem[]>([]);
  const [expandedItems, setExpandedItems] = useState<TreeViewItemId[]>([]);
  const [nextId, setNextId] = useState(1);
  const [conflictDialog, setConflictDialog] = useState<{
    open: boolean;
    parentId: string;
    parentKey: string;
    currentValue: any;
  }>({ open: false, parentId: '', parentKey: '', currentValue: null });

  const [importDialog, setImportDialog] = useState<{
    open: boolean;
    fileName: string;
    jsonData: any;
    hasExistingData: boolean;
    validationError: string | null;
  }>({ open: false, fileName: '', jsonData: null, hasExistingData: false, validationError: null });

  const [clearDialog, setClearDialog] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null);
  const [lastMessageCount, setLastMessageCount] = useState(0);

  // Cache keys
  const CACHE_VERSION = '1.0';
  
  // Create network-specific cache key
  const getCacheKey = useCallback((networkName: string) => {
    return `nsflow-slydata-${networkName}`;
  }, []);

  // Cache management functions
  const saveSlyDataToCache = useCallback((data: SlyTreeItem[], networkName: string) => {
    if (!networkName) {
      console.debug('No network name provided, skipping cache save');
      return;
    }
    
    try {
      const cacheKey = getCacheKey(networkName);
      const cacheData = {
        version: CACHE_VERSION,
        timestamp: Date.now(),
        data: data,
        nextId: nextId,
        networkName
      };
      localStorage.setItem(cacheKey, JSON.stringify(cacheData));
      console.debug('Cache saved successfully for network:', networkName, { itemCount: data.length, nextId, timestamp: cacheData.timestamp });
    } catch (error) {
      console.warn('Failed to save SlyData to cache for network:', networkName, error);
    }
  }, [getCacheKey, CACHE_VERSION, nextId]);

  const loadSlyDataFromCache = useCallback((networkName: string): { data: SlyTreeItem[]; nextId: number } | null => {
    if (!networkName) {
      console.debug('No network name provided, skipping cache load');
      return null;
    }
    
    try {
      const cacheKey = getCacheKey(networkName);
      const cached = localStorage.getItem(cacheKey);
      if (!cached) {
        console.debug('No cache found for network:', networkName);
        return null;
      }

      const cacheData = JSON.parse(cached);
      console.debug('Cache found for network:', networkName, { version: cacheData.version, itemCount: cacheData.data?.length, nextId: cacheData.nextId });
      
      // Version check
      if (cacheData.version !== CACHE_VERSION) {
        console.warn('Cache version mismatch for network:', networkName, 'clearing cache');
        localStorage.removeItem(cacheKey);
        return null;
      }

      // Data validation
      if (!Array.isArray(cacheData.data)) {
        console.warn('Invalid cache data format for network:', networkName, 'clearing cache');
        localStorage.removeItem(cacheKey);
        return null;
      }

      // Verify network name matches (extra safety check)
      if (cacheData.networkName && cacheData.networkName !== networkName) {
        console.warn('Network name mismatch in cache for:', networkName, 'expected:', networkName, 'found:', cacheData.networkName);
        localStorage.removeItem(cacheKey);
        return null;
      }

      return {
        data: cacheData.data,
        nextId: cacheData.nextId || 1
      };
    } catch (error) {
      console.warn('Failed to load SlyData from cache for network:', networkName, error);
      const cacheKey = getCacheKey(networkName);
      localStorage.removeItem(cacheKey);
      return null;
    }
  }, [getCacheKey, CACHE_VERSION]);

  const clearSlyDataCache = useCallback((networkName?: string) => {
    try {
      if (networkName) {
        // Clear cache for specific network
        const cacheKey = getCacheKey(networkName);
        localStorage.removeItem(cacheKey);
        console.debug('Cache cleared for network:', networkName);
      } else {
        // Clear all slydata caches (legacy support and for clear all functionality)
        const allKeys = Object.keys(localStorage);
        const slyDataKeys = allKeys.filter(key => key.startsWith('nsflow-slydata-'));
        slyDataKeys.forEach(key => localStorage.removeItem(key));
        console.debug('All SlyData caches cleared:', slyDataKeys.length, 'caches');
      }
    } catch (error) {
      console.warn('Failed to clear SlyData cache:', error);
    }
  }, [getCacheKey]);

  // Initialize with cached data or empty structure when network changes
  useEffect(() => {
    if (!isInitialized || !targetNetwork) {
      if (targetNetwork) {
        const cached = loadSlyDataFromCache(targetNetwork);
        if (cached && cached.data.length > 0) {
          setTreeData(cached.data);
          setNextId(cached.nextId);
          console.log('SlyData loaded from cache for network:', targetNetwork, cached.data.length, 'items');
        } else {
          setTreeData([]); // Start completely empty
          console.log('SlyData starting empty for network:', targetNetwork, '- no cache found');
        }
        setIsInitialized(true);
      }
    }
  }, [isInitialized, targetNetwork, loadSlyDataFromCache]);

  // Load cached data when switching between networks
  useEffect(() => {
    if (isInitialized && targetNetwork) {
      const cached = loadSlyDataFromCache(targetNetwork);
      if (cached && cached.data.length > 0) {
        setTreeData(cached.data);
        setNextId(cached.nextId);
        console.log('SlyData loaded from cache for network switch:', targetNetwork, cached.data.length, 'items');
      } else {
        setTreeData([]); // Start empty for new network
        console.log('SlyData starting empty for new network:', targetNetwork);
      }
    }
  }, [targetNetwork, loadSlyDataFromCache, isInitialized]);

  // Save to cache whenever treeData changes (but only after initialization)
  useEffect(() => {
    if (isInitialized && targetNetwork) {
      if (treeData.length > 0) {
        saveSlyDataToCache(treeData, targetNetwork);
        console.log('SlyData saved to cache for network:', targetNetwork, treeData.length, 'items');
      } else {
        // Clear cache when data is empty (but only if we're initialized)
        clearSlyDataCache(targetNetwork);
        console.log('SlyData cache cleared for network:', targetNetwork, '- no items');
      }
    }
  }, [treeData, isInitialized, targetNetwork, saveSlyDataToCache, clearSlyDataCache]);

  // Generate unique ID
  const generateId = useCallback(() => {
    const id = `item_${nextId}`;
    setNextId(prev => prev + 1);
    return id;
  }, [nextId]);

  // Convert JSON to tree structure
  const jsonToTreeData = useCallback((json: any, parentId?: string, depth = 0): SlyTreeItem[] => {
    if (!json || typeof json !== 'object') return [];

    let idCounter = nextId;
    const generateLocalId = () => `item_${idCounter++}`;

    const convertObject = (obj: any, currentDepth: number, currentParentId?: string): SlyTreeItem[] => {
      return Object.entries(obj).map(([key, value]) => {
        const id = generateLocalId();
        const hasValue = typeof value !== 'object' || value === null;
        const item: SlyTreeItem = {
          id,
          label: hasValue ? `${key}: ${JSON.stringify(value)}` : `${key}`,
          key,
          value: hasValue ? value : undefined,
          parentId: currentParentId,
          isKeyValuePair: true,
          type: Array.isArray(value) ? 'array' : typeof value as any,
          depth: currentDepth,
          hasValue,
        };

        if (typeof value === 'object' && value !== null) {
          item.children = convertObject(value, currentDepth + 1, id);
        }

        return item;
      });
    };

    const result = convertObject(json, depth, parentId);
    
    // Update the nextId state with the final counter value
    setNextId(idCounter);
    
    return result;
  }, [nextId]);

  // Convert tree data to JSON
  const treeDataToJson = useCallback((items: SlyTreeItem[]): any => {
    const result: any = {};
    
    items.forEach(item => {
      if (item.isKeyValuePair && item.key) {
        if (item.children && item.children.length > 0) {
          result[item.key] = treeDataToJson(item.children);
        } else {
          result[item.key] = item.value;
        }
      }
    });

    return result;
  }, []);

  // Handle adding new item with conflict check
  const handleAddWithConflictCheck = useCallback((parentId: string) => {
    // Find the parent item
    const findItem = (items: SlyTreeItem[], id: string): SlyTreeItem | null => {
      for (const item of items) {
        if (item.id === id) return item;
        if (item.children) {
          const found = findItem(item.children, id);
          if (found) return found;
        }
      }
      return null;
    };

    const parentItem = findItem(treeData, parentId);
    
    if (parentItem && parentItem.hasValue && parentItem.value !== undefined) {
      // Show conflict dialog
      setConflictDialog({
        open: true,
        parentId,
        parentKey: parentItem.key || '',
        currentValue: parentItem.value
      });
    } else {
      // Safe to add
      handleAddItem(parentId);
    }
  }, [treeData]);

  // Handle adding new item
  const handleAddItem = useCallback((parentId?: string) => {
    // If adding to empty root (no parentId), add directly to root level
    if (!parentId) {
      const newItem: SlyTreeItem = {
        id: generateId(),
        label: 'new_key: "new_value"',
        key: 'new_key',
        value: 'new_value',
        parentId: undefined,
        isKeyValuePair: true,
            type: 'string',
        depth: 0,
        hasValue: true
      };

      setTreeData(prev => [...prev, newItem]);
      return;
    }

    // Find parent depth for nested items
    const findDepth = (items: SlyTreeItem[], id: string): number => {
      for (const item of items) {
        if (item.id === id) return (item.depth || 0) + 1;
        if (item.children) {
          const depth = findDepth(item.children, id);
          if (depth > 0) return depth;
        }
      }
      return 0;
    };

    const newDepth = findDepth(treeData, parentId);
    
    const newItem: SlyTreeItem = {
      id: generateId(),
      label: 'new_key: "new_value"',
      key: 'new_key',
      value: 'new_value',
      parentId: parentId,
      isKeyValuePair: true,
      type: 'string',
      depth: newDepth,
      hasValue: true
    };

    setTreeData(prev => {
      const updateItems = (items: SlyTreeItem[]): SlyTreeItem[] => {
        return items.map(item => {
          if (item.id === parentId) {
            return {
              ...item,
              children: [...(item.children || []), newItem],
              hasValue: false, // Parent now has children, so no value
              value: undefined
            };
          }
          if (item.children) {
            return {
              ...item,
              children: updateItems(item.children)
            };
          }
          return item;
        });
      };

      return updateItems(prev);
    });

    // Expand the parent
    setExpandedItems(prev => [...prev, parentId]);
  }, [generateId, treeData]);

  // Handle conflict resolution
  const handleConflictConfirm = () => {
    handleAddItem(conflictDialog.parentId);
    setConflictDialog({ open: false, parentId: '', parentKey: '', currentValue: null });
  };

  const handleConflictCancel = () => {
    setConflictDialog({ open: false, parentId: '', parentKey: '', currentValue: null });
  };

  // Validate JSON structure for SlyData compatibility
  const validateJsonForSlyData = (data: any): string | null => {
    try {
      if (data === null || data === undefined) {
        return "JSON data cannot be null or undefined";
      }

      if (typeof data !== 'object') {
        return "Root element must be an object, not a primitive value";
      }

      if (Array.isArray(data)) {
        return "Root element must be an object, not an array";
      }

      // Check for circular references
      const seen = new WeakSet();
      const checkCircular = (obj: any): boolean => {
        if (obj && typeof obj === 'object') {
          if (seen.has(obj)) return true;
          seen.add(obj);
          
          for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
              if (checkCircular(obj[key])) return true;
            }
          }
        }
        return false;
      };

      if (checkCircular(data)) {
        return "JSON contains circular references which are not supported";
      }

      // Check for valid key types
      const validateKeys = (obj: any, path = ''): string | null => {
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
              if (typeof key !== 'string') {
                return `Invalid key type at ${path}${key}. Keys must be strings`;
              }
              if (key.trim() === '') {
                return `Empty key found at ${path}. Keys cannot be empty`;
              }
              
              const value = obj[key];
              if (value && typeof value === 'object' && !Array.isArray(value)) {
                const nestedError = validateKeys(value, `${path}${key}.`);
                if (nestedError) return nestedError;
              }
            }
          }
        }
        return null;
      };

      const keyError = validateKeys(data);
      if (keyError) return keyError;

      return null; // Valid
    } catch (error) {
      return `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  };

  // Handle updating key
  const handleUpdateKey = useCallback((id: string, newKey: string) => {
    setTreeData(prev => {
      const updateItem = (items: SlyTreeItem[]): SlyTreeItem[] => {
        return items.map(item => {
          if (item.id === id) {
            return {
              ...item,
              key: newKey,
              label: item.hasValue ? `${newKey}: ${typeof item.value === 'string' ? `"${item.value}"` : String(item.value)}` : newKey
            };
          }
          if (item.children) {
            return { ...item, children: updateItem(item.children) };
          }
          return item;
        });
      };
      return updateItem(prev);
    });
  }, []);

  // Handle updating value
  const handleUpdateValue = useCallback((id: string, newValue: any) => {
    setTreeData(prev => {
      const updateItem = (items: SlyTreeItem[]): SlyTreeItem[] => {
        return items.map(item => {
          if (item.id === id) {
            // Parse the value
            let parsedValue = newValue;
            try {
              if (typeof newValue === 'string') {
                if (newValue.startsWith('"') && newValue.endsWith('"')) {
                  parsedValue = newValue.slice(1, -1);
                } else if (!isNaN(Number(newValue))) {
                  parsedValue = Number(newValue);
                } else if (newValue === 'true' || newValue === 'false') {
                  parsedValue = newValue === 'true';
                } else if (newValue === 'null') {
                  parsedValue = null;
                }
              }
            } catch {
              parsedValue = newValue;
            }

            return {
              ...item,
              value: parsedValue,
              hasValue: true, // Now has a value
              children: undefined, // Remove children when adding a value
              type: typeof parsedValue as any,
              label: `${item.key}: ${typeof parsedValue === 'string' ? `"${parsedValue}"` : String(parsedValue)}`
            };
          }
          if (item.children) {
            return { ...item, children: updateItem(item.children) };
          }
          return item;
        });
      };
      return updateItem(prev);
    });
  }, []);

  // Handle deleting item
  const handleDeleteItem = useCallback((itemId: string) => {
    setTreeData(prev => {
      const removeItem = (items: SlyTreeItem[]): SlyTreeItem[] => {
        return items.filter(item => item.id !== itemId).map(item => {
          const updatedChildren = item.children ? removeItem(item.children) : undefined;
          
          // If this item had children but now has none, convert it to an empty object
          if (item.children && item.children.length > 0 && (!updatedChildren || updatedChildren.length === 0)) {
            return {
              ...item,
              children: undefined,
              hasValue: false, // Empty object, but can be edited
              value: undefined
            };
          }
          
          return {
            ...item,
            children: updatedChildren
          };
        });
      };

      return removeItem(prev);
    });
  }, []);

  // Handle label change
  const handleLabelChange = useCallback((itemId: TreeViewItemId, newLabel: string) => {
    setTreeData(prev => {
      const updateItem = (items: SlyTreeItem[]): SlyTreeItem[] => {
        return items.map(item => {
          if (item.id === itemId) {
            // Parse the new label to extract key and value
            const match = newLabel.match(/^([^:]+):\s*(.+)$/);
            if (match) {
              const [, key, valueStr] = match;
              let value = valueStr.trim();
              
              // Try to parse as JSON
              let parsedValue: any = value;
              try {
                if (value.startsWith('"') && value.endsWith('"')) {
                  parsedValue = value.slice(1, -1); // Remove quotes for strings
                } else if (!isNaN(Number(value))) {
                  parsedValue = Number(value);
                } else if (value === 'true' || value === 'false') {
                  parsedValue = value === 'true';
                } else if (value === 'null') {
                  parsedValue = null;
                }
              } catch {
                // Keep as string if parsing fails
                parsedValue = value;
              }

              return {
                ...item,
                label: newLabel,
                key: key.trim(),
                value: parsedValue,
                type: typeof parsedValue as any
              };
            }
            return { ...item, label: newLabel };
          }
          if (item.children) {
            return { ...item, children: updateItem(item.children) };
          }
          return item;
        });
      };

      return updateItem(prev);
    });
  }, []);

  // Handle JSON import
  const handleImportJson = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          let jsonData = null;
          let validationError = null;

          // Try to parse JSON
          try {
            jsonData = JSON.parse(event.target?.result as string);
          } catch (parseError) {
            validationError = `Invalid JSON format: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`;
          }

          // If JSON parsed successfully, validate structure
          if (!validationError && jsonData !== null) {
            validationError = validateJsonForSlyData(jsonData);
          }

          // Show import dialog
          setImportDialog({
            open: true,
            fileName: file.name,
            jsonData,
            hasExistingData: treeData.length > 0,
            validationError
          });
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }, [treeData.length, validateJsonForSlyData]);

  // Handle import confirmation
  const handleImportConfirm = () => {
    if (importDialog.jsonData && !importDialog.validationError) {
      try {
        const newTreeData = jsonToTreeData(importDialog.jsonData, undefined, 0);
      setTreeData(newTreeData);
        setExpandedItems(newTreeData.map(item => item.id));
        setImportDialog({ open: false, fileName: '', jsonData: null, hasExistingData: false, validationError: null });
      } catch (error) {
        console.error('Error importing JSON:', error);
        // Update dialog with conversion error
        setImportDialog(prev => ({
          ...prev,
          validationError: `Error converting JSON to tree structure: ${error instanceof Error ? error.message : 'Unknown error'}`
        }));
      }
    }
  };

  // Handle import cancellation
  const handleImportCancel = () => {
    setImportDialog({ open: false, fileName: '', jsonData: null, hasExistingData: false, validationError: null });
  };

  // Handle clear all confirmation
  const handleClearAll = () => {
    setClearDialog(true);
  };

  // Handle clear all confirm
  const handleClearConfirm = () => {
    setTreeData([]);
    setExpandedItems([]);
    setNextId(1);
    if (targetNetwork) {
      clearSlyDataCache(targetNetwork);
      console.log('SlyData cleared for network:', targetNetwork);
    } else {
      clearSlyDataCache(); // Clear all networks if no specific network
    }
    setClearDialog(false);
    // Keep isInitialized as true since we're intentionally clearing
  };

  // Handle clear all cancel
  const handleClearCancel = () => {
    setClearDialog(false);
  };

  // Functions for the logs section
  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMessage(index);
      setTimeout(() => setCopiedMessage(null), 1000);
    });
  };

  const downloadLogs = () => {
    const logText = slyDataMessages
      .map((msg) => `${msg.sender}: ${typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text)}`)
      .join("\n");

    const blob = new Blob([logText], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "slydata_logs.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Function to fetch latest sly_data from API
  const fetchLatestSlyData = useCallback(async () => {
    if (!targetNetwork) {
      console.debug('No target network, skipping sly_data fetch');
      return;
    }

    const fetchUrl = `${apiUrl}/api/v1/slydata/${targetNetwork}`;
    console.log('Fetching sly_data from:', fetchUrl);

    try {
      const response = await fetch(fetchUrl);
      console.log('API Response status:', response.status);
      
      if (response.status === 404) {
        console.debug('No sly_data available for network:', targetNetwork);
        return;
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API Error: HTTP ${response.status}: ${response.statusText}`, errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('API Response data:', result);
      const latestData = result.sly_data;

      if (latestData && typeof latestData === 'object' && Object.keys(latestData).length > 0) {
        console.log('Processing sly_data:', latestData);
        // Convert to tree data and update
        const newTreeData = jsonToTreeData(latestData, undefined, 0);
        setTreeData(newTreeData);
        
        // Auto-expand to show new structure
        const getAllIds = (items: SlyTreeItem[]): string[] => {
        const ids: string[] = [];
        items.forEach(item => {
          ids.push(item.id);
          if (item.children) {
            ids.push(...getAllIds(item.children));
          }
        });
        return ids;
      };
      
      setExpandedItems(getAllIds(newTreeData));
        console.log('SlyData updated from API:', Object.keys(latestData).length, 'root keys');
      } else {
        console.log('No valid sly_data in response:', latestData);
      }
    } catch (error) {
      console.error('Failed to fetch latest sly_data:', error);
    }
  }, [targetNetwork, apiUrl, jsonToTreeData]);

  // Handle JSON export
  const handleExportJson = useCallback(() => {
    // Export the root-level items directly
    const json = treeDataToJson(treeData);
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'slydata.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [treeData, treeDataToJson]);

  // Helper function to get all item IDs recursively
  const getAllItemIds = useCallback((items: SlyTreeItem[]): string[] => {
    const ids: string[] = [];
    items.forEach(item => {
      ids.push(item.id);
      if (item.children && item.children.length > 0) {
        ids.push(...getAllItemIds(item.children));
      }
    });
    return ids;
  }, []);

  // Handle expand/collapse all
  const handleExpandCollapseAll = useCallback(() => {
    if (expandedItems.length === 0 || expandedItems.length < treeData.length) {
      // Expand all - get all item IDs
      const allIds = getAllItemIds(treeData);
      setExpandedItems(allIds);
    } else {
      // Collapse all
      setExpandedItems([]);
    }
  }, [expandedItems.length, treeData, getAllItemIds]);

  // Monitor message count changes to fetch latest sly_data
  // Only fetches when new messages arrive (not continuous)
  useEffect(() => {
    const currentMessageCount = slyDataMessages.length;
    
    // Only fetch if message count increased and we're not dealing with the initial system message
    if (currentMessageCount > lastMessageCount && currentMessageCount > 1) {
      console.log(`New sly_data message detected (${lastMessageCount} → ${currentMessageCount}), fetching latest state...`);
      fetchLatestSlyData();
    }
    
    setLastMessageCount(currentMessageCount);
  }, [slyDataMessages.length, lastMessageCount, fetchLatestSlyData]);

  /*
  // Example backend integration functions:
  
  // Send SlyData to backend
  const sendSlyDataToBackend = async () => {
    const rootItem = treeData.find(item => item.id === 'root');
    const jsonData = rootItem?.children ? treeDataToJson(rootItem.children) : {};
    
    try {
      const response = await fetch('/api/v1/slydata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jsonData)
      });
      if (response.ok) {
        console.log('SlyData sent successfully');
      }
    } catch (error) {
      console.error('Error sending SlyData:', error);
    }
  };

  // Retrieve SlyData from backend
  const fetchSlyDataFromBackend = async () => {
    try {
      const response = await fetch('/api/v1/slydata');
      if (response.ok) {
        const jsonData = await response.json();
        const newTreeData = jsonToTreeData(jsonData);
        setTreeData([{
          id: 'root',
          label: 'SlyData Root',
          children: newTreeData,
          type: 'object',
          isKeyValuePair: false
        }]);
      }
    } catch (error) {
      console.error('Error fetching SlyData:', error);
    }
  };
  */
    
  return (
    <Paper 
      elevation={1}
      sx={{ 
        height: '100%', 
        backgroundColor: theme.palette.background.paper,
        color: theme.palette.text.primary,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: `1px solid ${theme.palette.divider}`
      }}
    >
      {/* Split Panel Layout */}
      <PanelGroup direction="vertical">
        {/* Top Panel: Editable SlyData Tree (60% default) */}
        <Panel defaultSize={64} minSize={30}>
          <Box sx={{ 
            height: '100%',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Fixed Header */}
            <Box sx={{ 
              p: 1.5, 
              borderBottom: `1px solid ${theme.palette.divider}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
              backgroundColor: theme.palette.background.paper
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <DataObjectIcon sx={{ color: theme.palette.primary.main, fontSize: '1.25rem' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
                  SlyData Editor
                </Typography>
              </Box>
              
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Tooltip title={expandedItems.length === 0 || expandedItems.length < treeData.length ? "Expand All" : "Collapse All"}>
                  <IconButton 
                    size="small" 
                    onClick={handleExpandCollapseAll}
                    disabled={treeData.length === 0}
                    sx={{ 
                      color: treeData.length > 0 ? theme.palette.info.main : theme.palette.text.disabled,
                      p: 0.5,
                      '&:hover': treeData.length > 0 ? { backgroundColor: alpha(theme.palette.info.main, 0.1) } : undefined,
                      '&:disabled': { color: theme.palette.text.disabled }
                    }}
                  >
                    {expandedItems.length === 0 || expandedItems.length < treeData.length ? (
                      <ExpandAllIcon fontSize="small" />
                    ) : (
                      <CollapseAllIcon fontSize="small" />
                    )}
                  </IconButton>
                </Tooltip>

                <Tooltip title="Import JSON">
                  <IconButton 
                    size="small" 
                    onClick={handleImportJson}
                    sx={{ 
                      color: theme.palette.secondary.main, 
                      p: 0.5,
                      '&:hover': { backgroundColor: alpha(theme.palette.secondary.main, 0.1) }
                    }}
                  >
                    <UploadIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                
                <Tooltip title="Export JSON">
                  <IconButton 
                    size="small" 
                    onClick={handleExportJson}
                    sx={{ 
                      color: theme.palette.warning.main, 
                      p: 0.5,
                      '&:hover': { backgroundColor: alpha(theme.palette.warning.main, 0.1) }
                    }}
                  >
                    <DownloadIcon fontSize="small" />
                  </IconButton>
                </Tooltip>

                <Tooltip title="Add root item">
                  <IconButton 
                    size="small" 
                    onClick={() => handleAddItem()}
                    sx={{ 
                      color: theme.palette.primary.main, 
                      p: 0.5,
                      '&:hover': { backgroundColor: alpha(theme.palette.primary.main, 0.1) }
                    }}
                  >
                    <AddIcon fontSize="small" />
                  </IconButton>
                </Tooltip>

                <Tooltip title="Clear all data">
                  <IconButton 
                    size="small" 
                    onClick={handleClearAll}
                    disabled={treeData.length === 0}
                    sx={{ 
                      color: treeData.length > 0 ? theme.palette.error.main : theme.palette.text.disabled,
                      '&:disabled': { color: theme.palette.text.disabled },
                      '&:hover': treeData.length > 0 ? { backgroundColor: alpha(theme.palette.error.main, 0.1) } : undefined,
                      p: 0.5
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>

            {/* Scrollable Tree Content */}
            <Box sx={{ 
              flexGrow: 1, 
              overflow: 'auto',
              p: 1,
              backgroundColor: theme.palette.background.paper
            }}>
              {treeData.length > 0 ? (
                <TreeOperationsContext.Provider value={{
                  handleDeleteItem,
                  handleAddItem,
                  handleAddWithConflictCheck,
                  handleUpdateKey,
                  handleUpdateValue,
                  treeData
                }}>
                  <RichTreeView
                    items={treeData}
                    expandedItems={expandedItems}
                    onExpandedItemsChange={(_, itemIds) => setExpandedItems(itemIds)}
                    onItemLabelChange={handleLabelChange}
                    isItemEditable={(item) => Boolean(item?.isKeyValuePair)}
                    slots={{ item: CustomTreeItem }}
                    sx={{
                      color: theme.palette.text.primary,
                      '& .MuiTreeItem-root': {
                        '& .MuiTreeItem-content': {
                          padding: '4px 0',
                          paddingLeft: '0px !important',
                          color: theme.palette.text.primary,
                          '&:hover': {
                            backgroundColor: theme.custom.slyData.hoverBackground
                          },
                          '&.Mui-focused': {
                            backgroundColor: alpha(theme.palette.primary.main, 0.1),
                            color: theme.palette.primary.main
                          }
                        },
                        '& .MuiTreeItem-iconContainer': {
                          marginRight: '4px',
                          minWidth: '24px',
                          '& .MuiSvgIcon-root': {
                            color: theme.palette.text.secondary,
                            fontSize: '1rem'
                          }
                        }
                      }
                    }}
                  />
                </TreeOperationsContext.Provider>
              ) : (
                <Box sx={{ 
                  display: 'flex', 
                  flexDirection: 'column',
                  alignItems: 'center', 
                  justifyContent: 'center',
                  height: '100%',
                  gap: 2,
                  color: theme.palette.text.secondary
                }}>
                  <DataObjectIcon sx={{ fontSize: 48, color: theme.palette.text.disabled }} />
                  <Typography variant="body1" sx={{ color: theme.palette.text.primary }}>
                    No SlyData available
                  </Typography>
                  <Typography variant="body2" sx={{ textAlign: 'center', maxWidth: 300, color: theme.palette.text.secondary }}>
                    Click the + button to add your first key-value pair, or import JSON data.
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        </Panel>

        {/* Resizable Splitter */}
        <PanelResizeHandle style={{
          height: '4px',
          backgroundColor: theme.palette.divider,
          cursor: 'row-resize',
          transition: 'background-color 0.2s ease'
        }} />

        {/* Bottom Panel: Live SlyData Logs (40% default) */}
        <Panel defaultSize={36} minSize={20}>
          <Box sx={{ 
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            borderTop: `1px solid ${theme.palette.divider}`,
            backgroundColor: theme.palette.background.paper
          }}>
            {/* Fixed Logs Header */}
            <Box sx={{ 
              p: 1.5, 
              borderBottom: `1px solid ${theme.palette.divider}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
              backgroundColor: theme.palette.background.paper
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
                  SlyData Logs
                </Typography>
                <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                  (Message History)
                </Typography>
              </Box>
              
              <Tooltip title="Download logs">
                <IconButton 
                  size="small" 
                  onClick={downloadLogs}
                  sx={{ 
                    color: theme.palette.text.secondary, 
                    p: 0.5,
                    '&:hover': { 
                      color: theme.palette.primary.main,
                      backgroundColor: alpha(theme.palette.primary.main, 0.1)
                    }
                  }}
                >
                  <DownloadIcon fontSize="small" />
              </IconButton>
              </Tooltip>
      </Box>

            {/* Scrollable Logs Content */}
            <Box sx={{ 
              flexGrow: 1, 
              overflow: 'auto',
              backgroundColor: theme.palette.background.paper
            }}>
              <ScrollableMessageContainer
                messages={slyDataMessages.filter(
                  (msg) => {
                    const text = typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text);
                    return text.trim().length > 0 && text.trim() !== "{}";
                  }
                )}
                copiedMessage={copiedMessage}
                onCopy={copyToClipboard}
                renderSenderLabel={(msg: any) => msg.network || msg.sender}
                getMessageClass={() => "chat-msg chat-msg-agent"}
              />
            </Box>
          </Box>
        </Panel>
      </PanelGroup>

      {/* All dialogs remain the same */}
      {/* Conflict Dialog */}
      <Dialog 
        open={conflictDialog.open} 
        onClose={handleConflictCancel}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ color: theme.palette.text.primary, backgroundColor: theme.palette.background.paper }}>
          Replace Current Value?
        </DialogTitle>
        <DialogContent sx={{ backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary }}>
          <Typography sx={{ mb: 2 }}>
            The key "{conflictDialog.parentKey}" currently has a value:
          </Typography>
          <Box sx={{ 
            p: 2, 
            backgroundColor: alpha(theme.palette.primary.main, 0.1), 
            borderRadius: 1,
            fontFamily: 'monospace',
            mb: 2,
            color: theme.custom.slyData.valueColor,
            border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`
          }}>
            {typeof conflictDialog.currentValue === 'string' 
              ? `"${conflictDialog.currentValue}"` 
              : String(conflictDialog.currentValue)}
          </Box>
          <Typography>
            Adding a child key-value pair will replace this value with a nested object. 
            Do you want to proceed?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ backgroundColor: theme.palette.background.paper }}>
          <Button onClick={handleConflictCancel} sx={{ color: theme.palette.error.main }}>
            Cancel
          </Button>
          <Button onClick={handleConflictConfirm} sx={{ color: theme.palette.success.main }}>
            Replace Value
          </Button>
        </DialogActions>
      </Dialog>

      {/* Import Confirmation Dialog */}
      <Dialog 
        open={importDialog.open} 
        onClose={handleImportCancel}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ color: theme.palette.text.primary, backgroundColor: theme.palette.background.paper }}>
          {importDialog.validationError ? 'Import Error' : 'Import JSON File'}
        </DialogTitle>
        <DialogContent sx={{ backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary }}>
          <Typography sx={{ mb: 2 }}>
            File: <strong>{importDialog.fileName}</strong>
          </Typography>

          {importDialog.validationError ? (
            <>
              <Typography color="error" sx={{ mb: 2 }}>
                ❌ Cannot import this file due to the following error:
              </Typography>
          <Box sx={{ 
                p: 2, 
                backgroundColor: alpha('#f44336', 0.1), 
                borderRadius: 1,
                border: '1px solid #f44336',
              fontFamily: 'monospace',
                mb: 2,
                color: '#f44336'
              }}>
                {importDialog.validationError}
          </Box>
              <Typography variant="body2" sx={{ color: '#90A4AE' }}>
                Please fix the JSON file and try importing again.
              </Typography>
            </>
          ) : (
            <>
              {importDialog.hasExistingData && (
                <>
                  <Typography color="warning.main" sx={{ mb: 2 }}>
                    ⚠️ This will replace all existing SlyData with the imported data.
                  </Typography>
                  <Typography sx={{ mb: 2 }}>
                    Current SlyData contains {treeData.length} root-level item{treeData.length !== 1 ? 's' : ''}.
                  </Typography>
                </>
              )}

              <Typography sx={{ mb: 2 }}>
                📁 Preview of data to import:
              </Typography>
              <Box sx={{ 
                p: 2, 
                backgroundColor: alpha('#4CAF50', 0.1), 
                borderRadius: 1,
                border: '1px solid #4CAF50',
                fontFamily: 'monospace',
                mb: 2,
                maxHeight: 300,
                overflow: 'auto',
                fontSize: '0.85rem'
              }}>
                <pre>{JSON.stringify(importDialog.jsonData, null, 2)}</pre>
              </Box>

              <Typography>
                {importDialog.hasExistingData 
                  ? 'Do you want to replace the existing data with this imported data?' 
                  : 'Import this JSON data into SlyData?'}
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ backgroundColor: theme.palette.background.paper }}>
          <Button onClick={handleImportCancel} sx={{ color: theme.palette.text.secondary }}>
            {importDialog.validationError ? 'Close' : 'Cancel'}
          </Button>
          {!importDialog.validationError && (
            <Button onClick={handleImportConfirm} sx={{ color: theme.palette.success.main }}>
              {importDialog.hasExistingData ? 'Replace Data' : 'Import'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Clear All Confirmation Dialog */}
      <Dialog 
        open={clearDialog} 
        onClose={handleClearCancel}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ color: theme.palette.text.primary, backgroundColor: theme.palette.background.paper }}>
          Clear All SlyData?
        </DialogTitle>
        <DialogContent sx={{ backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary }}>
          <Typography color="warning.main" sx={{ mb: 2 }}>
            ⚠️ This will permanently delete all SlyData including:
          </Typography>
          <Box sx={{ ml: 2, mb: 2 }}>
            <Typography>• {treeData.length} root-level item{treeData.length !== 1 ? 's' : ''}</Typography>
            <Typography>• All nested key-value pairs</Typography>
            <Typography>• Cached data in browser storage</Typography>
          </Box>
          <Typography>
            This action cannot be undone. Are you sure you want to clear all data?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ backgroundColor: theme.palette.background.paper }}>
          <Button onClick={handleClearCancel} sx={{ color: theme.palette.text.secondary }}>
            Cancel
          </Button>
          <Button onClick={handleClearConfirm} sx={{ color: theme.palette.error.main }}>
            Clear All Data
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

// Helper function to get all nested items
const getAllNestedItems = (item: SlyTreeItem): SlyTreeItem[] => {
  const result = [item];
  if (item.children) {
    item.children.forEach(child => {
      result.push(...getAllNestedItems(child));
    });
  }
  return result;
};

export default EditorSlyDataPanel;
