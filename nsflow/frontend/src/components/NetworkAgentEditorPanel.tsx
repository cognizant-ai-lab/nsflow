/*
Copyright © 2025 Cognizant Technology Solutions Corp, www.cognizant.com.

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
  CircularProgress, Alert, TextField, InputAdornment, Tooltip, Dialog, DialogTitle,
  DialogContent, DialogActions } from '@mui/material';
import ChevronUpIcon from "@mui/icons-material/ExpandLess";
import ChevronDownIcon from "@mui/icons-material/ExpandMore";
import EditIcon from "@mui/icons-material/Edit";
import PinIcon from "@mui/icons-material/PushPin";
import UnpinIcon from "@mui/icons-material/PushPinOutlined";
import SaveIcon from "@mui/icons-material/Save";
import RenameIcon from "@mui/icons-material/DriveFileRenameOutline";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import { useApiPort } from '../context/ApiPortContext';
import { useJsonEditorTheme } from '../context/ThemeContext';
import { JsonEditor, ThemeInput } from 'json-edit-react';
import { selectEntry, useEditorNetworkStore } from "../state/editorNetworkStore";
import { canRename, renameAgent, updateAgent } from "../state/editorOperations";
import { sendEditorUpdate } from "../state/editorRoundTrip";

/**
 * Which of an agent's fields this panel edits.
 *
 * `origin` and `tools` are structure, and structure belongs to the canvas: the name
 * identifies the node everywhere else in the definition, and the down-chains are what
 * the edges are. Editing either as free text here would let the two disagree, and
 * both already have direct affordances — rename via the node, wire via the edges or
 * the chat. What is left is the agent's content, which is what a user opens this
 * panel for.
 */
const STRUCTURAL_FIELDS = ["origin", "tools"] as const;

const toEditableFields = (agent: Record<string, unknown>): Record<string, unknown> => {
  const editable: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(agent)) {
    if ((STRUCTURAL_FIELDS as readonly string[]).includes(key)) continue;
    editable[key] = value;
  }
  return editable;
};


interface NetworkAgentEditorPanelProps {
  networkId: string;
  selectedAgentName: string | null;
  onAgentUpdated: () => void;
  /** Called with the new name after a rename, so the caller can follow the agent. */
  onAgentRenamed?: (newName: string) => void;
  onClose?: () => void;
  autoExpand?: boolean; // When true, panel auto-expands on agent selection
}

