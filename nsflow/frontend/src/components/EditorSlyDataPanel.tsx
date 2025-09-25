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

import { useState, useEffect } from 'react';
import { RichTreeView } from '@mui/x-tree-view/RichTreeView';
import { TreeViewItemId } from '@mui/x-tree-view/models';
import { Box, Typography, IconButton, TextField, Button } from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Edit as EditIcon, Save as SaveIcon, Cancel as CancelIcon } from '@mui/icons-material';
import { useChatContext } from '../context/ChatContext';

interface TreeItem {
  id: string;
  label: string;
  children?: TreeItem[];
  editable?: boolean;
  value?: any;
  type?: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
}

const EditorSlyDataPanel: React.FC = () => {
  const { slyDataMessages } = useChatContext();
  const [treeData, setTreeData] = useState<TreeItem[]>([]);
  const [expandedItems, setExpandedItems] = useState<TreeViewItemId[]>([]);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Convert sly data messages to tree structure
  const convertToTreeData = (data: any, parentKey = 'root', idPrefix = ''): TreeItem[] => {
    if (!data) return [];

    try {
      let parsedData = data;
      
      // Try to parse JSON if it's a string
      if (typeof data === 'string') {
        try {
          // Remove markdown code block formatting
          const cleanData = data.replace(/```json\n|\n```/g, '').trim();
          parsedData = JSON.parse(cleanData);
        } catch {
          // If parsing fails, treat as plain string
          return [{
            id: `${idPrefix}text`,
            label: data,
            editable: true,
            type: 'string',
            value: data
          }];
        }
      }

      return convertObjectToTree(parsedData, parentKey, idPrefix);
    } catch (error) {
      console.error('Error converting data to tree:', error);
      return [];
    }
  };

  const convertObjectToTree = (obj: any, parentKey = 'root', idPrefix = ''): TreeItem[] => {
    if (obj === null) {
      return [{
        id: `${idPrefix}null`,
        label: `${parentKey}: null`,
        editable: true,
        type: 'null',
        value: null
      }];
    }

    if (typeof obj !== 'object') {
      // Map JavaScript types to our allowed TreeItem types
      const getTreeItemType = (jsType: string): 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null' => {
        switch (jsType) {
          case 'string':
            return 'string';
          case 'number':
          case 'bigint':
            return 'number';
          case 'boolean':
            return 'boolean';
          case 'object':
            return 'object';
          default:
            return 'string'; // fallback for undefined, symbol, function, etc.
        }
      };

      return [{
        id: `${idPrefix}${parentKey}`,
        label: `${parentKey}: ${obj}`,
        editable: true,
        type: getTreeItemType(typeof obj),
        value: obj
      }];
    }

    if (Array.isArray(obj)) {
      const children = obj.map((item, index) => 
        convertObjectToTree(item, `[${index}]`, `${idPrefix}${parentKey}_${index}_`)
      ).flat();

      return [{
        id: `${idPrefix}${parentKey}`,
        label: `${parentKey} (${obj.length} items)`,
        type: 'array',
        children: children.length > 0 ? children : undefined,
        editable: false
      }];
    }

    // Regular object
    const children = Object.entries(obj).map(([key, value]) => 
      convertObjectToTree(value, key, `${idPrefix}${parentKey}_${key}_`)
    ).flat();

    if (parentKey === 'root') {
      return children;
    }

    return [{
      id: `${idPrefix}${parentKey}`,
      label: parentKey,
      type: 'object',
      children: children.length > 0 ? children : undefined,
      editable: false
    }];
  };

  // Update tree data when sly data messages change
  useEffect(() => {
    if (slyDataMessages.length > 0) {
      const latestMessage = slyDataMessages[slyDataMessages.length - 1];
      const newTreeData = convertToTreeData(latestMessage.text);
      setTreeData(newTreeData);
      
      // Auto-expand all items
      const getAllIds = (items: TreeItem[]): string[] => {
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
    }
  }, [slyDataMessages]);

  // Handle item label change
  const handleItemLabelChange = (itemId: TreeViewItemId, newLabel: string) => {
    console.log('Item label changed:', itemId, newLabel);
    // TODO: Update the actual data structure
  };

  // Handle editing start
  const handleEditStart = (itemId: string, currentValue: any) => {
    setEditingItem(itemId);
    setEditValue(String(currentValue || ''));
  };

  // Handle edit save
  const handleEditSave = () => {
    if (editingItem) {
      console.log('Saving edit:', editingItem, editValue);
      // TODO: Update the tree data with new value
      setEditingItem(null);
      setEditValue('');
    }
  };

  // Handle edit cancel
  const handleEditCancel = () => {
    setEditingItem(null);
    setEditValue('');
  };

  // Custom TreeItem component for enhanced editing
  const CustomTreeItem = ({ itemId, label, children, ...other }: any) => {
    const item = treeData.find(t => t.id === itemId) || 
                 treeData.flatMap(t => getAllNestedItems(t)).find(t => t.id === itemId);
    
    if (!item) {
      return (
        <div {...other}>
          <Typography variant="body2" sx={{ color: 'white', fontFamily: 'monospace', fontSize: '0.8rem' }}>
            {label}
          </Typography>
          {children}
        </div>
      );
    }

    const isEditing = editingItem === item.id;
    
    return (
      <Box 
        {...other}
        sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1,
          py: 0.5,
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.05)'
          }
        }}
      >
        {isEditing ? (
          <>
            <TextField
              size="small"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') handleEditSave();
                if (e.key === 'Escape') handleEditCancel();
              }}
              sx={{ 
                flexGrow: 1,
                '& .MuiOutlinedInput-root': {
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  color: 'white'
                }
              }}
              autoFocus
            />
            <IconButton 
              size="small" 
              onClick={handleEditSave}
              sx={{ color: 'green' }}
            >
              <SaveIcon fontSize="small" />
            </IconButton>
            <IconButton 
              size="small" 
              onClick={handleEditCancel}
              sx={{ color: 'gray' }}
            >
              <CancelIcon fontSize="small" />
            </IconButton>
          </>
        ) : (
          <>
            <Typography 
              variant="body2" 
              sx={{ 
                flexGrow: 1, 
                color: 'white',
                fontFamily: 'monospace',
                fontSize: '0.8rem'
              }}
            >
              {item.label}
            </Typography>
            {item.editable && (
              <IconButton 
                size="small" 
                onClick={() => handleEditStart(item.id, item.value)}
                sx={{ color: 'lightblue' }}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            )}
          </>
        )}
        {children}
      </Box>
    );
  };

  // Helper function to get all nested items
  const getAllNestedItems = (item: TreeItem): TreeItem[] => {
    const result = [item];
    if (item.children) {
      item.children.forEach(child => {
        result.push(...getAllNestedItems(child));
      });
    }
    return result;
  };

  return (
    <div className="sly-data-panel">
      <div className="sly-data-header">
        <h3>SlyData Tree Editor</h3>
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <Button 
            size="small" 
            startIcon={<AddIcon />}
            variant="outlined"
            sx={{ color: 'white', borderColor: 'gray' }}
          >
            Add
          </Button>
          <Button 
            size="small" 
            startIcon={<DeleteIcon />}
            variant="outlined"
            sx={{ color: 'red', borderColor: 'red' }}
          >
            Delete
          </Button>
        </Box>
      </div>
      
      <div className="sly-data-content" style={{ height: 'calc(100% - 100px)', overflow: 'auto' }}>
        {treeData.length > 0 ? (
          <Box sx={{ 
            color: 'white', 
            '& .MuiTreeView-root': { 
              color: 'white',
              backgroundColor: 'transparent'
            },
            '& .MuiTreeItem-root': {
              color: 'white'
            },
            '& .MuiTreeItem-content': {
              color: 'white',
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.1)'
              }
            },
            '& .MuiTreeItem-label': {
              fontFamily: 'monospace',
              fontSize: '0.8rem'
            }
          }}>
            <RichTreeView
              items={treeData}
              expandedItems={expandedItems}
              onExpandedItemsChange={(_, itemIds) => setExpandedItems(itemIds)}
              onItemLabelChange={handleItemLabelChange}
              isItemEditable={(item) => Boolean(item?.editable)}
              slots={{ item: CustomTreeItem }}
              sx={{
                flexGrow: 1,
                maxWidth: '100%',
                overflowY: 'auto',
              }}
            />
          </Box>
        ) : (
          <div className="text-gray-400 text-center p-4">
            No SlyData available. Data will appear here when the agent network designer is active.
          </div>
        )}
      </div>
    </div>
  );
};

export default EditorSlyDataPanel;
