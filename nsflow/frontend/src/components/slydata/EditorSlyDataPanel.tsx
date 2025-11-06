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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, IconButton, Paper, Tooltip, Typography, alpha, TextField, InputAdornment } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { DataObject as DataObjectIcon, Download as DownloadIcon, Upload as UploadIcon, Info as InfoIcon, Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { JsonEditor, ThemeInput } from 'json-edit-react';
import ScrollableMessageContainer from '../ScrollableMessageContainer';
import { useChatContext } from '../../context/ChatContext';
import { useTheme, useJsonEditorTheme } from '../../context/ThemeContext';
import { useSlyDataCache } from '../../hooks/useSlyDataCache';
import { ImportDialog, type ImportDialogState } from './ImportDialog';
import { ClearAllDialog } from './ClearAllDialog';

/* ---------------- helpers ---------------- */

const isPlainObject = (o: any) => o && typeof o === 'object' && !Array.isArray(o);
const isNonEmptyObject = (o: any) => isPlainObject(o) && Object.keys(o).length > 0;

const stableStringify = (value: any): string => {
  const seen = new WeakSet();
  const norm = (v: any): any => {
    if (v && typeof v === 'object') {
      if (seen.has(v)) return '__CIRCULAR__';
      seen.add(v);
      if (Array.isArray(v)) return v.map(norm);
      const out: Record<string, any> = {};
      for (const k of Object.keys(v).sort()) out[k] = norm(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(norm(value));
};

const tryParse = (s: string): any => { try { return JSON.parse(s); } catch { return undefined; } };

/** tolerate code-fenced strings or raw objects/strings */
const extractJsonObjectFromString = (s: string): any | undefined => {
  if (typeof s !== 'string') return undefined;
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    const parsed = tryParse(fence[1]);
    if (isPlainObject(parsed)) return parsed;
  }
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    const guess = s.slice(start, end + 1);
    const parsed = tryParse(guess);
    if (isPlainObject(parsed)) return parsed;
  }
  const parsed = tryParse(s);
  if (isPlainObject(parsed)) return parsed;
  return undefined;
};

const extractSlyDataFromMessage = (msg: any): any | undefined => {
  const raw = typeof msg?.text === 'string' ? extractJsonObjectFromString(msg.text) : (msg?.text ?? msg);
  if (!raw) return undefined;
  if (isPlainObject(raw) && isPlainObject((raw as any).sly_data)) return (raw as any).sly_data;
  if (isPlainObject(raw)) return raw;
  return undefined;
};

const getLatestSlyDataFromMessages = (msgs: any[]): any | undefined => {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const v = extractSlyDataFromMessage(msgs[i]);
    if (isPlainObject(v)) return v;
  }
  return undefined;
};

/* ---------------- component ---------------- */

const EditorSlyDataPanel: React.FC = () => {
  const { slyDataMessages, targetNetwork, addSlyDataMessage } = useChatContext();
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
  const [editorVersion, setEditorVersion] = useState(0);

  const { saveSlyDataToCache, loadSlyDataFromCache, clearSlyDataCache } = useSlyDataCache();

  /* ---- init & cache ---- */

  useEffect(() => {
    if (!isInitialized && targetNetwork) {
      setIsLoadingCache(true);
      const cached = loadSlyDataFromCache(targetNetwork);
      setJsonData(cached?.data ?? {});
      setHasLocalEdits(false);
      setIsInitialized(true);
      setIsLoadingCache(false);
    }
  }, [targetNetwork, loadSlyDataFromCache, isInitialized]);

  useEffect(() => {
    if (isInitialized && targetNetwork) {
      setIsLoadingCache(true);
      const cached = loadSlyDataFromCache(targetNetwork);
      setJsonData(cached?.data ?? {});
      setHasLocalEdits(false);
      setIsLoadingCache(false);
    }
  }, [targetNetwork, loadSlyDataFromCache, isInitialized]);

  useEffect(() => {
    if (!isInitialized || !targetNetwork || isLoadingCache) return;
    saveSlyDataToCache(jsonData, targetNetwork, 1);
  }, [jsonData, isInitialized, targetNetwork, saveSlyDataToCache, isLoadingCache]);

  /* ---- derive editor state from global slyDataMessages ---- */

  const latestSigRef = useRef<string>('INIT');

  // only use the global stream; both agent + user edits go through addSlyDataMessage
  useEffect(() => {
    const latest = getLatestSlyDataFromMessages(slyDataMessages ?? []);
    const sig = stableStringify(latest ?? '__EMPTY__');

    if (sig === latestSigRef.current) return;
    latestSigRef.current = sig;

    if (latest && isPlainObject(latest)) {
      setJsonData(latest);
      setHasLocalEdits(false);
      if (targetNetwork) saveSlyDataToCache(latest, targetNetwork, 1);
      setEditorVersion(v => v + 1);
    }
  }, [slyDataMessages, saveSlyDataToCache, targetNetwork]);

  /* ---- actions ---- */

  const hasData = isNonEmptyObject(jsonData);
  const addDisabled = hasData;
  const deleteDisabled = !hasData;

  // Emit a "user edit" message via context so it persists across tabs/panels
  const emitUserSlyMessage = useCallback((obj: any) => {
    const pretty = JSON.stringify(obj, null, 2);
    const textAsCodeBlock = `\`\`\`json\n${pretty}\n\`\`\``;
    addSlyDataMessage({
      sender: 'user',
      text: textAsCodeBlock,
      network: targetNetwork || undefined,
    });
  }, [addSlyDataMessage, targetNetwork]);

  const handleJsonUpdate = useCallback((update: any) => {
    const next = update?.newData ?? update?.data ?? {};
    setJsonData(next);
    setHasLocalEdits(true);
    if (targetNetwork) saveSlyDataToCache(next, targetNetwork, 1);
    emitUserSlyMessage(next);             // <- key change: send to global stream
    setEditorVersion(v => v + 1);
  }, [emitUserSlyMessage, saveSlyDataToCache, targetNetwork]);

  const handleAddRootItem = useCallback(() => {
    setJsonData((prev: any) => {
      if (isNonEmptyObject(prev)) return prev;
      const next = { ...prev, new_key: 'new_value' };
      setHasLocalEdits(true);
      if (targetNetwork) saveSlyDataToCache(next, targetNetwork, 1);
      emitUserSlyMessage(next);
      return next;
    });
  }, [emitUserSlyMessage, saveSlyDataToCache, targetNetwork]);

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
          if (parsed === null || parsed === undefined) validationError = 'JSON data cannot be null or undefined';
          else if (typeof parsed !== 'object') validationError = 'Root element must be an object, not a primitive value';
          else if (Array.isArray(parsed)) validationError = 'Root element must be an object, not an array';
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
      const next = importDialog.jsonData;
      setJsonData(next);
      setHasLocalEdits(true);
      if (targetNetwork) saveSlyDataToCache(next, targetNetwork, 1);
      emitUserSlyMessage(next);
      setEditorVersion(v => v + 1);
      setImportDialog({ open: false, fileName: '', jsonData: null, hasExistingData: false, validationError: null });
    }
  };
  const handleImportCancel = () => setImportDialog({ open: false, fileName: '', jsonData: null, hasExistingData: false, validationError: null });

  const handleClearAll = () => setClearDialog(true);
  const handleClearConfirm = () => {
    const next = {};
    setJsonData(next);
    if (targetNetwork) clearSlyDataCache(targetNetwork);
    emitUserSlyMessage(next);
    setClearDialog(false);
    setEditorVersion(v => v + 1);
  };
  const handleClearCancel = () => setClearDialog(false);

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMessage(index);
      setTimeout(() => setCopiedMessage(null), 1000);
    });
  };

  const downloadLogs = () => {
    const logText = (slyDataMessages ?? []).map((msg: any) => {
      const text = typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text);
      return `${msg.sender || 'agent'}: ${text}`;
    }).join('\n');
    const blob = new Blob([logText], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'slydata_logs.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleExportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'slydata.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [jsonData]);

  /* ---- render ---- */

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
                messages={(slyDataMessages ?? []).filter((msg: any) => {
                  const text = typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text);
                  return text.trim().length > 0 && text.trim() !== '{}';
                })}
                copiedMessage={copiedMessage}
                onCopy={copyToClipboard}
                renderSenderLabel={(msg: any) =>
                  msg?.sender === 'user' ? 'user' : (msg.network || msg.sender || 'agent')
                }
                getMessageClass={(msg: any) =>
                  `chat-msg ${msg.sender === 'user' ? 'chat-msg-user' : msg.sender === 'agent' ? 'chat-msg-agent' : 'chat-msg-system'}`
                }
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
