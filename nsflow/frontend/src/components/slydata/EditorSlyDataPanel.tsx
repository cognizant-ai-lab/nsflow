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

import React, { useCallback, useEffect, useState } from 'react';
import { Box, IconButton, Paper, Tooltip, Typography, alpha, 
  TextField, InputAdornment
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { DataObject as DataObjectIcon, Download as DownloadIcon, Upload as UploadIcon, Info as InfoIcon, Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { JsonEditor, ThemeInput} from 'json-edit-react';
import ScrollableMessageContainer from '../ScrollableMessageContainer';
import { useChatContext } from '../../context/ChatContext';
import { useApiPort } from '../../context/ApiPortContext';
import { useTheme, useJsonEditorTheme } from '../../context/ThemeContext';
import { useSlyDataCache } from '../../hooks/useSlyDataCache';
import { ImportDialog, type ImportDialogState } from './ImportDialog';
import { ClearAllDialog } from './ClearAllDialog';

// Simple JSON validation for slydata
const validateJsonForSlyData = (data: any): string | null => {
  try {
    if (data === null || data === undefined) return 'JSON data cannot be null or undefined';
    if (typeof data !== 'object') return 'Root element must be an object, not a primitive value';
    if (Array.isArray(data)) return 'Root element must be an object, not an array';

    const seen = new WeakSet();
    const checkCircular = (obj: any): boolean => {
      if (obj && typeof obj === 'object') {
        if (seen.has(obj)) return true;
        seen.add(obj);
        for (const k in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, k)) {
            if (checkCircular(obj[k])) return true;
          }
        }
      }
      return false;
    };
    if (checkCircular(data)) return 'JSON contains circular references which are not supported';

    const validateKeys = (obj: any, path = ''): string | null => {
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            if (typeof key !== 'string') return `Invalid key type at ${path}${key}. Keys must be strings`;
            if (key.trim() === '') return `Empty key found at ${path}. Keys cannot be empty`;
            const value = obj[key];
            if (value && typeof value === 'object' && !Array.isArray(value)) {
              const nested = validateKeys(value, `${path}${key}.`);
              if (nested) return nested;
            }
          }
        }
      }
      return null;
    };

    const keyError = validateKeys(data);
    if (keyError) return keyError;
    return null;
  } catch (e: any) {
    return `Validation error: ${e?.message || 'Unknown error'}`;
  }
};

