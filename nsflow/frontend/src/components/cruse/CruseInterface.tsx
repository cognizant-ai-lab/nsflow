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

import { useState, useCallback, useEffect } from 'react';
import { Box, AppBar, Toolbar, Drawer, Typography, IconButton, CircularProgress } from '@mui/material';
import { Menu as MenuIcon } from '@mui/icons-material';
import { ThreadList } from './ThreadList';
import { ChatArea } from './ChatArea';
import { AgentSelector, Agent } from './AgentSelector';
import { useCrusePersistence } from '../../hooks/useCrusePersistence';
import { useCruseTheme } from '../../hooks/useCruseTheme';
import { useCruseWebSocket } from '../../hooks/useCruseWebSocket';
import { generateThreadTitle } from '../../utils/cruse/persistence';
import { useApiPort } from '../../context/ApiPortContext';
import { useChatContext } from '../../context/ChatContext';
import { useNeuroSan } from '../../context/NeuroSanContext';
import type { MessageOrigin } from '../../types/cruse';

const DRAWER_WIDTH = 280;

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
export function CruseInterface() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [sampleQueries, setSampleQueries] = useState<string[]>([]);

  // Context hooks
  const { apiUrl } = useApiPort();
  const { activeNetwork, setActiveNetwork } = useChatContext();
  const { host, port, connectionType, isNsReady } = useNeuroSan();

  // Persistence hook
  const {
    threads,
    currentThread,
    messages,
    isLoadingThreads,
    isLoadingMessages,
    loadThread,
    createNewThread,
    deleteThread,
    addMessageToThread,
  } = useCrusePersistence();

  // Theme hook
  const { theme, isLoadingTheme, refreshTheme } = useCruseTheme(activeNetwork);

  // Callback for handling WebSocket messages (with widget support)
  const handleMessageReceived = useCallback(
    async (threadId: string, sender: 'AI' | 'HUMAN', text: string, origin: MessageOrigin[], widget?: any) => {
      try {
        await addMessageToThread(threadId, {
          sender,
          origin,
          text,
          widget, // Include widget if available
        });
      } catch (err) {
        console.error('[CRUSE] Failed to add message to thread:', err);
      }
    },
    [addMessageToThread]
  );

  // WebSocket hook - connects to main agent and widget agent (with messages context)
  const { sendMessage } = useCruseWebSocket({
    currentThread,
    messages, // Pass messages for widget agent context
    onMessageReceived: handleMessageReceived,
  });
  // TODO: Use isConnecting, isConnected, error for UI feedback

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

        setAgents(agentList);

        // Set first agent as active if no active network
        if (agentList.length > 0 && !activeNetwork) {
          setActiveNetwork(agentList[0].id);
        }
      } catch (err) {
        console.error('[CRUSE] Failed to fetch agents:', err);
        setAgents([]);
      } finally {
        setIsLoadingAgents(false);
      }
    };

    fetchAgents();
  }, [apiUrl, host, port, connectionType, isNsReady, activeNetwork, setActiveNetwork]);

  // Fetch sample queries when activeNetwork changes
  useEffect(() => {
    const fetchSampleQueries = async () => {
      if (!activeNetwork || !apiUrl) {
        setSampleQueries([]);
        return;
      }

      try {
        const response = await fetch(`${apiUrl}/api/v1/connectivity/${activeNetwork}`);
        if (!response.ok) {
          console.log('[CRUSE] Failed to fetch connectivity info:', response.statusText);
          setSampleQueries(['What can you help me with?']);
          return;
        }

        const data = await response.json();
        const queries = data?.metadata?.sample_queries || [];

        // Always append a default query
        const allQueries = [...queries, 'What can you help me with?'];
        setSampleQueries(allQueries);
        console.log('[CRUSE] Sample queries loaded:', allQueries);
      } catch (error) {
        console.log('[CRUSE] Error fetching sample queries:', error);
        setSampleQueries(['What can you help me with?']);
      }
    };

    fetchSampleQueries();
  }, [activeNetwork, apiUrl]);

  // Handle drawer toggle (mobile)
  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  // Handle agent selection - updates activeNetwork in ChatContext
  const handleAgentChange = (agentId: string) => {
    console.log('[CRUSE] Agent changed to:', agentId);
    setActiveNetwork(agentId);
  };

  // Handle thread selection
  const handleThreadSelect = useCallback(
    (threadId: string) => {
      loadThread(threadId);
      if (mobileOpen) {
        setMobileOpen(false);
      }
    },
    [loadThread, mobileOpen]
  );

  // Handle new thread creation
  const handleNewThread = useCallback(async () => {
    try {
      const selectedAgent = agents.find((a) => a.id === activeNetwork);
      const title = `New Chat - ${new Date().toLocaleString()}`;
      const newThread = await createNewThread(title, selectedAgent?.name);

      // Load the newly created thread
      if (newThread) {
        loadThread(newThread.id);
      }
    } catch (err) {
      console.error('[CRUSE] Failed to create new thread:', err);
    }
  }, [createNewThread, loadThread, activeNetwork, agents]);

  // Handle thread deletion
  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      if (window.confirm('Are you sure you want to delete this thread?')) {
        try {
          await deleteThread(threadId);
        } catch (err) {
          console.error('Failed to delete thread:', err);
        }
      }
    },
    [deleteThread]
  );

  // Handle sending a message - uses WebSocket to communicate with main agent
  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!currentThread) {
        console.warn('[CRUSE] No active thread');
        return;
      }

      if (!activeNetwork) {
        console.warn('[CRUSE] No active network selected');
        return;
      }

      try {
        // Create message origin
        const origin: MessageOrigin[] = [
          {
            tool: activeNetwork,
            instantiation_index: 1,
          },
        ];

        // Add user message to thread (optimistic UI update)
        await addMessageToThread(currentThread.id, {
          sender: 'HUMAN',
          origin,
          text,
        });

        // Send to main agent via WebSocket
        const success = sendMessage(text);

        if (!success) {
          console.error('[CRUSE] Failed to send message via WebSocket');
          // TODO: Show error to user
        }

        // Agent response will come via WebSocket onmessage handler
        // Widget generation will happen in useCruseWebSocket
      } catch (err) {
        console.error('[CRUSE] Failed to send message:', err);
      }
    },
    [currentThread, activeNetwork, addMessageToThread, sendMessage]
  );

  // Handle widget submission - sends form data to main agent via WebSocket
  const handleWidgetSubmit = useCallback(
    async (data: Record<string, unknown>) => {
      if (!currentThread) {
        console.warn('[CRUSE] No active thread');
        return;
      }

      if (!activeNetwork) {
        console.warn('[CRUSE] No active network selected');
        return;
      }

      try {
        const origin: MessageOrigin[] = [
          {
            tool: activeNetwork,
            instantiation_index: 1,
          },
        ];

        // Format widget data as message text
        const formattedData = JSON.stringify(data, null, 2);
        const messageText = `Form submitted:\n\`\`\`json\n${formattedData}\n\`\`\``;

        // Add user message to thread (optimistic UI update)
        await addMessageToThread(currentThread.id, {
          sender: 'HUMAN',
          origin,
          text: messageText,
        });

        // Send to main agent via WebSocket
        const success = sendMessage(messageText);

        if (!success) {
          console.error('[CRUSE] Failed to send widget data via WebSocket');
          // TODO: Show error to user
        }
      } catch (err) {
        console.error('[CRUSE] Failed to submit widget:', err);
      }
    },
    [currentThread, activeNetwork, addMessageToThread, sendMessage]
  );

  // Auto-generate thread title from first message
  useEffect(() => {
    if (currentThread && messages.length === 1 && currentThread.title.startsWith('New Chat')) {
      const firstMessage = messages[0];
      if (firstMessage.sender === 'HUMAN') {
        const newTitle = generateThreadTitle(firstMessage.text);
        // TODO: Update thread title via API
        console.log('Generated title:', newTitle);
      }
    }
  }, [currentThread, messages]);

  // Drawer content
  const drawer = (
    <ThreadList
      threads={threads}
      activeThreadId={currentThread?.id}
      isLoading={isLoadingThreads}
      onThreadSelect={handleThreadSelect}
      onNewThread={handleNewThread}
      onDeleteThread={handleDeleteThread}
    />
  );

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      {/* AppBar */}
      <AppBar
        position="fixed"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>

          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            CRUSE - Chat Runtime UI Schema Engine
          </Typography>

          {isLoadingAgents ? (
            <CircularProgress size={24} color="inherit" />
          ) : (
            <AgentSelector
              agents={agents}
              selectedAgentId={activeNetwork || ''}
              onAgentChange={handleAgentChange}
            />
          )}
        </Toolbar>
      </AppBar>

      {/* Drawer - Desktop */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', sm: 'block' },
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            mt: 8, // AppBar height
          },
        }}
      >
        {drawer}
      </Drawer>

      {/* Drawer - Mobile */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{
          keepMounted: true, // Better mobile performance
        }}
        sx={{
          display: { xs: 'block', sm: 'none' },
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            mt: 8,
          },
        }}
      >
        {drawer}
      </Drawer>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          height: '100vh',
          overflow: 'hidden',
          mt: 8, // AppBar height
        }}
      >
        {currentThread ? (
          <ChatArea
            messages={messages}
            threadTitle={currentThread.title}
            isLoading={isLoadingMessages}
            theme={theme}
            isLoadingTheme={isLoadingTheme}
            sampleQueries={sampleQueries}
            onSendMessage={handleSendMessage}
            onWidgetSubmit={handleWidgetSubmit}
            onThemeRefresh={refreshTheme}
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
              Select a thread or create a new one to get started
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
