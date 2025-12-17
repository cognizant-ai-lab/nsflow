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

import { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Typography, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button } from '@mui/material';
import { ThreadList } from './ThreadList';
import CruseTabbedChatPanel from './CruseTabbedChatPanel';
import { Agent } from './AgentSelector';
import { useCrusePersistence } from '../../hooks/useCrusePersistence';
import { generateThreadTitle, deleteAllThreadsForAgent, listThreads } from '../../utils/cruse/persistence';
import { useApiPort } from '../../context/ApiPortContext';
import { useChatContext } from '../../context/ChatContext';
import { useNeuroSan } from '../../context/NeuroSanContext';
import { useSnackbar } from '../../context/SnackbarContext';
import { SNACKBAR_DURATION, NOTIFICATION_TEXT_TRUNCATE_LENGTH } from '../../constants/notifications';
import type { MessageOrigin } from '../../types/cruse';

export interface CruseInterfaceProps {
  showLogs?: boolean;
  onToggleLogs?: () => void;
  cruseThemeEnabled?: boolean;
  onCruseThemeToggle?: (enabled: boolean) => void;
  backgroundType?: 'static' | 'dynamic';
  onBackgroundTypeChange?: (type: 'static' | 'dynamic') => void;
  onRefreshTheme?: (userPrompt?: string) => void;
  isRefreshingTheme?: boolean;
}

/**
 * CruseInterface Component
 *
 * Main container for the CRUSE chat interface.
 * Integrates all components:
 * - AppBar with AgentSelector
 * - Left drawer with ThreadList
 * - Central ChatArea with dynamic theme
 * - Thread and message persistence
 * - WebSocket integration with main agent and widget agent
 *
 * This is the top-level component for the CRUSE system.
 */
