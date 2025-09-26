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
  alpha
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

// Custom Label Component with inline editing
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

  return (
    <TreeItemLabel
      {...other}
      editable={editable}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        py: 0.5,
        px: 1,
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
        {children}
      </Box>
      
      {(isHovered || editing) && (
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
          
          {editable && (
            <Tooltip title="Edit">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleItemEditing();
                }}
                sx={{ 
                  color: '#2196F3',
                  '&:hover': { backgroundColor: alpha('#2196F3', 0.1) }
                }}
              >
                <EditIcon fontSize="small" />
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
    const { handleDeleteItem, handleAddItem, treeData } = useTreeOperations();
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
        handleAddItem(itemData.id);
      }
    };

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
            onDelete: itemData?.id !== 'root' ? handleDelete : undefined,
            onAddChild: handleAddChild,
          } as CustomLabelProps,
          labelInput: {
            onBlur: handleInputBlur,
            onKeyDown: handleInputKeyDown,
            handleCancelItemLabelEditing: interactions.handleCancelItemLabelEditing,
            handleSaveItemLabel: interactions.handleSaveItemLabel,
          } as CustomLabelInputProps,
        }}
      />
    );
  }
);

const EditorSlyDataPanel: React.FC = () => {
  const { slyDataMessages } = useChatContext();
  const [treeData, setTreeData] = useState<SlyTreeItem[]>([]);
  const [expandedItems, setExpandedItems] = useState<TreeViewItemId[]>(['root']);
  const [nextId, setNextId] = useState(1);

  // Initialize with empty data structure
  useEffect(() => {
    if (treeData.length === 0) {
      const initialData: SlyTreeItem[] = [{
        id: 'root',
        label: 'SlyData Root',
        children: [],
        type: 'object',
        isKeyValuePair: false
      }];
      setTreeData(initialData);
    }
  }, [treeData.length]);

  // Generate unique ID
  const generateId = useCallback(() => {
    const id = `item_${nextId}`;
    setNextId(prev => prev + 1);
    return id;
  }, [nextId]);

  // Convert JSON to tree structure
  const jsonToTreeData = useCallback((json: any, parentId = 'root'): SlyTreeItem[] => {
    if (!json || typeof json !== 'object') return [];

    return Object.entries(json).map(([key, value]) => {
      const id = generateId();
      const item: SlyTreeItem = {
        id,
        label: `${key}: ${typeof value === 'object' ? '{...}' : JSON.stringify(value)}`,
        key,
        value,
        parentId,
        isKeyValuePair: true,
        type: Array.isArray(value) ? 'array' : typeof value as any,
      };

      if (typeof value === 'object' && value !== null) {
        item.children = jsonToTreeData(value, id);
        item.label = `${key} ${Array.isArray(value) ? `[${value.length}]` : '{...}'}`;
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

  // Handle adding new item
  const handleAddItem = useCallback((parentId?: string) => {
    const newItem: SlyTreeItem = {
      id: generateId(),
      label: 'new_key: "new_value"',
      key: 'new_key',
      value: 'new_value',
      parentId: parentId || 'root',
      isKeyValuePair: true,
      type: 'string'
    };

    setTreeData(prev => {
      const updateItems = (items: SlyTreeItem[]): SlyTreeItem[] => {
        return items.map(item => {
          if (item.id === (parentId || 'root')) {
            return {
              ...item,
              children: [...(item.children || []), newItem]
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
    setExpandedItems(prev => [...prev, parentId || 'root']);
  }, [generateId]);

  // Handle deleting item
  const handleDeleteItem = useCallback((itemId: string) => {
    setTreeData(prev => {
      const removeItem = (items: SlyTreeItem[]): SlyTreeItem[] => {
        return items.filter(item => item.id !== itemId).map(item => ({
          ...item,
          children: item.children ? removeItem(item.children) : undefined
        }));
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
          try {
            const json = JSON.parse(event.target?.result as string);
            const newTreeData = jsonToTreeData(json);
            setTreeData([{
              id: 'root',
              label: 'SlyData Root',
              children: newTreeData,
              type: 'object',
              isKeyValuePair: false
            }]);
            setExpandedItems(['root', ...newTreeData.map(item => item.id)]);
          } catch (error) {
            console.error('Error parsing JSON:', error);
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }, [jsonToTreeData]);

  // Handle JSON export
  const handleExportJson = useCallback(() => {
    const rootItem = treeData.find(item => item.id === 'root');
    const json = rootItem?.children ? treeDataToJson(rootItem.children) : {};
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
        
        const newTreeData = jsonToTreeData(parsedData);
        setTreeData([{
          id: 'root',
          label: 'SlyData Root',
          children: newTreeData,
          type: 'object',
          isKeyValuePair: false
        }]);
        
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
        
        setExpandedItems(['root', ...getAllIds(newTreeData)]);
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
              onClick={() => handleAddItem('root')}
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
                    '&:hover': {
                      backgroundColor: 'transparent'
                    },
                    '&.Mui-focused': {
                      backgroundColor: alpha('#2196F3', 0.1)
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
