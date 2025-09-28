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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, IconButton, Paper, Tooltip, Typography, alpha } from '@mui/material';
import { Add as AddIcon, DataObject as DataObjectIcon, Delete as DeleteIcon, Download as DownloadIcon, ExpandLess as CollapseAllIcon, ExpandMore as ExpandAllIcon, Upload as UploadIcon } from '@mui/icons-material';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { RichTreeView } from '@mui/x-tree-view/RichTreeView';
import type { TreeViewItemId } from '@mui/x-tree-view/models';
import ScrollableMessageContainer from '../ScrollableMessageContainer';
import { useChatContext } from '../../context/ChatContext';
import { useApiPort } from '../../context/ApiPortContext';
import { useTheme } from '../../context/ThemeContext';
import { TreeOperationsContext } from '../../context/TreeOperationsContext';
import type { SlyTreeItem } from '../../types/slyTree';
import { CustomTreeItem } from './CustomTreeItem';
import { useSlyDataCache } from '../../hooks/useSlyDataCache';
import { getAllItemIds, jsonToTreeData, treeDataToJson, validateJsonForSlyData } from '../../utils/slydata/jsonTree';
import { ConflictDialog, type ConflictDialogState } from './ConflictDialog';
import { ImportDialog, type ImportDialogState } from './ImportDialog';
import { ClearAllDialog } from './ClearAllDialog';