export function CruseInterface({
  showLogs = true,
  onToggleLogs,
  cruseThemeEnabled = false,
  onCruseThemeToggle,
  backgroundType = 'dynamic',
  onBackgroundTypeChange,
  onRefreshTheme,
  isRefreshingTheme = false,
}: CruseInterfaceProps = {}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [rootToolName, setRootToolName] = useState<string>(''); // Root agent name for origin
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Context hooks
  const { apiUrl } = useApiPort();
  const { activeNetwork, setActiveNetwork, chatMessages, setChatMessages, regenerateSessionId } = useChatContext();
  const { host, port, connectionType, isNsReady } = useNeuroSan();
  const { showSnackbar } = useSnackbar();

  // Track which message IDs have been persisted to avoid infinite loop
  // Using a Set of message IDs instead of content-based keys to allow duplicate content
  const persistedMessageIds = useRef<Set<string>>(new Set());

  // Persistence hook
  const {
    threads,
    currentThread,
    messages,
    isLoadingThreads,
    loadThread,
    createNewThread,
    updateThreadTitle,
    deleteThread,
    addMessageToThread,
    fetchThreads,
    clearCurrentThread,
  } = useCrusePersistence();

  // Track if URL parameter has been processed
  const urlParamProcessed = useRef(false);

  // Fetch agents from backend (similar to Sidebar.tsx pattern)
  useEffect(() => {
    const fetchAgents = async () => {
      if (!apiUrl || !host || !port || !isNsReady) {
        console.log('[CRUSE] Skipping agent fetch: missing requirements', {
          apiUrl: !!apiUrl,
          host: !!host,
          port: !!port,
          isNsReady,
        });
        return;
      }

      setIsLoadingAgents(true);
      try {
        const connectionToUse = connectionType || 'direct';
        const response = await fetch(
          `${apiUrl}/api/v1/list?connection_type=${connectionToUse}&host=${encodeURIComponent(
            host
          )}&port=${port}`
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch agents: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('[CRUSE] Fetched agents:', data);

        // Map backend agents to Agent type
        const agentList: Agent[] = (data.agents || []).map((a: any) => ({
          id: a.agent_name,
          name: a.agent_name,
          description: a.tags?.join(', ') || 'No description',
          status: 'online' as const,
        }));

        // Sort agents alphabetically by name
        const sortedAgents = agentList.sort((a, b) => a.name.localeCompare(b.name));
        setAgents(sortedAgents);

        // DO NOT set agent by default - let user select or use URL parameter
      } catch (err) {
        console.error('[CRUSE] Failed to fetch agents:', err);
        setAgents([]);
      } finally {
        setIsLoadingAgents(false);
      }
    };

    fetchAgents();
  }, [apiUrl, host, port, connectionType, isNsReady]);

  // Fetch root tool name from connectivity when activeNetwork changes
  useEffect(() => {
    const fetchRootToolName = async () => {
      if (!activeNetwork || !apiUrl) {
        setRootToolName('');
        return;
      }

      try {
        const response = await fetch(`${apiUrl}/api/v1/connectivity/${activeNetwork}`);
        if (!response.ok) {
          console.log('[CRUSE] Failed to fetch connectivity info for root tool name');
          setRootToolName(activeNetwork); // Fallback to activeNetwork
          return;
        }

        const data = await response.json();

        // Extract root tool name (node with parent === null)
        const rootNode = data?.nodes?.find((node: any) => node.data?.parent === null);
        const toolName = rootNode?.id || rootNode?.data?.label || activeNetwork;
        setRootToolName(toolName);
        console.log('[CRUSE] Root tool name for origin:', toolName);
      } catch (error) {
        console.log('[CRUSE] Error fetching connectivity for root tool name:', error);
        setRootToolName(activeNetwork); // Fallback to activeNetwork
      }
    };

    fetchRootToolName();
  }, [activeNetwork, apiUrl]);

  // Sync DB messages to ChatContext when thread is loaded
  useEffect(() => {
    if (!currentThread) {
      // Clear chat when no thread is selected
      setChatMessages([]);
      persistedMessageIds.current.clear();
      return;
    }

    // Convert DB messages to ChatContext message format (including widgets!)
    const chatContextMessages = messages.map((msg) => ({
      id: msg.id, // Include ID for tracking
      sender: msg.sender === 'HUMAN' ? 'user' as const : msg.sender === 'AI' ? 'agent' as const : 'system' as const,
      text: msg.text,
      network: msg.origin[0]?.tool || activeNetwork || 'unknown',
      origin: msg.origin, // Preserve origin from DB
      widget: msg.widget, // Include widget for display
    }));

    // Update ChatContext with DB messages
    setChatMessages(chatContextMessages);

    // Mark all loaded messages as persisted by their IDs
    persistedMessageIds.current.clear();
    messages.forEach((msg) => {
      persistedMessageIds.current.add(msg.id);
    });

    console.log('[CRUSE] Synced', messages.length, 'messages from DB to ChatContext');
  }, [currentThread?.id, messages.length]); // Only trigger when thread changes or message count changes

  // Intercept new chat messages from ChatContext and save to DB
  // Only save USER messages immediately; AI messages will be saved by CruseChatPanel after widget processing
  // SYSTEM messages (like "Connected to Agent") are NOT persisted to DB
  useEffect(() => {
    if (!currentThread || chatMessages.length === 0) return;

    // Get the last message
    const lastMessage = chatMessages[chatMessages.length - 1];

    // Skip AI messages - they will be saved by CruseChatPanel with widget data
    if (lastMessage.sender === 'agent') {
      return;
    }

    // Skip SYSTEM messages - they are transient UI messages, not conversation history
    if (lastMessage.sender === 'system') {
      return;
    }

    // Only save USER messages at this point
    if (lastMessage.sender !== 'user') {
      return;
    }

    // Check if message has an ID (from DB) - if so, it's already persisted
    if (lastMessage.id && persistedMessageIds.current.has(lastMessage.id)) {
      return;
    }

    // For new messages without IDs, create a temporary unique key with timestamp
    // This allows duplicate content but prevents double-saves in the same render cycle
    const textPreview = typeof lastMessage.text === 'string'
      ? lastMessage.text.substring(0, 50)
      : JSON.stringify(lastMessage.text).substring(0, 50);
    const messageId = lastMessage.id || `temp-${Date.now()}-${textPreview}`;

    // Skip if we've already started persisting this message
    if (persistedMessageIds.current.has(messageId)) {
      return;
    }

    // Mark as persisting
    persistedMessageIds.current.add(messageId);

    // Save USER message to DB
    // Construct origin using root tool name from connectivity response
    const origin: MessageOrigin[] = [
      {
        tool: rootToolName || activeNetwork || 'unknown',
        instantiation_index: 1,
      },
    ];

    addMessageToThread(currentThread.id, {
      sender: 'HUMAN',
      origin,
      text: typeof lastMessage.text === 'string' ? lastMessage.text : JSON.stringify(lastMessage.text),
    }).then((savedMessage) => {
      // Once saved, replace temp ID with real ID
      if (savedMessage?.id) {
        persistedMessageIds.current.delete(messageId);
        persistedMessageIds.current.add(savedMessage.id);
      }
    }).catch((error) => {
      console.error('[CRUSE] Failed to save message:', error);
      // Remove temp ID on failure so it can be retried
      persistedMessageIds.current.delete(messageId);
    });
  }, [chatMessages.length]); // Only trigger when message count changes

  // Handle new thread creation
  const handleNewThread = useCallback(async (agentId?: string) => {
    try {
      // Generate a new session_id for the new thread to prevent message mix-up
      regenerateSessionId();

      // Use provided agentId or fall back to activeNetwork
      const agentIdToUse = agentId || activeNetwork;
      const selectedAgent = agents.find((a) => a.id === agentIdToUse);

      if (!selectedAgent) {
        console.error('[CRUSE] Agent not found:', agentIdToUse, 'Available agents:', agents.map(a => a.id));
        return;
      }

      const title = `New Chat - ${new Date().toLocaleString()}`;
      const newThread = await createNewThread(title, selectedAgent.name);

      console.log('[CRUSE] Created thread with agent_name:', selectedAgent.name);

      // Load the newly created thread
      if (newThread) {
        loadThread(newThread.id);
      }
    } catch (err) {
      console.error('[CRUSE] Failed to create new thread:', err);
    }
  }, [createNewThread, loadThread, activeNetwork, agents, regenerateSessionId]);

  // Handle agent selection - updates activeNetwork in ChatContext
  const handleAgentChange = useCallback(
    async (agentId: string) => {
      console.log('[CRUSE] Agent changed to:', agentId);

      // Clear messages immediately to prevent cross-agent message visibility
      setChatMessages([]);
      persistedMessageIds.current.clear();

      // Update active network
      setActiveNetwork(agentId);

      // Check if agent has any threads
      const agentThreads = threads.filter((t) => t.agent_name === agentId);

      if (agentThreads.length === 0) {
        // Auto-create first thread for this agent
        console.log('[CRUSE] No threads for agent, creating new thread');
        await handleNewThread(agentId); // Pass agentId directly since state hasn't updated yet (regenerates sessionId)
      } else {
        // Generate new session_id when loading existing thread for different agent
        regenerateSessionId();
        // Load the most recent thread
        await loadThread(agentThreads[0].id);
      }
    },
    [setActiveNetwork, threads, loadThread, handleNewThread, setChatMessages, regenerateSessionId]
  );

  // Handle URL parameters to set the active network on page load
  useEffect(() => {
    if (urlParamProcessed.current || agents.length === 0 || isLoadingAgents) {
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const networkParam = urlParams.get('network');

    if (networkParam) {
      // Check if the agent from URL exists in the available agents
      const agentExists = agents.some((a) => a.id === networkParam);
      if (agentExists && networkParam !== activeNetwork) {
        console.log('[CRUSE] Setting agent from URL parameter:', networkParam);
        urlParamProcessed.current = true;
        handleAgentChange(networkParam);
      } else if (!agentExists) {
        console.warn('[CRUSE] Agent from URL parameter not found:', networkParam);
      }
    }
  }, [agents, isLoadingAgents, activeNetwork, handleAgentChange]); // Run when agents are loaded

  // Update URL when activeNetwork changes (user selects agent from dropdown)
  useEffect(() => {
    if (activeNetwork) {
      const currentUrl = new URL(window.location.href);
      const currentNetworkParam = currentUrl.searchParams.get('network');

      // Only update URL if the network parameter is different
      if (currentNetworkParam !== activeNetwork) {
        currentUrl.searchParams.set('network', activeNetwork);
        window.history.replaceState({}, '', currentUrl.toString());
        console.log('[CRUSE] Updated URL with network parameter:', activeNetwork);
      }
    }
  }, [activeNetwork]);

  // Handle thread selection
  const handleThreadSelect = useCallback(
    (threadId: string) => {
      // If clicking the same thread that's already active, do nothing
      if (currentThread?.id === threadId) {
        console.log('[CRUSE] Thread already active, skipping reload');
        if (mobileOpen) {
          setMobileOpen(false);
        }
        return;
      }

      // Generate a new session_id when switching threads to prevent message mix-up
      regenerateSessionId();

      // Clear messages before loading new thread for clean transition
      setChatMessages([]);
      persistedMessageIds.current.clear();

      loadThread(threadId);
      if (mobileOpen) {
        setMobileOpen(false);
      }
    },
    [loadThread, mobileOpen, setChatMessages, currentThread, regenerateSessionId]
  );

  // Handle thread deletion
  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      try {
        // Find the thread to get its details for the notification
        const thread = threads.find((t) => t.id === threadId);
        const threadTitle = thread?.title || 'Unknown';
        const agentName = thread?.agent_name || 'Unknown';

        // Delete the thread
        await deleteThread(threadId);

        // Truncate strings using constant
        const truncatedTitle =
          threadTitle.length > NOTIFICATION_TEXT_TRUNCATE_LENGTH
            ? threadTitle.slice(0, NOTIFICATION_TEXT_TRUNCATE_LENGTH) + '...'
            : threadTitle;
        const truncatedAgent =
          agentName.length > NOTIFICATION_TEXT_TRUNCATE_LENGTH
            ? agentName.slice(0, NOTIFICATION_TEXT_TRUNCATE_LENGTH) + '...'
            : agentName;

        // Show success notification
        showSnackbar({
          message: `Thread: ${truncatedTitle} deleted for agent: ${truncatedAgent}`,
          severity: 'success',
          duration: SNACKBAR_DURATION,
        });
      } catch (err) {
        console.error('Failed to delete thread:', err);

        // Show error notification
        showSnackbar({
          message: 'Failed to delete thread',
          severity: 'error',
          duration: SNACKBAR_DURATION,
        });
      }
    },
    [deleteThread, threads, showSnackbar]
  );

  // Handle delete all threads for agent
  const handleDeleteAllThreads = useCallback(() => {
    setDeleteConfirmOpen(true);
  }, []);

  const handleConfirmDeleteAll = useCallback(async () => {
    setDeleteConfirmOpen(false);

    if (!activeNetwork) {
      showSnackbar({
        message: 'No agent selected',
        severity: 'error',
        duration: SNACKBAR_DURATION,
      });
      return;
    }

    try {
      const agentThreads = threads.filter((t) => t.agent_name === activeNetwork);
      const threadCount = agentThreads.length;

      if (threadCount === 0) {
        showSnackbar({
          message: 'No threads to delete',
          severity: 'info',
          duration: SNACKBAR_DURATION,
        });
        return;
      }

      // Call backend API to delete all threads for this agent
      const data = await deleteAllThreadsForAgent(activeNetwork);
      console.log('[CRUSE] Deleted all threads:', data);

      // Clear current thread state if it belonged to this agent
      if (currentThread && currentThread.agent_name === activeNetwork) {
        // Clear messages in ChatContext
        setChatMessages([]);
        persistedMessageIds.current.clear();
      }

      // Refresh thread list from database
      await fetchThreads();

      // Re-fetch the updated threads list to check if any threads remain for this agent
      const updatedThreads = await listThreads();
      const remainingAgentThreads = updatedThreads.filter((t) => t.agent_name === activeNetwork);

      if (remainingAgentThreads.length > 0) {
        // Load the first remaining thread for this agent
        await loadThread(remainingAgentThreads[0].id);
      } else {
        // No remaining threads - clear current thread to show "Continue from a thread or create a new thread..."
        clearCurrentThread();
      }

      // Show success notification
      showSnackbar({
        message: `Deleted ${data.deleted_count} thread${data.deleted_count > 1 ? 's' : ''} for ${activeNetwork}`,
        severity: 'success',
        duration: SNACKBAR_DURATION,
      });
    } catch (err) {
      console.error('[CRUSE] Failed to delete all threads:', err);
      showSnackbar({
        message: 'Failed to delete threads',
        severity: 'error',
        duration: SNACKBAR_DURATION,
      });
    }
  }, [activeNetwork, threads, currentThread, setChatMessages, showSnackbar, fetchThreads, loadThread, clearCurrentThread]);

  const handleCancelDeleteAll = useCallback(() => {
    setDeleteConfirmOpen(false);
  }, []);

  // Auto-generate thread title from first message
  useEffect(() => {
    if (currentThread && messages.length === 1 && currentThread.title.startsWith('New Chat')) {
      const firstMessage = messages[0];
      if (firstMessage.sender === 'HUMAN') {
        const newTitle = generateThreadTitle(firstMessage.text);
        console.log('[CRUSE] Auto-updating thread title to:', newTitle);

        // Update thread title via API
        updateThreadTitle(currentThread.id, newTitle).catch((err) => {
          console.error('[CRUSE] Failed to update thread title:', err);
        });
      }
    }
  }, [currentThread, messages, updateThreadTitle]);

  return (
    <>
      <Box
        sx={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
          position: 'relative',
          zIndex: 0,
        }}
      >
        {/* Thread List - Floating Panel */}
          <ThreadList
            threads={threads}
            activeThreadId={currentThread?.id}
            isLoading={isLoadingThreads}
            agents={agents}
            selectedAgentId={activeNetwork || ''}
            isLoadingAgents={isLoadingAgents}
            onThreadSelect={handleThreadSelect}
            onNewThread={() => handleNewThread(activeNetwork || undefined)}
            onDeleteThread={handleDeleteThread}
            onAgentChange={handleAgentChange}
            onDeleteAllThreads={handleDeleteAllThreads}
            showLogs={showLogs}
            onToggleLogs={onToggleLogs}
            cruseThemeEnabled={cruseThemeEnabled}
            onCruseThemeToggle={onCruseThemeToggle}
            backgroundType={backgroundType}
            onBackgroundTypeChange={onBackgroundTypeChange}
            onRefreshTheme={onRefreshTheme}
            isRefreshingTheme={isRefreshingTheme}
          />

      {/* Chat Panel - Floating Panel */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {!activeNetwork ? (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
            }}
          >
            <Typography variant="h6" color="text.secondary">
              Select an agent to get started
            </Typography>
          </Box>
        ) : currentThread ? (
          <CruseTabbedChatPanel
            currentThread={currentThread}
            cruseThemeEnabled={cruseThemeEnabled}
            onSaveMessage={async (messageRequest) => {
              if (currentThread) {
                await addMessageToThread(currentThread.id, messageRequest);
              }
            }}
          />
        ) : (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
            }}
          >
            <Typography variant="h6" color="text.secondary">
              Continue from a thread or create a new thread...
            </Typography>
          </Box>
        )}
      </Box>
    </Box>

      {/* Confirmation Dialog for Delete All Threads */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={handleCancelDeleteAll}
        slotProps={{
          paper: {
            sx: {
              borderRadius: 3,
              minWidth: 400,
            },
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 600}}>
          Delete All Threads?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete all threads for <strong>{activeNetwork}</strong>?
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={handleCancelDeleteAll}
            variant="outlined"
            sx={{ borderRadius: 2 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDeleteAll}
            variant="contained"
            color="error"
            sx={{ borderRadius: 2 }}
          >
            Delete All
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