const NetworkAgentEditorPanel: React.FC<NetworkAgentEditorPanelProps> = ({
  networkId,
  selectedAgentName,
  onAgentUpdated,
  onAgentRenamed,
  onClose,
  autoExpand = false
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
  
  const panelRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const jsonEditorTheme = useJsonEditorTheme();
  const { apiUrl } = useApiPort();
  const entry = useEditorNetworkStore((state) => selectEntry(state, networkId));
  const applyEdit = useEditorNetworkStore((state) => state.applyEdit);

  const [searchText, setSearchText] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  // Only an LLM agent of this network can be renamed: a tool's name is the tool it
  // resolves to, and an external reference's name is what it points at.
  const canRenameSelected = Boolean(
    selectedAgentName && canRename(entry?.definition ?? [], selectedAgentName)
  );

  const submitRename = useCallback(async () => {
    const definition = entry?.definition ?? [];
    const proposed = renameValue.trim();
    if (!selectedAgentName || !apiUrl) return;
    const next = renameAgent(definition, selectedAgentName, proposed);
    setIsRenaming(false);
    if (next === definition) return;

    applyEdit(networkId, next);
    // The panel follows the agent to its new name, or it would sit on one that no
    // longer exists.
    onAgentRenamed?.(proposed);
    try {
      await sendEditorUpdate({
        apiUrl,
        networkId,
        agentName: proposed,
        definition: next,
        message: `Rename agent "${selectedAgentName}" to "${proposed}"`,
      });
    } catch (err) {
      console.error('Failed to rename agent:', err);
      // The canvas already shows the new name, so without this the user has no way to
      // know the network on the server still has the old one. Not rolled back: the
      // store is what the canvas draws from, and renaming it back underneath the user
      // is a worse surprise than being told the save did not land.
      setError(
        err instanceof Error
          ? `Renamed here but not saved: ${err.message}`
          : 'Renamed here but not saved.'
      );
    }
  }, [entry?.definition, renameValue, selectedAgentName, apiUrl, networkId, applyEdit, onAgentRenamed]);

  // Data validation helpers
  const hasData = jsonData && typeof jsonData === 'object' && !Array.isArray(jsonData) && Object.keys(jsonData).length > 0;
  const hasChangesToSave = hasChanges;


  // Handle clicking outside to collapse when not pinned
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        if (isExpanded && !isPinned) {
          setIsExpanded(false);
          onClose?.();
        }
      }
    };

    if (isExpanded && !isPinned) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isExpanded, isPinned, onClose]);

  // Load schema on component mount
  useEffect(() => {
    if (apiUrl) {
      loadSchema();
    }
  }, [apiUrl]);

  // Load agent data when selectedAgentName or apiUrl changes
  useEffect(() => {
    if (selectedAgentName && apiUrl) {
      loadAgentData();
    } else {
      setJsonData({});
      setHasChanges(false);
      setOriginalData(null);
      setError(null);
      setSuccess(null);
    }
  }, [selectedAgentName, apiUrl, entry?.definition]);

  // Expand panel when autoExpand becomes true (e.g. double-click on already-selected agent)
  useEffect(() => {
    if (autoExpand && selectedAgentName && !isExpanded) {
      setIsExpanded(true);
    }
  }, [autoExpand, selectedAgentName]);

  // The editable surface of an agent is simply what a connectivity entry carries.
  // This used to be fetched from /andeditor/schemas/base-agent-properties; holding
  // it here removes a backend round-trip for a list that only changes when
  // neuro-san's own entry shape changes.
  const loadSchema = async () => {
    setSchema({
      type: "object",
      properties: {
        instructions: { type: "string" },
        description: { type: "string" },
        display_as: { type: "string" },
      },
    });
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

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // The agent is already in the store: the definition the canvas renders is the
      // same one the panel edits, so there is nothing to fetch.
      const agentData = entry?.definition.find((agent) => agent.origin === selectedAgentName);
      if (!agentData) {
        setIsLoading(false);
        return;
      }

      const editable = toEditableFields(agentData);
      setJsonData(editable);
      setOriginalData(editable);
      setHasChanges(false);

      // Auto-expand the panel only when explicitly requested (double-click, right-click -> open)
      if (autoExpand && !isExpanded) setIsExpanded(true);
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
    // `description` was missing, so the panel offered it for editing and then threw
    // the edit away, and Save still reported success.
    const validAgentFields = [
      'instructions', 'description', 'function', 'class', 'command', 'tools', 'toolbox',
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
    if (!selectedAgentName || !apiUrl || !hasChanges) return;

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
      
      // Log the headers for debugging
      // console.log('Request headers:', { 'Content-Type': 'application/json' });
      
      if (!entry || !selectedAgentName) throw new Error('No agent selected');

      // Apply locally so the canvas updates at once, then let the designer
      // canonicalise it. `updateAgent` returns the same array when nothing matched.
      const next = updateAgent(entry.definition, selectedAgentName, cleanedData);
      applyEdit(networkId, next);
      await sendEditorUpdate({
        apiUrl: apiUrl as string,
        networkId,
        agentName: selectedAgentName,
        definition: next,
      });

      setSuccess('Agent updated successfully');
      setHasChanges(false);
      setOriginalData(cleanedData);

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
    // `update.newData` holds the new full JSON value; `update.data` may be empty.
    // `update.newData` contains the new full JSON value, `update.data` might be empty
    const next = update.newData ?? update.data ?? {}; // fall back to empty object if no data
    // console.log('JsonEditor update - next data:', next, 'keys count:', Object.keys(next).length);
    setJsonData(next);
    setHasChanges(true);
  }, []);

  // Handle adding a new root item
  const handleAddRootItem = useCallback(() => {
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
    setJsonData({});
    setHasChanges(false);
    setOriginalData(null);
    setError(null);
    setSuccess(null);
    onClose?.();
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
              {canRenameSelected && (
                // Renaming is an edit like any other, but it is the one that also has
                // to follow every reference, so it goes through renameAgent rather
                // than the JSON editor below.
                <Tooltip title="Rename this agent">
                  <IconButton
                    size="small"
                    onClick={(event) => {
                      event.stopPropagation();
                      setRenameValue(selectedAgentName ?? "");
                      setIsRenaming(true);
                    }}
                    sx={{ ml: 0.5, color: theme.palette.text.secondary }}
                  >
                    <RenameIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
            <Dialog
              open={isRenaming}
              onClose={() => setIsRenaming(false)}
              maxWidth="xs"
              fullWidth
              onClick={(event) => event.stopPropagation()}
            >
              <DialogTitle sx={{ pb: 1 }}>Rename agent</DialogTitle>
              <DialogContent sx={{ pb: 1 }}>
                <TextField
                  autoFocus
                  fullWidth
                  size="small"
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void submitRename();
                    }
                  }}
                  helperText="Every agent that chains to this one follows the new name."
                />
              </DialogContent>
              <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button size="small" onClick={() => setIsRenaming(false)} sx={{ textTransform: 'none' }}>
                  Cancel
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => void submitRename()}
                  disabled={!renameValue.trim() || renameValue.trim() === selectedAgentName}
                  sx={{ textTransform: 'none' }}
                >
                  Rename
                </Button>
              </DialogActions>
            </Dialog>
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

              {/* Add button */}
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

              {/* Save button */}
              {hasChangesToSave && (
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
                restrictDrag={false}
                insertAtTop={false}
                showIconTooltips={true}
                viewOnly={false}
              />
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
                  Select an agent to edit
                </Typography>
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
