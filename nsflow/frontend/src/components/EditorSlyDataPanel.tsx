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
  Divider,
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
  Upload as UploadIcon
} from '@mui/icons-material';
import {
  UseTreeItemLabelInputSlotOwnProps,
  UseTreeItemLabelSlotOwnProps,
} from '@mui/x-tree-view/useTreeItem';
import { useChatContext } from '../context/ChatContext';

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

  // Indentation is now handled at the TreeItem level

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
                  backgroundColor: alpha('#ffffff', 0.1),
                  color: 'white',
                  fontSize: '0.85rem',
                }
              }}
              autoFocus
            />
            <IconButton size="small" onClick={handleKeySave} sx={{ color: '#4CAF50' }}>
              <CheckIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={handleKeyCancel} sx={{ color: '#f44336' }}>
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
              color: '#FFB74D', // Orange for keys
              fontWeight: 600
            }}
            onClick={() => setEditingKey(true)}
          >
            <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
              {itemData?.key || 'key'}
            </Typography>
            {isHovered && (
              <IconButton size="small" sx={{ color: '#2196F3' }}>
                <EditIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        )}

        <Typography sx={{ color: '#90A4AE', mx: 0.5 }}>:</Typography>

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
                    backgroundColor: alpha('#ffffff', 0.1),
                    color: 'white',
                    fontSize: '0.85rem',
                  }
                }}
                placeholder={!itemData?.hasValue ? "Enter value..." : ""}
                autoFocus
              />
              <IconButton size="small" onClick={handleValueSave} sx={{ color: '#4CAF50' }}>
                <CheckIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={handleValueCancel} sx={{ color: '#f44336' }}>
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
                color: itemData?.hasValue ? '#81C784' : '#90A4AE', // Green for values, gray for empty
              }}
              onClick={() => setEditingValue(true)}
            >
              <Typography variant="body2" sx={{ 
                fontSize: '0.85rem',
                fontStyle: !itemData?.hasValue ? 'italic' : 'normal'
              }}>
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
          <Typography sx={{ color: '#90A4AE', fontStyle: 'italic' }}>
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
                  color: '#f44336',
                  '&:hover': { backgroundColor: alpha('#f44336', 0.1) }
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

    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
        <TreeItemLabelInput 
          {...other} 
          ref={ref}
          value={value}
          sx={{
            flexGrow: 1,
            '& .MuiOutlinedInput-root': {
              backgroundColor: alpha('#ffffff', 0.1),
              color: 'white',
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
          sx={{ color: '#4CAF50' }}
        >
          <CheckIcon fontSize="small" />
        </IconButton>
        <IconButton 
          color="error" 
          size="small" 
          onClick={handleCancelItemLabelEditing}
          sx={{ color: '#f44336' }}
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
  const { slyDataMessages } = useChatContext();
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

  // Initialize with completely empty data structure
  useEffect(() => {
    if (treeData.length === 0) {
      setTreeData([]); // Start completely empty
    }
  }, [treeData.length]);

  // Generate unique ID
  const generateId = useCallback(() => {
    const id = `item_${nextId}`;
    setNextId(prev => prev + 1);
    return id;
  }, [nextId]);

  // Convert JSON to tree structure
  const jsonToTreeData = useCallback((json: any, parentId = 'root', depth = 0): SlyTreeItem[] => {
    if (!json || typeof json !== 'object') return [];

    return Object.entries(json).map(([key, value]) => {
      const id = generateId();
      const hasValue = typeof value !== 'object' || value === null;
      const item: SlyTreeItem = {
        id,
        label: hasValue ? `${key}: ${JSON.stringify(value)}` : `${key}`,
        key,
        value: hasValue ? value : undefined,
        parentId,
        isKeyValuePair: true,
        type: Array.isArray(value) ? 'array' : typeof value as any,
        depth,
        hasValue,
      };

      if (typeof value === 'object' && value !== null) {
        item.children = jsonToTreeData(value, id, depth + 1);
      }

      return item;
    });
  }, [generateId]);

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

  // Process sly data messages when they change
  useEffect(() => {
    if (slyDataMessages.length > 0) {
      const latestMessage = slyDataMessages[slyDataMessages.length - 1];
      try {
        // Try to parse the message as JSON
        let parsedData = latestMessage.text;
        if (typeof parsedData === 'string') {
          // Remove markdown code block formatting
          const cleanData = parsedData.replace(/```json\n|\n```/g, '').trim();
          parsedData = JSON.parse(cleanData);
        }
        
        const newTreeData = jsonToTreeData(parsedData, undefined, 0);
      setTreeData(newTreeData);
      
        // Auto-expand items
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
      } catch (error) {
        console.error('Error processing sly data message:', error);
      }
    }
  }, [slyDataMessages, jsonToTreeData]);

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
        sx={{ 
        height: '100%', 
        backgroundColor: '#1a1a1a',
        color: 'white',
          display: 'flex', 
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <Box sx={{ 
        p: 2, 
        borderBottom: `1px solid ${alpha('#ffffff', 0.1)}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <DataObjectIcon sx={{ color: '#2196F3' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            SlyData Editor
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Import JSON">
            <IconButton 
              size="small" 
              onClick={handleImportJson}
              sx={{ color: '#4CAF50' }}
            >
              <UploadIcon />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Export JSON">
            <IconButton 
              size="small" 
              onClick={handleExportJson}
              sx={{ color: '#FF9800' }}
            >
              <DownloadIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title="Add root item">
              <IconButton 
                size="small" 
              onClick={() => handleAddItem()}
              sx={{ color: '#2196F3' }}
              >
              <AddIcon />
              </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Divider sx={{ borderColor: alpha('#ffffff', 0.1) }} />

      {/* Tree Content */}
      <Box sx={{ 
        flexGrow: 1, 
        overflow: 'auto',
        p: 1
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
                '& .MuiTreeItem-root': {
                  '& .MuiTreeItem-content': {
                    padding: '4px 0',
                    paddingLeft: '0px !important', // Remove default padding
                    '&:hover': {
                      backgroundColor: 'transparent'
                    },
                    '&.Mui-focused': {
                      backgroundColor: alpha('#2196F3', 0.1)
                    }
                  },
                  '& .MuiTreeItem-iconContainer': {
                    marginRight: '4px',
                    minWidth: '24px', // Ensure consistent width
                    '& .MuiSvgIcon-root': {
                      color: '#90A4AE',
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
            color: alpha('#ffffff', 0.6)
          }}>
            <DataObjectIcon sx={{ fontSize: 48 }} />
            <Typography variant="body1">
              No SlyData available
            </Typography>
            <Typography variant="body2" sx={{ textAlign: 'center', maxWidth: 300 }}>
              Click the + button to add your first key-value pair, or import JSON data.
            </Typography>
          </Box>
        )}
      </Box>

      {/* Conflict Dialog */}
      <Dialog 
        open={conflictDialog.open} 
        onClose={handleConflictCancel}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ color: 'white', backgroundColor: '#1a1a1a' }}>
          Replace Current Value?
        </DialogTitle>
        <DialogContent sx={{ backgroundColor: '#1a1a1a', color: 'white' }}>
          <Typography sx={{ mb: 2 }}>
            The key "{conflictDialog.parentKey}" currently has a value:
          </Typography>
          <Box sx={{ 
            p: 2, 
            backgroundColor: alpha('#ffffff', 0.1), 
            borderRadius: 1,
            fontFamily: 'monospace',
            mb: 2
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
        <DialogActions sx={{ backgroundColor: '#1a1a1a' }}>
          <Button onClick={handleConflictCancel} sx={{ color: '#f44336' }}>
            Cancel
          </Button>
          <Button onClick={handleConflictConfirm} sx={{ color: '#4CAF50' }}>
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
        <DialogTitle sx={{ color: 'white', backgroundColor: '#1a1a1a' }}>
          {importDialog.validationError ? 'Import Error' : 'Import JSON File'}
        </DialogTitle>
        <DialogContent sx={{ backgroundColor: '#1a1a1a', color: 'white' }}>
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
        <DialogActions sx={{ backgroundColor: '#1a1a1a' }}>
          <Button onClick={handleImportCancel} sx={{ color: '#90A4AE' }}>
            {importDialog.validationError ? 'Close' : 'Cancel'}
          </Button>
          {!importDialog.validationError && (
            <Button onClick={handleImportConfirm} sx={{ color: '#4CAF50' }}>
              {importDialog.hasExistingData ? 'Replace Data' : 'Import'}
            </Button>
          )}
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