const EditorSlyDataPanel: React.FC = () => {
  const { slyDataMessages, targetNetwork } = useChatContext();
  const { apiUrl } = useApiPort();
  const { theme } = useTheme();

  const [treeData, setTreeData] = useState<SlyTreeItem[]>([]);
  const [expandedItems, setExpandedItems] = useState<TreeViewItemId[]>([]);
  const [nextId, setNextId] = useState(1);
  const [conflictDialog, setConflictDialog] = useState<ConflictDialogState>({ open: false, parentId: '', parentKey: '', currentValue: null });
  const [importDialog, setImportDialog] = useState<ImportDialogState>({ open: false, fileName: '', jsonData: null, hasExistingData: false, validationError: null });
  const [clearDialog, setClearDialog] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null);
  const [lastMessageCount, setLastMessageCount] = useState(0);

  const nextIdRef = useRef<number>(nextId);
  nextIdRef.current = nextId;

  const { saveSlyDataToCache, loadSlyDataFromCache, clearSlyDataCache } = useSlyDataCache();

  // Initialization with cache per-network
  useEffect(() => {
    if (!isInitialized && targetNetwork) {
      const cached = loadSlyDataFromCache(targetNetwork);
      if (cached && cached.data.length > 0) {
        setTreeData(cached.data);
        setNextId(cached.nextId);
      } else {
        setTreeData([]);
      }
      setIsInitialized(true);
    }
  }, [isInitialized, targetNetwork, loadSlyDataFromCache]);

  // Swap networks -> reload cache
  useEffect(() => {
    if (isInitialized && targetNetwork) {
      const cached = loadSlyDataFromCache(targetNetwork);
      if (cached && cached.data.length > 0) {
        setTreeData(cached.data);
        setNextId(cached.nextId);
      } else {
        setTreeData([]);
      }
    }
  }, [targetNetwork, loadSlyDataFromCache, isInitialized]);

  // Persist cache when data changes
  useEffect(() => {
    if (!isInitialized || !targetNetwork) return;
    if (treeData.length > 0) {
      saveSlyDataToCache(treeData, targetNetwork, nextId);
    } else {
      clearSlyDataCache(targetNetwork);
    }
  }, [treeData, isInitialized, targetNetwork, saveSlyDataToCache, clearSlyDataCache, nextId]);

  const generateId = useCallback(() => {
    const id = `item_${nextIdRef.current}`;
    setNextId((p) => p + 1);
    nextIdRef.current += 1;
    return id;
  }, []);

  const handleAddWithConflictCheck = useCallback((parentId: string) => {
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
      setConflictDialog({ open: true, parentId, parentKey: parentItem.key || '', currentValue: parentItem.value });
    } else {
      handleAddItem(parentId);
    }
  }, [treeData]);

  const handleAddItem = useCallback((parentId?: string) => {
    if (!parentId) {
      const newItem: SlyTreeItem = { id: generateId(), label: 'new_key: "new_value"', key: 'new_key', value: 'new_value', parentId: undefined, isKeyValuePair: true, type: 'string', depth: 0, hasValue: true };
      setTreeData((prev) => [...prev, newItem]);
      return;
    }
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
    const newItem: SlyTreeItem = { id: generateId(), label: 'new_key: "new_value"', key: 'new_key', value: 'new_value', parentId, isKeyValuePair: true, type: 'string', depth: newDepth, hasValue: true };
    setTreeData((prev) => {
      const updateItems = (items: SlyTreeItem[]): SlyTreeItem[] => items.map((item) => {
        if (item.id === parentId) return { ...item, children: [...(item.children || []), newItem], hasValue: false, value: undefined };
        if (item.children) return { ...item, children: updateItems(item.children) };
        return item;
      });
      return updateItems(prev);
    });
    setExpandedItems((prev) => [...prev, parentId]);
  }, [generateId, treeData]);

  const handleConflictConfirm = () => { handleAddItem(conflictDialog.parentId); setConflictDialog({ open: false, parentId: '', parentKey: '', currentValue: null }); };
  const handleConflictCancel = () => { setConflictDialog({ open: false, parentId: '', parentKey: '', currentValue: null }); };

  const handleUpdateKey = useCallback((id: string, newKey: string) => {
    setTreeData((prev) => {
      const updateItem = (items: SlyTreeItem[]): SlyTreeItem[] => items.map((item) => {
        if (item.id === id) {
          return { ...item, key: newKey, label: item.hasValue ? `${newKey}: ${typeof item.value === 'string' ? `"${item.value}"` : String(item.value)}` : newKey };
        }
        if (item.children) return { ...item, children: updateItem(item.children) };
        return item;
      });
      return updateItem(prev);
    });
  }, []);

  const handleUpdateValue = useCallback((id: string, newValue: any) => {
    setTreeData((prev) => {
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
  }, []);

  const handleDeleteItem = useCallback((itemId: string) => {
    setTreeData((prev) => {
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
  }, []);

  const handleLabelChange = useCallback((itemId: TreeViewItemId, newLabel: string) => {
    setTreeData((prev) => {
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
  }, []);

  const handleImportJson = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        let jsonData: any = null; let validationError: string | null = null;
        try { jsonData = JSON.parse(event.target?.result as string); } catch (err: any) { validationError = `Invalid JSON format: ${err?.message || 'Unknown parsing error'}`; }
        if (!validationError && jsonData !== null) validationError = validateJsonForSlyData(jsonData);
        setImportDialog({ open: true, fileName: file.name, jsonData, hasExistingData: treeData.length > 0, validationError });
      };
      reader.readAsText(file);
    };
    input.click();
  }, [treeData.length]);

  const handleImportConfirm = () => {
    if (importDialog.jsonData && !importDialog.validationError) {
      const localRef = { current: nextIdRef.current };
      const newTreeData = jsonToTreeData(importDialog.jsonData, localRef, undefined, 0);
      setTreeData(newTreeData);
      setExpandedItems(newTreeData.map((i) => i.id));
      setNextId(localRef.current);
      setImportDialog({ open: false, fileName: '', jsonData: null, hasExistingData: false, validationError: null });
    }
  };
  const handleImportCancel = () => setImportDialog({ open: false, fileName: '', jsonData: null, hasExistingData: false, validationError: null });

  const handleClearAll = () => setClearDialog(true);
  const handleClearConfirm = () => {
    setTreeData([]); setExpandedItems([]); setNextId(1);
    if (targetNetwork) clearSlyDataCache(targetNetwork); else clearSlyDataCache();
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
    a.href = URL.createObjectURL(blob); a.download = 'slydata_logs.txt'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
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
        const localRef = { current: nextIdRef.current };
        const newTreeData = jsonToTreeData(latestData, localRef, undefined, 0);
        setTreeData(newTreeData);
        const allIds = getAllItemIds(newTreeData);
        setExpandedItems(allIds);
        setNextId(localRef.current);
      }
    } catch (e) { console.error('Failed to fetch latest sly_data:', e); }
  }, [targetNetwork, apiUrl]);

  useEffect(() => {
    const currentMessageCount = slyDataMessages.length;
    if (currentMessageCount > lastMessageCount && currentMessageCount > 1) fetchLatestSlyData();
    setLastMessageCount(currentMessageCount);
  }, [slyDataMessages.length, lastMessageCount, fetchLatestSlyData]);

  const handleExportJson = useCallback(() => {
    const json = treeDataToJson(treeData);
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'slydata.json'; a.click(); URL.revokeObjectURL(url);
  }, [treeData]);

  const handleExpandCollapseAll = useCallback(() => {
    if (expandedItems.length === 0 || expandedItems.length < treeData.length) setExpandedItems(getAllItemIds(treeData));
    else setExpandedItems([]);
  }, [expandedItems.length, treeData]);

  const treeOpsValue = useMemo(() => ({ handleDeleteItem, handleAddItem, handleAddWithConflictCheck, handleUpdateKey, handleUpdateValue, treeData }), [handleDeleteItem, handleAddItem, handleAddWithConflictCheck, handleUpdateKey, handleUpdateValue, treeData]);

  return (
    <Paper elevation={1} sx={{ height: '100%', backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: `1px solid ${theme.palette.divider}` }}>
      <PanelGroup direction="vertical">
        <Panel defaultSize={64} minSize={30}>
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 1.5, borderBottom: `1px solid ${theme.palette.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, backgroundColor: theme.palette.background.paper }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <DataObjectIcon sx={{ color: theme.palette.primary.main, fontSize: '1.25rem' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>SlyData Editor</Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Tooltip title={expandedItems.length === 0 || expandedItems.length < treeData.length ? 'Expand All' : 'Collapse All'}>
                  <IconButton size="small" onClick={handleExpandCollapseAll} disabled={treeData.length === 0} sx={{ color: treeData.length > 0 ? theme.palette.info.main : theme.palette.text.disabled, p: 0.5, '&:hover': treeData.length > 0 ? { backgroundColor: alpha(theme.palette.info.main, 0.1) } : undefined, '&:disabled': { color: theme.palette.text.disabled } }}>
                    {expandedItems.length === 0 || expandedItems.length < treeData.length ? (<ExpandAllIcon fontSize="small" />) : (<CollapseAllIcon fontSize="small" />)}
                  </IconButton>
                </Tooltip>
                <Tooltip title="Import JSON">
                  <IconButton size="small" onClick={handleImportJson} sx={{ color: theme.palette.secondary.main, p: 0.5, '&:hover': { backgroundColor: alpha(theme.palette.secondary.main, 0.1) } }}>
                    <UploadIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Export JSON">
                  <IconButton size="small" onClick={handleExportJson} sx={{ color: theme.palette.warning.main, p: 0.5, '&:hover': { backgroundColor: alpha(theme.palette.warning.main, 0.1) } }}>
                    <DownloadIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Add root item">
                  <IconButton size="small" onClick={() => handleAddItem()} sx={{ color: theme.palette.primary.main, p: 0.5, '&:hover': { backgroundColor: alpha(theme.palette.primary.main, 0.1) } }}>
                    <AddIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Clear all data">
                  <IconButton size="small" onClick={handleClearAll} disabled={treeData.length === 0} sx={{ color: treeData.length > 0 ? theme.palette.error.main : theme.palette.text.disabled, '&:disabled': { color: theme.palette.text.disabled }, '&:hover': treeData.length > 0 ? { backgroundColor: alpha(theme.palette.error.main, 0.1) } : undefined, p: 0.5 }}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
            <Box sx={{ flexGrow: 1, overflow: 'auto', p: 1, backgroundColor: theme.palette.background.paper }}>
              {treeData.length > 0 ? (
                <TreeOperationsContext.Provider value={treeOpsValue}>
                  <RichTreeView
                    items={treeData as any}
                    expandedItems={expandedItems}
                    onExpandedItemsChange={(_, itemIds) => setExpandedItems(itemIds)}
                    onItemLabelChange={handleLabelChange}
                    isItemEditable={(item) => Boolean((item as any)?.isKeyValuePair)}
                    slots={{ item: CustomTreeItem as any }}
                    sx={{ color: theme.palette.text.primary, '& .MuiTreeItem-root': { '& .MuiTreeItem-content': { padding: '4px 0', paddingLeft: '0px !important', color: theme.palette.text.primary, '&:hover': { backgroundColor: theme.custom.slyData.hoverBackground }, '&.Mui-focused': { backgroundColor: alpha(theme.palette.primary.main, 0.1), color: theme.palette.primary.main } }, '& .MuiTreeItem-iconContainer': { marginRight: '4px', minWidth: '24px', '& .MuiSvgIcon-root': { color: theme.palette.text.secondary, fontSize: '1rem' } } } }}
                  />
                </TreeOperationsContext.Provider>
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

      <ConflictDialog state={conflictDialog} onConfirm={handleConflictConfirm} onCancel={handleConflictCancel} />
      <ImportDialog state={importDialog} onConfirm={handleImportConfirm} onCancel={handleImportCancel} currentRootCount={treeData.length} />
      <ClearAllDialog open={clearDialog} onConfirm={handleClearConfirm} onCancel={handleClearCancel} rootCount={treeData.length} />
    </Paper>
  );
};

export default EditorSlyDataPanel;
