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

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  IconButton, 
  useTheme,
  alpha,
  Collapse,
  Button,
  CircularProgress,
  Alert
} from '@mui/material';
import { 
  ExpandLess as ChevronUpIcon,
  ExpandMore as ChevronDownIcon,
  Edit as EditIcon,
  PushPin as PinIcon,
  PushPinOutlined as UnpinIcon,
  Save as SaveIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { RichTreeView } from '@mui/x-tree-view/RichTreeView';
import type { TreeViewItemId } from '@mui/x-tree-view/models';
import { useApiPort } from '../context/ApiPortContext';
import { useTheme as useCustomTheme } from '../context/ThemeContext';
import { TreeOperationsContext } from '../context/TreeOperationsContext';
import type { SlyTreeItem } from '../types/slyTree';
import { CustomTreeItem } from './slydata/CustomTreeItem';
import { jsonToTreeData, treeDataToJson, getAllItemIds } from '../utils/slydata/jsonTree';

interface NetworkAgentEditorPanelProps {
  selectedDesignId: string;
  selectedAgentName: string | null;
  onAgentUpdated: () => void;
}

const NetworkAgentEditorPanel: React.FC<NetworkAgentEditorPanelProps> = ({
  selectedDesignId,
  selectedAgentName,
  onAgentUpdated
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [treeData, setTreeData] = useState<SlyTreeItem[]>([]);
  const [expandedItems, setExpandedItems] = useState<TreeViewItemId[]>([]);
  const [nextId, setNextId] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [, setOriginalData] = useState<any>(null);
  const [schema, setSchema] = useState<any>(null);
  
  const panelRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const { theme: customTheme } = useCustomTheme();
  const { apiUrl } = useApiPort();


  // Handle clicking outside to collapse when not pinned
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        if (isExpanded && !isPinned) {
          setIsExpanded(false);
        }
      }
    };

    if (isExpanded && !isPinned) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isExpanded, isPinned]);

  // Load schema on component mount
  useEffect(() => {
    if (apiUrl) {
      loadSchema();
    }
  }, [apiUrl]);

  // Load agent data when selectedAgentName changes
  useEffect(() => {
    if (selectedAgentName && selectedDesignId && apiUrl) {
      loadAgentData();
    } else {
      setTreeData([]);
      setExpandedItems([]);
      setHasChanges(false);
      setOriginalData(null);
      setError(null);
      setSuccess(null);
    }
  }, [selectedAgentName, selectedDesignId, apiUrl]);

  const loadSchema = async () => {
    if (!apiUrl) return;

    try {
      const response = await fetch(`${apiUrl}/api/v1/andeditor/schemas/base-agent-properties`);
      
      if (!response.ok) {
        throw new Error(`Failed to load schema: ${response.statusText}`);
      }

      const schemaData = await response.json();
      console.log('Loaded schema:', schemaData);
      setSchema(schemaData);
    } catch (err) {
      console.error('Error loading schema:', err);
      // Don't show error to user for schema loading failure
    }
  };

  const createDefaultTreeFromSchema = (schema: any): SlyTreeItem[] => {
    if (!schema || !schema.properties) return [];
    
    const localRef = { current: 1 };
    const treeData: SlyTreeItem[] = [];
    
    // Create tree items for each property in the schema
    Object.entries(schema.properties).forEach(([key, property]: [string, any]) => {
      const item: SlyTreeItem = {
        id: `item_${localRef.current++}`,
        label: `${key}: ""`,
        key,
        value: "",
        parentId: undefined,
        isKeyValuePair: true,
        type: 'string',
        depth: 0,
        hasValue: false
      };
      
      // Note: Description could be added as a tooltip in the future
      
      // Handle nested objects (like llm_config)
      if (property.type === 'object' && property.properties) {
        item.hasValue = false;
        item.children = [];
        
        // Add nested properties
        Object.entries(property.properties).forEach(([nestedKey]: [string, any]) => {
          const nestedItem: SlyTreeItem = {
            id: `item_${localRef.current++}`,
            label: `${nestedKey}: ""`,
            key: nestedKey,
            value: "",
            parentId: item.id,
            isKeyValuePair: true,
            type: 'string',
            depth: 1,
            hasValue: false
          };
          
          // Note: Description could be added as a tooltip in the future
          
          item.children!.push(nestedItem);
        });
      }
      
      treeData.push(item);
    });
    
    setNextId(localRef.current);
    return treeData;
  };

  const loadAgentData = async () => {
    if (!selectedAgentName || !selectedDesignId || !apiUrl) return;

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${apiUrl}/api/v1/andeditor/networks/${selectedDesignId}/agents/${selectedAgentName}`);
      
      if (!response.ok) {
        throw new Error(`Failed to load agent: ${response.statusText}`);
      }

      const data = await response.json();
      const agentData = data.agent;
      console.log('Loaded agent data:', agentData);

      // Convert agent data to tree format
      const localRef = { current: 1 };
      const newTreeData = jsonToTreeData(agentData, localRef, undefined, 0);
      
      setTreeData(newTreeData);
      setExpandedItems(getAllItemIds(newTreeData));
      setNextId(localRef.current);
      setOriginalData(agentData);
      setHasChanges(false);
      
      // Auto-expand the panel when agent is selected
      if (!isExpanded) {
        setIsExpanded(true);
      }
    } catch (err) {
      console.error('Error loading agent data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load agent data');
      
      // If agent doesn't exist, create default structure from schema
      if (schema && !treeData.length) {
        const defaultTree = createDefaultTreeFromSchema(schema);
        setTreeData(defaultTree);
        setExpandedItems(getAllItemIds(defaultTree));
        setHasChanges(false);
        setOriginalData({});
      }
    } finally {
      setIsLoading(false);
    }
  };

  const cleanAgentData = (data: any): any => {
    if (!data || typeof data !== 'object') return {};
    
    const cleaned: any = {};
    
    // Only include valid agent properties based on BaseAgentProperties schema
    const validAgentFields = [
      'instructions', 'function', 'class', 'command', 'tools', 'toolbox', 
      'args', 'allow', 'display_as', 'max_message_history', 'verbose', 'llm_config'
    ];
    
    // Fields that should be excluded from updates
    const excludedFields = ['name', '_parent', 'agent_type', 'template'];
    
    for (const [key, value] of Object.entries(data)) {
      // Skip invalid fields and excluded fields
      if (!validAgentFields.includes(key) || excludedFields.includes(key)) continue;
      
      // Skip undefined, null, or empty values
      if (value === undefined || value === null || value === '') continue;
      
      // Handle special cases
      if (key === 'tools' && typeof value === 'object' && !Array.isArray(value)) {
        // Convert object to array if it looks like an indexed object
        const toolsArray = Object.values(value).filter(v => typeof v === 'string');
        if (toolsArray.length > 0) {
          cleaned[key] = toolsArray;
        }
      } else if (key === 'function' && typeof value === 'string') {
        // Keep function as string
        cleaned[key] = value;
      } else if (key === 'class' && (typeof value === 'string' || value === null)) {
        // Handle class field (can be string or null)
        if (value !== null && value !== '') {
          cleaned[key] = value;
        }
      } else if (key === 'llm_config' && typeof value === 'object' && value !== null) {
        // Clean llm_config object
        const cleanedLlmConfig: any = {};
        for (const [llmKey, llmValue] of Object.entries(value)) {
          if (llmValue !== undefined && llmValue !== null && llmValue !== '') {
            cleanedLlmConfig[llmKey] = llmValue;
          }
        }
        if (Object.keys(cleanedLlmConfig).length > 0) {
          cleaned[key] = cleanedLlmConfig;
        }
      } else if (Array.isArray(value)) {
        // Keep arrays as-is if they have content
        const filteredArray = value.filter(v => v !== undefined && v !== null && v !== '');
        if (filteredArray.length > 0) {
          cleaned[key] = filteredArray;
        }
      } else if (typeof value === 'object' && value !== null) {
        // Clean nested objects
        const cleanedNested = cleanAgentData(value);
        if (Object.keys(cleanedNested).length > 0) {
          cleaned[key] = cleanedNested;
        }
      } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        // Keep primitive values
        cleaned[key] = value;
      }
    }
    
    return cleaned;
  };

  const saveAgentData = async () => {
    if (!selectedAgentName || !selectedDesignId || !apiUrl || !hasChanges) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Convert tree data back to JSON
      const rawData = treeDataToJson(treeData);
      console.log('rawData from tree:', rawData);
      
      // Clean the data to match API expectations
      const cleanedData = cleanAgentData(rawData);
      console.log('cleanedData for API:', cleanedData);
      
      // Validate that we have some data to send
      if (Object.keys(cleanedData).length === 0) {
        throw new Error('No valid data to update');
      }
      
      // Log the final request body for debugging
      console.log('Final request body:', JSON.stringify(cleanedData, null, 2));
      
      // Also log the URL for debugging
      console.log('API URL:', `${apiUrl}/api/v1/andeditor/networks/${selectedDesignId}/agents/${selectedAgentName}`);
      
      // Log the headers for debugging
      console.log('Request headers:', { 'Content-Type': 'application/json' });
      
      const response = await fetch(`${apiUrl}/api/v1/andeditor/networks/${selectedDesignId}/agents/${selectedAgentName}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanedData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error Response:', errorText);
        console.error('Request body that failed:', JSON.stringify(cleanedData, null, 2));
        throw new Error(`Failed to save agent: ${response.status} ${response.statusText} - ${errorText}`);
      }

      await response.json();
      setSuccess('Agent updated successfully');
      setHasChanges(false);
      setOriginalData(cleanedData);
      
      // Notify parent component
      onAgentUpdated();
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error saving agent data:', err);
      setError(err instanceof Error ? err.message : 'Failed to save agent data');
    } finally {
      setIsSaving(false);
    }
  };


  const handleAddItem = useCallback((parentId?: string) => {
    const newId = `item_${nextId}`;
    const newItem: SlyTreeItem = { 
      id: newId, 
      label: 'new_key: "new_value"', 
      key: 'new_key', 
      value: 'new_value', 
      parentId, 
      isKeyValuePair: true, 
      type: 'string', 
      depth: parentId ? (treeData.find(item => item.id === parentId)?.depth || 0) + 1 : 0, 
      hasValue: true 
    };
    
    if (!parentId) {
      setTreeData(prev => [...prev, newItem]);
    } else {
      setTreeData(prev => {
        const updateItems = (items: SlyTreeItem[]): SlyTreeItem[] => items.map((item) => {
          if (item.id === parentId) {
            return { ...item, children: [...(item.children || []), newItem], hasValue: false, value: undefined };
          }
          if (item.children) return { ...item, children: updateItems(item.children) };
          return item;
        });
        return updateItems(prev);
      });
    }
    
    setNextId(prev => prev + 1);
    setHasChanges(true);
  }, [nextId, treeData]);

  const handleDeleteItem = useCallback((itemId: string) => {
    setTreeData(prev => {
      const removeItem = (items: SlyTreeItem[]): SlyTreeItem[] => items
        .filter((item) => item.id !== itemId)
        .map((item) => {
          const updatedChildren = item.children ? removeItem(item.children) : undefined;
          if (item.children && item.children.length > 0 && (!updatedChildren || updatedChildren.length === 0)) {
            return { ...item, children: undefined, hasValue: false, value: undefined };
          }
          return { ...item, children: updatedChildren };
        });
      return removeItem(prev);
    });
    setHasChanges(true);
  }, []);

  const handleUpdateKey = useCallback((id: string, newKey: string) => {
    setTreeData(prev => {
      const updateItem = (items: SlyTreeItem[]): SlyTreeItem[] => items.map((item) => {
        if (item.id === id) {
          return { ...item, key: newKey, label: item.hasValue ? `${newKey}: ${typeof item.value === 'string' ? `"${item.value}"` : String(item.value)}` : newKey };
        }
        if (item.children) return { ...item, children: updateItem(item.children) };
        return item;
      });
      return updateItem(prev);
    });
    setHasChanges(true);
  }, []);

  const handleUpdateValue = useCallback((id: string, newValue: any) => {
    setTreeData(prev => {
      const updateItem = (items: SlyTreeItem[]): SlyTreeItem[] => items.map((item) => {
        if (item.id === id) {
          let parsedValue: any = newValue;
          try {
            if (typeof newValue === 'string') {
              if (newValue.startsWith('"') && newValue.endsWith('"')) parsedValue = newValue.slice(1, -1);
              else if (!isNaN(Number(newValue))) parsedValue = Number(newValue);
              else if (newValue === 'true' || newValue === 'false') parsedValue = newValue === 'true';
              else if (newValue === 'null') parsedValue = null;
            }
          } catch { parsedValue = newValue; }
          return { ...item, value: parsedValue, hasValue: true, children: undefined, type: typeof parsedValue as any, label: `${item.key}: ${typeof parsedValue === 'string' ? `"${parsedValue}"` : String(parsedValue)}` };
        }
        if (item.children) return { ...item, children: updateItem(item.children) };
        return item;
      });
      return updateItem(prev);
    });
    setHasChanges(true);
  }, []);

  const handleLabelChange = useCallback((itemId: TreeViewItemId, newLabel: string) => {
    setTreeData(prev => {
      const updateItem = (items: SlyTreeItem[]): SlyTreeItem[] => items.map((item) => {
        if (item.id === itemId) {
          const match = newLabel.match(/^([^:]+):\s*(.+)$/);
          if (match) {
            const [, key, valueStr] = match;
            let value: any = valueStr.trim();
            try {
              if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
              else if (!isNaN(Number(value))) value = Number(value);
              else if (value === 'true' || value === 'false') value = value === 'true';
              else if (value === 'null') value = null;
            } catch { /* keep string */ }
            return { ...item, label: newLabel, key: key.trim(), value, type: typeof value as any };
          }
          return { ...item, label: newLabel };
        }
        if (item.children) return { ...item, children: updateItem(item.children) };
        return item;
      });
      return updateItem(prev);
    });
    setHasChanges(true);
  }, []);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const togglePinned = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPinned(!isPinned);
  };

  const handleClose = () => {
    setIsExpanded(false);
    setTreeData([]);
    setExpandedItems([]);
    setHasChanges(false);
    setOriginalData(null);
    setError(null);
    setSuccess(null);
  };

  const treeOpsValue = {
    handleDeleteItem,
    handleAddItem,
    handleAddWithConflictCheck: handleAddItem,
    handleUpdateKey,
    handleUpdateValue,
    treeData
  };

  return (
    <Paper
      ref={panelRef}
      elevation={8}
      sx={{
        position: 'fixed',
        bottom: 16,
        right: 660, // Position at bottom right
        zIndex: theme.zIndex.drawer + 1,
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 2,
        transition: 'all 0.2s ease-in-out',
        width: isExpanded ? 600 : 100,
        height: isExpanded ? 500 : 40,
        overflow: 'hidden'
      }}
    >
      {/* Header/Toggle Button */}
      <Box
        onClick={toggleExpanded}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1,
          cursor: 'pointer',
          borderBottom: isExpanded ? `1px solid ${theme.palette.divider}` : 'none',
          '&:hover': {
            backgroundColor: alpha(theme.palette.primary.main, 0.05)
          }
        }}
      >
        {isExpanded ? (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <EditIcon sx={{ color: theme.palette.primary.main, fontSize: 16 }} />
              <Typography variant="body2" sx={{ 
                color: theme.palette.text.primary,
                fontWeight: 500,
                fontSize: '0.8rem'
              }}>
                Agent: {selectedAgentName}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {hasChanges && (
                <Button
                  size="small"
                  variant="contained"
                  startIcon={isSaving ? <CircularProgress size={16} /> : <SaveIcon />}
                  onClick={(e) => {
                    e.stopPropagation();
                    saveAgentData();
                  }}
                  disabled={isSaving || !hasChanges}
                  sx={{
                    minWidth: 'auto',
                    px: 1.5,
                    py: 0.5,
                    fontSize: '0.75rem',
                    textTransform: 'none',
                    '& .MuiButton-startIcon': {
                      marginRight: 0.5
                    }
                  }}
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
              )}
              <IconButton
                size="small"
                onClick={togglePinned}
                sx={{
                  color: isPinned ? theme.palette.primary.main : theme.palette.text.secondary,
                  '&:hover': { 
                    color: isPinned ? theme.palette.primary.dark : theme.palette.text.primary,
                    backgroundColor: alpha(theme.palette.primary.main, 0.1)
                  },
                  p: 0.5
                }}
                title={isPinned ? "Unpin (auto-close on outside click)" : "Pin (stay open)"}
              >
                {isPinned ? (
                  <PinIcon sx={{ fontSize: 14 }} />
                ) : (
                  <UnpinIcon sx={{ fontSize: 14 }} />
                )}
              </IconButton>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClose();
                }}
                sx={{
                  color: theme.palette.text.secondary,
                  '&:hover': { color: theme.palette.text.primary },
                  p: 0.5
                }}
                title="Close"
              >
                <CloseIcon sx={{ fontSize: 14 }} />
              </IconButton>
              <ChevronDownIcon sx={{ color: theme.palette.text.secondary, fontSize: 16 }} />
            </Box>
          </>
        ) : (
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 0.5, 
            width: '100%', 
            justifyContent: 'center' 
          }}>
            <EditIcon sx={{ color: theme.palette.primary.main, fontSize: 16 }} />
            <Typography variant="caption" sx={{ 
              color: theme.palette.text.primary,
              fontSize: '0.65rem'
            }}>
              Agent
            </Typography>
            <ChevronUpIcon sx={{ color: theme.palette.text.secondary, fontSize: 12 }} />
          </Box>
        )}
      </Box>

      {/* Expanded Content */}
      <Collapse in={isExpanded} timeout={300}>
        <Box sx={{ 
          height: 452, // 500 - 48 (header height)
          overflow: 'hidden',
          backgroundColor: theme.palette.background.default,
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Status Messages */}
          {(error || success) && (
            <Box sx={{ p: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
              {error && (
                <Alert severity="error" sx={{ fontSize: '0.75rem', py: 0.5 }}>
                  {error}
                </Alert>
              )}
              {success && (
                <Alert severity="success" sx={{ fontSize: '0.75rem', py: 0.5 }}>
                  {success}
                </Alert>
              )}
            </Box>
          )}

          {/* Tree Editor */}
          <Box sx={{ flexGrow: 1, overflow: 'auto', p: 1 }}>
            {isLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <CircularProgress size={24} />
                <Typography variant="body2" sx={{ ml: 1, color: theme.palette.text.secondary }}>
                  Loading agent data...
                </Typography>
              </Box>
            ) : treeData.length > 0 ? (
              <TreeOperationsContext.Provider value={treeOpsValue}>
                <RichTreeView
                  items={treeData as any}
                  expandedItems={expandedItems}
                  onExpandedItemsChange={(_, itemIds) => setExpandedItems(itemIds)}
                  onItemLabelChange={handleLabelChange}
                  isItemEditable={(item) => Boolean((item as any)?.isKeyValuePair)}
                  slots={{ item: CustomTreeItem as any }}
                  sx={{ 
                    color: theme.palette.text.primary, 
                    '& .MuiTreeItem-root': { 
                      '& .MuiTreeItem-content': { 
                        padding: '4px 0', 
                        paddingLeft: '0px !important', 
                        color: theme.palette.text.primary, 
                        '&:hover': { backgroundColor: customTheme.custom.slyData.hoverBackground }, 
                        '&.Mui-focused': { backgroundColor: alpha(theme.palette.primary.main, 0.1), color: theme.palette.primary.main } 
                      }, 
                      '& .MuiTreeItem-iconContainer': { 
                        marginRight: '4px', 
                        minWidth: '24px', 
                        '& .MuiSvgIcon-root': { color: theme.palette.text.secondary, fontSize: '1rem' } 
                      } 
                    } 
                  }}
                />
              </TreeOperationsContext.Provider>
            ) : selectedAgentName ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2, color: theme.palette.text.secondary }}>
                <EditIcon sx={{ fontSize: 48, color: theme.palette.text.disabled }} />
                <Typography variant="body1" sx={{ color: theme.palette.text.primary }}>No agent data available</Typography>
                <Typography variant="body2" sx={{ textAlign: 'center', maxWidth: 300, color: theme.palette.text.secondary }}>
                  Agent '{selectedAgentName}' has no editable properties or failed to load.
                </Typography>
                {schema && (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => {
                      const defaultTree = createDefaultTreeFromSchema(schema);
                      setTreeData(defaultTree);
                      setExpandedItems(getAllItemIds(defaultTree));
                      setHasChanges(true);
                    }}
                    sx={{ mt: 1 }}
                  >
                    Create from Schema
                  </Button>
                )}
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2, color: theme.palette.text.secondary }}>
                <EditIcon sx={{ fontSize: 48, color: theme.palette.text.disabled }} />
                <Typography variant="body1" sx={{ color: theme.palette.text.primary }}>Select an agent to edit</Typography>
                <Typography variant="body2" sx={{ textAlign: 'center', maxWidth: 300, color: theme.palette.text.secondary }}>
                  Right-click on an agent and select "Edit Agent" or double-click to start editing.
                </Typography>
                {schema && (
                  <Typography variant="caption" sx={{ textAlign: 'center', maxWidth: 300, color: theme.palette.text.secondary, mt: 1 }}>
                    Available fields: {Object.keys(schema.properties || {}).join(', ')}
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        </Box>
      </Collapse>

      {/* Collapsed state indicator */}
      {!isExpanded && selectedAgentName && (
        <Box sx={{
          position: 'absolute',
          top: 4,
          right: 4,
          width: 6,
          height: 6,
          backgroundColor: theme.palette.primary.main,
          borderRadius: '50%',
          animation: 'pulse 2s infinite',
          '@keyframes pulse': {
            '0%': { opacity: 1 },
            '50%': { opacity: 0.5 },
            '100%': { opacity: 1 }
          }
        }} />
      )}
    </Paper>
  );
};

export default NetworkAgentEditorPanel;