const EditorSlyDataPanel: React.FC = () => {
  const { slyDataMessages, targetNetwork } = useChatContext();
  const { apiUrl } = useApiPort();
  const { theme } = useTheme();
  const jsonEditorTheme = useJsonEditorTheme();

  const [searchText, setSearchText] = useState('');
  const [searchFilter, setSearchFilter] = useState<'value' | 'key' | 'all'>('all');


  const [jsonData, setJsonData] = useState<any>({});
  const [importDialog, setImportDialog] = useState<ImportDialogState>({ open: false, fileName: '', jsonData: null, hasExistingData: false, validationError: null });
  const [clearDialog, setClearDialog] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null);
  const [lastMessageCount, setLastMessageCount] = useState(() => slyDataMessages.length);
  const [, setHasLocalEdits] = useState(false);
  const [isLoadingCache, setIsLoadingCache] = useState(false);

  const { saveSlyDataToCache, loadSlyDataFromCache, clearSlyDataCache } = useSlyDataCache();

  // Bootstrap: run once per mount when a targetNetwork appears
  useEffect(() => {
    if (!isInitialized && targetNetwork) {
      console.log('Loading cache for network:', targetNetwork);
      setIsLoadingCache(true);
      const cached = loadSlyDataFromCache(targetNetwork);
      console.log('Cached data:', cached);
      if (cached && cached.data) {
        setJsonData(cached.data);
        console.log('Loaded data from cache:', cached.data);
      } else {
        setJsonData({});
        console.log('No cached data, using empty object');
      }
      setLastMessageCount(slyDataMessages.length);
      setHasLocalEdits(false);
      setIsInitialized(true);
      setIsLoadingCache(false);
    }
  }, [targetNetwork, loadSlyDataFromCache, isInitialized, slyDataMessages.length]);

  // Network swap: reload cache for the new network
  useEffect(() => {
    if (isInitialized && targetNetwork) {
      console.log('Network swap - loading cache for:', targetNetwork);
      setIsLoadingCache(true);
      const cached = loadSlyDataFromCache(targetNetwork);
      console.log('Network swap cached data:', cached);
      if (cached && cached.data) {
        setJsonData(cached.data);
        console.log('Network swap loaded data:', cached.data);
      } else {
        setJsonData({});
        console.log('Network swap - no cached data');
      }
      setLastMessageCount(slyDataMessages.length);
      setHasLocalEdits(false);
      setIsLoadingCache(false);
    }
  }, [targetNetwork, loadSlyDataFromCache, isInitialized, slyDataMessages.length]);

  // Persist cache when data changes
  useEffect(() => {
    if (!isInitialized || !targetNetwork || isLoadingCache) return;
    console.log('Caching data:', { jsonData, targetNetwork, keysCount: Object.keys(jsonData).length });
    if (Object.keys(jsonData).length > 0) {
      saveSlyDataToCache(jsonData, targetNetwork, 1);
      console.log('Data saved to cache');
    }
    // Don't clear cache when jsonData is empty - this prevents clearing cache during network transitions
    // Cache should only be cleared when user explicitly clears data via the clear button
  }, [jsonData, isInitialized, targetNetwork, saveSlyDataToCache, isLoadingCache]);

  // Handle JSON data updates from the editor
  const handleJsonUpdate = useCallback((update: any) => {
    console.log('JsonEditor onUpdate called with:', update);
    // `update.newData` contains the new full JSON value, `update.data` might be empty
    const next = update.newData ?? update.data ?? {}; // fall back to empty object if no data
    console.log('JsonEditor update - next data:', next, 'keys count:', Object.keys(next).length);
    setJsonData(next);
    setHasLocalEdits(true);
  }, []);

  // Handle adding a new root item
  const handleAddRootItem = useCallback(() => {
    setJsonData((prevData: any) => {
      const newData = { ...prevData, new_key: "new_value" };
      setHasLocalEdits(true);
      return newData;
    });
  }, []); // Remove jsonData dependency to avoid stale closure

  const handleImportJson = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        let jsonData: any = null;
        let validationError: string | null = null;
        try {
          jsonData = JSON.parse(event.target?.result as string);
        } catch (err: any) {
          validationError = `Invalid JSON format: ${err?.message || 'Unknown parsing error'}`;
        }
        if (!validationError && jsonData !== null) {
          validationError = validateJsonForSlyData(jsonData);
        }
        setImportDialog({ 
          open: true, 
          fileName: file.name, 
          jsonData, 
          hasExistingData: Object.keys(jsonData).length > 0, 
          validationError 
        });
      };
      reader.readAsText(file);
    };
    input.click();
  }, []); // Remove jsonData dependency

  const handleImportConfirm = () => {
    if (importDialog.jsonData && !importDialog.validationError) {
      setJsonData(importDialog.jsonData);
      setHasLocalEdits(true);
      setImportDialog({ open: false, fileName: '', jsonData: null, hasExistingData: false, validationError: null });
    }
  };

  const handleImportCancel = () => setImportDialog({ open: false, fileName: '', jsonData: null, hasExistingData: false, validationError: null });

  const handleClearAll = () => setClearDialog(true);
  const handleClearConfirm = () => {
    setJsonData({});
    if (targetNetwork) {
      clearSlyDataCache(targetNetwork);
      console.log('Cache explicitly cleared by user');
    }
    setClearDialog(false);
  };
  const handleClearCancel = () => setClearDialog(false);

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMessage(index);
      setTimeout(() => setCopiedMessage(null), 1000);
    });
  };

  const downloadLogs = () => {
    const logText = slyDataMessages.map((msg) => `${msg.sender}: ${typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text)}`).join('\n');
    const blob = new Blob([logText], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'slydata_logs.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const fetchLatestSlyData = useCallback(async () => {
    if (!targetNetwork) return;
    const fetchUrl = `${apiUrl}/api/v1/slydata/${targetNetwork}`;

    try {
      const response = await fetch(fetchUrl);
      if (response.status === 404) return;
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

      const result = await response.json();
      const latestData = result.sly_data;

      if (latestData && typeof latestData === 'object' && Object.keys(latestData).length > 0) {
        setJsonData(latestData);
        setHasLocalEdits(false);
      }
    } catch (e) {
      console.error('Failed to fetch latest sly_data:', e);
    }
  }, [apiUrl, targetNetwork]);

  useEffect(() => {
    const currentMessageCount = slyDataMessages.length;
    if (currentMessageCount > lastMessageCount) fetchLatestSlyData();
    console.log(`New sly_data message detected (${lastMessageCount} → ${currentMessageCount}), fetching latest state...`);
    setLastMessageCount(currentMessageCount);
  }, [slyDataMessages.length, lastMessageCount, fetchLatestSlyData]);

  const handleExportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'slydata.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [jsonData]);

  return (
    <Paper elevation={1} sx={{ height: '100%', backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: `1px solid ${theme.palette.divider}` }}>
      <PanelGroup direction="vertical">
        <Panel defaultSize={64} minSize={30}>
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 1.5, borderBottom: `1px solid ${theme.palette.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, backgroundColor: theme.palette.background.paper }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <DataObjectIcon sx={{ color: theme.palette.primary.main, fontSize: '1.25rem' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>SlyData Editor</Typography>
                <Tooltip 
                  title={
                    <Box sx={{ p: 1, maxWidth: 350 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, mb: 1, color: 'inherit' }}>
                        🔒 Security Warning
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'inherit', lineHeight: 1.4 }}>
                        We strongly recommend to not set secrets as values within any sly data here or in any source file, including HOCON files. 
                        These files tend to creep into source control repos, and it is generally not considered a good practice to expose secrets by checking them in.
                      </Typography>
                    </Box>
                  }
                  placement="bottom-start"
                  arrow
                >
                  <InfoIcon 
                    sx={{ 
                      color: theme.palette.warning.main, 
                      fontSize: '1rem', 
                      cursor: 'help',
                      '&:hover': { 
                        color: theme.palette.warning.dark 
                      }
                    }} 
                  />
                </Tooltip>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 280 }}>
                {/* Search input (compact + rounded) */}
                <TextField
                  size="small"
                  placeholder="Search…"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  sx={{
                    // size/shape
                    width: 140,            // ← change width here
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 1.5,   // 12px radius (theme.spacing * 1.5)
                      height: 32,          // ← change height here
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

                {/* existing buttons */}
                <Tooltip title="Add root item">
                  <IconButton size="small" onClick={handleAddRootItem} sx={{ color: theme.palette.primary.main, p: 0.5, '&:hover': { backgroundColor: alpha(theme.palette.primary.main, 0.1) } }}>
                    <AddIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Import JSON">
                  <IconButton size="small" onClick={handleImportJson} sx={{ color: theme.palette.secondary.main, p: 0.5, '&:hover': { backgroundColor: alpha(theme.palette.secondary.main, 0.1) } }}>
                    <DownloadIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Export JSON">
                  <IconButton size="small" onClick={handleExportJson} sx={{ color: theme.palette.warning.main, p: 0.5, '&:hover': { backgroundColor: alpha(theme.palette.warning.main, 0.1) } }}>
                    <UploadIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Clear all data">
                  <IconButton
                    size="small"
                    onClick={handleClearAll}
                    disabled={Object.keys(jsonData).length === 0}
                    sx={{
                      color: Object.keys(jsonData).length > 0 ? theme.palette.error.main : theme.palette.text.disabled,
                      '&:disabled': { color: theme.palette.text.disabled },
                      '&:hover': Object.keys(jsonData).length > 0 ? { backgroundColor: alpha(theme.palette.error.main, 0.1) } : undefined,
                      p: 0.5,
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
            <Box sx={{ flexGrow: 1, overflow: 'auto', p: 1, backgroundColor: theme.palette.background.paper }}>
              {Object.keys(jsonData).length > 0 ? (
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
                  rootName="slydata"
                  restrictDrag={false}
                  insertAtTop={false}
                  showIconTooltips={true}
                />
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2, color: theme.palette.text.secondary }}>
                  <DataObjectIcon sx={{ fontSize: 48, color: theme.palette.text.disabled }} />
                  <Typography variant="body1" sx={{ color: theme.palette.text.primary }}>No SlyData available</Typography>
                  <Typography variant="body2" sx={{ textAlign: 'center', maxWidth: 300, color: theme.palette.text.secondary }}>Click the + button to add your first key-value pair, or import JSON data.</Typography>
                </Box>
              )}
            </Box>
          </Box>
        </Panel>

        <PanelResizeHandle style={{ height: '4px', backgroundColor: theme.palette.divider, cursor: 'row-resize', transition: 'background-color 0.2s ease' }} />

        <Panel defaultSize={36} minSize={20}>
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', borderTop: `1px solid ${theme.palette.divider}`, backgroundColor: theme.palette.background.paper }}>
            <Box sx={{ p: 1.5, borderBottom: `1px solid ${theme.palette.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, backgroundColor: theme.palette.background.paper }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>SlyData Logs</Typography>
                <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>(Message History)</Typography>
              </Box>
              <Tooltip title="Download logs">
                <IconButton size="small" onClick={downloadLogs} sx={{ color: theme.palette.text.secondary, p: 0.5, '&:hover': { color: theme.palette.primary.main, backgroundColor: alpha(theme.palette.primary.main, 0.1) } }}>
                  <DownloadIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <Box sx={{ flexGrow: 1, overflow: 'auto', backgroundColor: theme.palette.background.paper }}>
              <ScrollableMessageContainer
                messages={slyDataMessages.filter((msg) => {
                  const text = typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text);
                  return text.trim().length > 0 && text.trim() !== '{}';
                })}
                copiedMessage={copiedMessage}
                onCopy={copyToClipboard}
                renderSenderLabel={(msg: any) => msg.network || msg.sender}
                getMessageClass={() => 'chat-msg chat-msg-agent'}
              />
            </Box>
          </Box>
        </Panel>
      </PanelGroup>

      <ImportDialog state={importDialog} onConfirm={handleImportConfirm} onCancel={handleImportCancel} currentRootCount={Object.keys(jsonData).length} />
      <ClearAllDialog open={clearDialog} onConfirm={handleClearConfirm} onCancel={handleClearCancel} rootCount={Object.keys(jsonData).length} />
    </Paper>
  );
};

export default EditorSlyDataPanel;
