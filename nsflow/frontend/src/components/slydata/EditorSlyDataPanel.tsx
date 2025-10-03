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

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Box, IconButton, Paper, Tooltip, Typography, alpha, TextField, InputAdornment } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { DataObject as DataObjectIcon, Download as DownloadIcon, Upload as UploadIcon, Info as InfoIcon, Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { JsonEditor, ThemeInput } from 'json-edit-react';
import ScrollableMessageContainer from '../ScrollableMessageContainer';
import { useChatContext } from '../../context/ChatContext';
import { useApiPort } from '../../context/ApiPortContext';
import { useTheme, useJsonEditorTheme } from '../../context/ThemeContext';
import { useSlyDataCache } from '../../hooks/useSlyDataCache';
import { ImportDialog, type ImportDialogState } from './ImportDialog';
import { ClearAllDialog } from './ClearAllDialog';

/** ---------- helpers (module scope) ---------- */
const deepClone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const isNonEmptyObject = (o: any) =>
  o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length > 0;

// Stable stringify (sort keys) so order-only diffs don’t trigger
const stableStringify = (value: any): string => {
  const seen = new WeakSet();
  const helper = (v: any): any => {
    if (v && typeof v === 'object') {
      if (seen.has(v)) return '__CIRCULAR__';
      seen.add(v);
      if (Array.isArray(v)) return v.map(helper);
      const out: Record<string, any> = {};
      for (const k of Object.keys(v).sort()) out[k] = helper(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(helper(value));
};

const lastMessageSignature = (msgs: any[]): string => {
  const last = msgs?.[msgs.length - 1];
  if (!last) return 'EMPTY';
  const content = typeof last?.text === 'string' ? last.text : last;
  return stableStringify(content);
};
/** ------------------------------------------ */

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
  const [jsonData, setJsonData] = useState<any>({});
  const [importDialog, setImportDialog] = useState<ImportDialogState>({
    open: false, fileName: '', jsonData: null, hasExistingData: false, validationError: null
  });
  const [clearDialog, setClearDialog] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null);
  const [isLoadingCache, setIsLoadingCache] = useState(false);
  const [, setHasLocalEdits] = useState(false);

  const { saveSlyDataToCache, loadSlyDataFromCache, clearSlyDataCache } = useSlyDataCache();
  const [editorVersion, setEditorVersion] = useState(0);
  const lastSigRef = useRef<string>('INIT');

  const hasData = isNonEmptyObject(jsonData);
  const addDisabled = hasData;
  const deleteDisabled = !hasData;

  /** Bootstrap: run once when a targetNetwork appears */
  useEffect(() => {
    if (!isInitialized && targetNetwork) {
      console.log('Loading cache for network:', targetNetwork);
      setIsLoadingCache(true);
      const cached = loadSlyDataFromCache(targetNetwork);
      if (cached && cached.data) {
        setJsonData(cached.data);
        console.log('Loaded data from cache:', cached.data);
      } else {
        setJsonData({});
        console.log('No cached data, using empty object');
      }
      setHasLocalEdits(false);
      setIsInitialized(true);
      setIsLoadingCache(false);
    }
  }, [targetNetwork, loadSlyDataFromCache, isInitialized]);

  /** Network swap: reload cache for the new network */
  useEffect(() => {
    if (isInitialized && targetNetwork) {
      console.log('Network swap - loading cache for:', targetNetwork);
      setIsLoadingCache(true);
      const cached = loadSlyDataFromCache(targetNetwork);
      if (cached && cached.data) {
        setJsonData(cached.data);
        console.log('Network swap loaded data:', cached.data);
      } else {
        setJsonData({});
        console.log('Network swap - no cached data');
      }
      setHasLocalEdits(false);
      setIsLoadingCache(false);
    }
  }, [targetNetwork, loadSlyDataFromCache, isInitialized]);

  /** Persist cache whenever jsonData changes (skip during cache read) */
  useEffect(() => {
    if (!isInitialized || !targetNetwork || isLoadingCache) return;
    saveSlyDataToCache(jsonData, targetNetwork, 1);
    console.log('Cache updated', { keysCount: Object.keys(jsonData || {}).length });
  }, [jsonData, isInitialized, targetNetwork, saveSlyDataToCache, isLoadingCache]);

  /** Editor → state */
  const handleJsonUpdate = useCallback((update: any) => {
    const next = update?.newData ?? update?.data ?? {};
    setJsonData(next);
    setHasLocalEdits(true);
  }, []);

  /** Add root item (only when empty) */
  const handleAddRootItem = useCallback(() => {
    setJsonData((prev: any) => {
      if (isNonEmptyObject(prev)) return prev; // no-op if already has data
      const next = { ...prev, new_key: 'new_value' };
      setHasLocalEdits(true);
      return next;
    });
  }, []);

  /** Import JSON */
  const handleImportJson = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        let parsed: any = null;
        let validationError: string | null = null;
        try {
          parsed = JSON.parse(event.target?.result as string);
        } catch (err: any) {
          validationError = `Invalid JSON format: ${err?.message || 'Unknown parsing error'}`;
        }
        if (!validationError && parsed !== null) {
          validationError = validateJsonForSlyData(parsed);
        }
        setImportDialog({
          open: true,
          fileName: file.name,
          jsonData: parsed,
          hasExistingData: isNonEmptyObject(parsed),
          validationError
        });
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  const handleImportConfirm = () => {
    if (importDialog.jsonData && !importDialog.validationError) {
      setJsonData(importDialog.jsonData);
      setHasLocalEdits(true);
      setEditorVersion(v => v + 1); // ensure editor re-mounts on import
      setImportDialog({ open: false, fileName: '', jsonData: null, hasExistingData: false, validationError: null });
    }
  };

  const handleImportCancel = () => setImportDialog({ open: false, fileName: '', jsonData: null, hasExistingData: false, validationError: null });

  /** Clear */
  const handleClearAll = () => setClearDialog(true);
  const handleClearConfirm = () => {
    setJsonData({});
    if (targetNetwork) {
      clearSlyDataCache(targetNetwork);
      console.log('Cache explicitly cleared by user');
    }
    setClearDialog(false);
    setEditorVersion(v => v + 1);
  };
  const handleClearCancel = () => setClearDialog(false);

  /** Clipboard */
  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMessage(index);
      setTimeout(() => setCopiedMessage(null), 1000);
    });
  };

  /** Logs download */
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

  /** Fetch from API when the *last message content* changes */
  const fetchLatestSlyData = useCallback(async () => {
    if (!targetNetwork) return;
    const fetchUrl = `${apiUrl}/api/v1/slydata/${targetNetwork}`;
    try {
      const response = await fetch(fetchUrl);
      if (response.status === 404) {
        setJsonData({});
        setHasLocalEdits(false);
        setEditorVersion(v => v + 1);
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const result = await response.json();
      const latestData = result?.sly_data ?? {};
      setJsonData(deepClone(latestData));
      setHasLocalEdits(false);
      setEditorVersion(v => v + 1);
    } catch (e) {
      console.error('Failed to fetch latest sly_data:', e);
    }
  }, [apiUrl, targetNetwork]);
  
  // Fire when latest message *content* changes, regardless of array length
  useEffect(() => {
    const sig = lastMessageSignature(slyDataMessages);
    if (sig !== lastSigRef.current) {
      lastSigRef.current = sig;
      console.log('[slydata] new/changed last message detected → fetching latest');
      fetchLatestSlyData();
    }
  }, [slyDataMessages, fetchLatestSlyData]);

  /** Export */
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
                <Typography variant="subtitle1" noWrap sx={{ fontWeight: 600, color: theme.palette.text.primary, textOverflow: 'ellipsis' }}>
                  SlyData Editor
                </Typography>
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
                  <InfoIcon sx={{ color: theme.palette.warning.main, fontSize: '1rem', cursor: 'help', '&:hover': { color: theme.palette.warning.dark } }} />
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
                    width: 140,
                    '& .MuiOutlinedInput-root': { borderRadius: 1.5, height: 32 },
                    '& .MuiOutlinedInput-input': { py: 0, px: 1.25, fontSize: 13 },
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

                {/* actions */}
                <Tooltip title="Add root item">
                  <span>
                    <IconButton
                      size="small"
                      onClick={handleAddRootItem}
                      disabled={addDisabled}
                      sx={{
                        color: addDisabled ? theme.palette.text.disabled : theme.palette.primary.main,
                        '&:disabled': { color: theme.palette.text.disabled },
                        '&:hover': addDisabled ? undefined : { backgroundColor: alpha(theme.palette.primary.main, 0.1) },
                        p: 0.5,
                      }}
                    >
                      <AddIcon fontSize="small" />
                    </IconButton>
                  </span>
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
                  <span>
                    <IconButton
                      size="small"
                      onClick={handleClearAll}
                      disabled={deleteDisabled}
                      sx={{
                        color: deleteDisabled ? theme.palette.text.disabled : theme.palette.error.main,
                        '&:disabled': { color: theme.palette.text.disabled },
                        '&:hover': deleteDisabled ? undefined : { backgroundColor: alpha(theme.palette.error.main, 0.1) },
                        p: 0.5,
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            </Box>

            <Box sx={{ flexGrow: 1, overflow: 'auto', p: 1, backgroundColor: theme.palette.background.paper }}>
              {isNonEmptyObject(jsonData) ? (
                <JsonEditor
                  key={`${targetNetwork || 'no-net'}-${editorVersion}`}
                  data={jsonData}
                  onUpdate={handleJsonUpdate}
                  theme={jsonEditorTheme as ThemeInput}
                  searchText={searchText}
                  searchDebounceTime={200}
                  enableClipboard
                  showArrayIndices
                  showStringQuotes
                  showCollectionCount
                  stringTruncate={250}
                  minWidth="100%"
                  maxWidth="100%"
                  rootFontSize="14px"
                  indent={2}
                  rootName="slydata"
                  restrictDrag={false}
                  insertAtTop={false}
                  showIconTooltips
                />
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2, color: theme.palette.text.secondary }}>
                  <DataObjectIcon sx={{ fontSize: 48, color: theme.palette.text.disabled }} />
                  <Typography variant="body1" sx={{ color: theme.palette.text.primary }}>No SlyData available</Typography>
                  <Typography variant="body2" sx={{ textAlign: 'center', maxWidth: 300, color: theme.palette.text.secondary }}>
                    Click the + button to add your first key-value pair, or import JSON data.
                  </Typography>
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
