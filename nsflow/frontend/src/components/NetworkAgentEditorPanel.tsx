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

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Box,  Paper,  Typography,  IconButton,  useTheme, alpha, Collapse, Button, 
  CircularProgress, Alert, TextField, InputAdornment } from '@mui/material';
import { 
  ExpandLess as ChevronUpIcon, ExpandMore as ChevronDownIcon, Edit as EditIcon,
  PushPin as PinIcon, PushPinOutlined as UnpinIcon, Save as SaveIcon,
  Close as CloseIcon, Search as SearchIcon, Add as AddIcon
} from '@mui/icons-material';
import { useApiPort } from '../context/ApiPortContext';
import { useJsonEditorTheme } from '../context/ThemeContext';
import { JsonEditor, ThemeInput } from 'json-edit-react';
import { useChatContext } from "../context/ChatContext";
import { extractProgressPayload } from "../utils/progressHelper";

interface NetworkAgentEditorPanelProps {
  selectedDesignId: string;
  selectedAgentName: string | null;
  onAgentUpdated: () => void;
  enableEditing?: boolean; // Flag to control editing capabilities
}

const NetworkAgentEditorPanel: React.FC<NetworkAgentEditorPanelProps> = ({
  selectedDesignId,
  selectedAgentName,
  onAgentUpdated,
  enableEditing = false
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [jsonData, setJsonData] = useState<any>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [, setOriginalData] = useState<any>(null);
  const [schema, setSchema] = useState<any>(null);
  const { getLastProgressMessage, getLastSlyDataMessage, targetNetwork } = useChatContext();
  
  const panelRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const jsonEditorTheme = useJsonEditorTheme();
  const { apiUrl } = useApiPort();

  const [searchText, setSearchText] = useState('');

  // Data validation helpers
  const hasData = jsonData && typeof jsonData === 'object' && !Array.isArray(jsonData) && Object.keys(jsonData).length > 0;
  const canEdit = !!enableEditing;
  const hasChangesToSave = canEdit && hasChanges;

  const getViewDefinition = useCallback(() => {
    const p = getLastProgressMessage({ network: targetNetwork }) ?? getLastProgressMessage();
    const s = getLastSlyDataMessage({ network: targetNetwork }) ?? getLastSlyDataMessage();
    const payload = extractProgressPayload(s) || extractProgressPayload(p);
    return payload?.agent_network_definition as Record<string, any> | undefined;
  }, [getLastProgressMessage, getLastSlyDataMessage, targetNetwork]);

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

  // Load agent data when selectedAgentName or apiUrl changes
  useEffect(() => {
    if (selectedAgentName && apiUrl && (canEdit ? !!selectedDesignId : true)) {
      loadAgentData();
    } else {
      setJsonData({});
      setHasChanges(false);
      setOriginalData(null);
      setError(null);
      setSuccess(null);
    }
  }, [selectedAgentName, selectedDesignId, apiUrl, canEdit]);

  const loadSchema = async () => {
    if (!apiUrl) return;

    try {
      const response = await fetch(`${apiUrl}/api/v1/andeditor/schemas/base-agent-properties`);
      
      if (!response.ok) {
        throw new Error(`Failed to load schema: ${response.statusText}`);
      }

      const schemaData = await response.json();
      // console.log('Loaded schema:', schemaData);
      setSchema(schemaData);
    } catch (err) {
      console.error('Error loading schema:', err);
      // Don't show error to user for schema loading failure
    }
  };

  const createDefaultDataFromSchema = (schema: any): any => {
    if (!schema || !schema.properties) return {};
    
    const defaultData: any = {};
    
    // Create default values for each property in the schema
    Object.entries(schema.properties).forEach(([key, property]: [string, any]) => {
      if (property.type === 'object' && property.properties) {
        // Handle nested objects (like llm_config)
        const nestedData: any = {};
        Object.entries(property.properties).forEach(([nestedKey]: [string, any]) => {
          nestedData[nestedKey] = "";
        });
        defaultData[key] = nestedData;
      } else {
        defaultData[key] = "";
      }
    });
    
    return defaultData;
  };

  const loadAgentData = async () => {
    if (!selectedAgentName || !apiUrl) return;

    // In edit-mode we still need designId; in view-mode we don’t
    if (canEdit && !selectedDesignId) return;

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      let response: Response;
      if (canEdit && selectedDesignId) {
        // EDIT MODE (unchanged)
        response = await fetch(
          `${apiUrl}/api/v1/andeditor/networks/${selectedDesignId}/agents/${selectedAgentName}`
        );
      } else {
        // VIEW MODE
        const definition = getViewDefinition();
        if (!definition) {
          setIsLoading(false);
          // optional: keep quiet until we have the first payload
          return;
        }
        response = await fetch(
          `${apiUrl}/api/v1/connectivity/from_json/agents/${encodeURIComponent(selectedAgentName)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agent_network_definition: definition }),
          }
        );
      }
      
      if (!response.ok) {
        throw new Error(`Failed to load agent: ${response.statusText}`);
      }

      const data = await response.json();
      const agentData = data.agent?? data;
      // console.log('Loaded agent data:', agentData);

      setJsonData(agentData);
      setOriginalData(agentData);
      setHasChanges(false);
      
      // Auto-expand the panel when agent is selected
      if (!isExpanded) setIsExpanded(true);
    } catch (err) {
      console.error('Error loading agent data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load agent data');
      
      // If agent doesn't exist, create default structure from schema
      if (schema && !hasData) {
        const defaultData = createDefaultDataFromSchema(schema);
        setJsonData(defaultData);
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
    if (!canEdit || !selectedAgentName || !selectedDesignId || !apiUrl || !hasChanges) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Clean the data to match API expectations
      const cleanedData = cleanAgentData(jsonData);
      // console.log('cleanedData for API:', cleanedData);
      
      // Validate that we have some data to send
      if (Object.keys(cleanedData).length === 0) {
        throw new Error('No valid data to update');
      }
      
      // Log the final request body for debugging
      // console.log('Final request body:', JSON.stringify(cleanedData, null, 2));
      
      // Also log the URL for debugging
      // console.log('API URL:', `${apiUrl}/api/v1/andeditor/networks/${selectedDesignId}/agents/${selectedAgentName}`);
      
      // Log the headers for debugging
      // console.log('Request headers:', { 'Content-Type': 'application/json' });
      
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


  // Handle JSON data updates from the editor
  const handleJsonUpdate = useCallback((update: any) => {
    if (!canEdit) return;
    
    // console.log('JsonEditor onUpdate called with:', update);
    // `update.newData` contains the new full JSON value, `update.data` might be empty
    const next = update.newData ?? update.data ?? {}; // fall back to empty object if no data
    // console.log('JsonEditor update - next data:', next, 'keys count:', Object.keys(next).length);
    setJsonData(next);
    setHasChanges(true);
  }, [canEdit]);

  // Handle adding a new root item
  const handleAddRootItem = useCallback(() => {
    if (!canEdit) return;
    
    setJsonData((prev: any) => {
      if (
        prev &&
        typeof prev === 'object' &&
        !Array.isArray(prev) &&
        Object.keys(prev).length > 0
      ) {
        // already has data — no-op
        return prev;
      }
      const next = { ...prev, new_key: 'new_value' };
      setHasChanges(true);
      return next;
    });
  }, [canEdit]);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const togglePinned = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPinned(!isPinned);
  };

  const handleClose = () => {
    setIsExpanded(false);
    setJsonData({});
    setHasChanges(false);
    setOriginalData(null);
    setError(null);
    setSuccess(null);
  };

  return (
    <Paper
      ref={panelRef}
      elevation={8}
      sx={{
        position: 'absolute',
        bottom: 16,
        right: 20, // Position at bottom right
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
              <Typography 
                variant="body2" 
                noWrap
                sx={{ 
                  color: theme.palette.text.primary,
                  fontWeight: 500,
                  fontSize: '0.8rem',
                  textOverflow: 'ellipsis'
                }}
              >
                Agent: {selectedAgentName}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 280 }}>
              {/* Search input (compact + rounded) */}
              <TextField
                size="small"
                placeholder="Search…"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                sx={{
                  // size/shape
                  width: 140,            // change width here
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 1.5,   // 12px radius (theme.spacing * 1.5)
                    height: 32,          // change height here
                  },
                  '& .MuiOutlinedInput-input': {
                    py: 0,               // vertical padding inside
                    px: 1.25,            // horizontal padding inside
                    fontSize: 13,
                  },
                }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  },
                }}
              />

              {/* Add button - only show when editing is enabled */}
              {canEdit && (
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddRootItem();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  disabled={hasData}
                  sx={{
                    color: hasData ? theme.palette.text.disabled : theme.palette.primary.main,
                    '&:disabled': { color: theme.palette.text.disabled },
                    '&:hover': hasData ? undefined : { backgroundColor: alpha(theme.palette.primary.main, 0.1) },
                    p: 0.5,
                  }}
                  title="Add root item"
                >
                  <AddIcon fontSize="small" />
                </IconButton>
              )}

              {/* Save button - only show when editing is enabled */}
              {canEdit && hasChangesToSave && (
                <Button
                  size="small"
                  variant="contained"
                  startIcon={isSaving ? <CircularProgress size={16} /> : <SaveIcon />}
                  onClick={(e) => {
                    e.stopPropagation();
                    saveAgentData();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  disabled={isSaving || !hasChangesToSave}
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
                onMouseDown={(e) => e.stopPropagation()}
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
                onMouseDown={(e) => e.stopPropagation()}
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
            ) : hasData ? (
              <JsonEditor
                data={jsonData}
                onUpdate={handleJsonUpdate}
                theme={jsonEditorTheme as ThemeInput}
                searchText={searchText}
                searchDebounceTime={200}
                enableClipboard={true}
                showArrayIndices={true}
                showStringQuotes={true}
                showCollectionCount={true}
                stringTruncate={250}
                minWidth="100%"
                maxWidth="100%"
                rootFontSize="14px"
                indent={2}
                rootName="agent"
                restrictDrag={!canEdit}
                insertAtTop={false}
                showIconTooltips={true}
                viewOnly={!canEdit}
              />
            ) : selectedAgentName ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2, color: theme.palette.text.secondary }}>
                <EditIcon sx={{ fontSize: 48, color: theme.palette.text.disabled }} />
                <Typography variant="body1" sx={{ color: theme.palette.text.primary }}>No agent data available</Typography>
                <Typography variant="body2" sx={{ textAlign: 'center', maxWidth: 300, color: theme.palette.text.secondary }}>
                  Agent '{selectedAgentName}' has no {canEdit ? 'editable ' : ''}properties or failed to load.
                </Typography>
                {canEdit && schema && (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      const defaultData = createDefaultDataFromSchema(schema);
                      setJsonData(defaultData);
                      setHasChanges(true);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    sx={{ mt: 1 }}
                  >
                    Create from Schema
                  </Button>
                )}
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2, color: theme.palette.text.secondary }}>
                <EditIcon sx={{ fontSize: 48, color: theme.palette.text.disabled }} />
                <Typography variant="body1" sx={{ color: theme.palette.text.primary }}>
                  Select an agent to {canEdit ? 'edit' : 'view'}
                </Typography>
                <Typography variant="body2" sx={{ textAlign: 'center', maxWidth: 300, color: theme.palette.text.secondary }}>
                  {canEdit 
                    ? 'Right-click on an agent and select "Edit Agent" or double-click to start editing.'
                    : 'Right-click on an agent and select "View Agent" to see its properties.'
                  }
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
