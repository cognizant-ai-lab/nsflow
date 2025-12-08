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
import { Box, AppBar, Toolbar, Drawer, Typography, IconButton } from '@mui/material';
import { Menu as MenuIcon } from '@mui/icons-material';
import { ThreadList } from './ThreadList';
import { ChatArea } from './ChatArea';
import { AgentSelector, Agent } from './AgentSelector';
import { useCrusePersistence } from '../../hooks/useCrusePersistence';
import { useCruseTheme } from '../../hooks/useCruseTheme';
import { generateThreadTitle } from '../../utils/cruse/persistence';
import type { MessageOrigin } from '../../types/cruse';

const DRAWER_WIDTH = 280;

// Example agents - replace with actual agent data from your system
const EXAMPLE_AGENTS: Agent[] = [
  {
    id: 'sentiment_agent',
    name: 'Sentiment Analyzer',
    description: 'Analyzes sentiment in text and data',
    status: 'online',
  },
  {
    id: 'data_agent',
    name: 'Data Processor',
    description: 'Processes and transforms data',
    status: 'online',
  },
  {
    id: 'generic_agent',
    name: 'Generic Assistant',
    description: 'General purpose AI assistant',
    status: 'online',
  },
];

/**
 * CruseInterface Component
 *
 * Main container for the CRUSE chat interface.
 * Integrates all components:
 * - AppBar with AgentSelector
 * - Left drawer with ThreadList
 * - Central ChatArea with dynamic theme
 * - Thread and message persistence
 * - Theme agent integration
 *
 * This is the top-level component for the CRUSE system.
 */
export function CruseInterface() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(EXAMPLE_AGENTS[0].id);

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
  const { theme, isLoadingTheme, refreshTheme } = useCruseTheme(selectedAgentId);

  // Handle drawer toggle (mobile)
  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  // Handle agent selection
  const handleAgentChange = (agentId: string) => {
    setSelectedAgentId(agentId);
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
      const selectedAgent = EXAMPLE_AGENTS.find((a) => a.id === selectedAgentId);
      const title = `New Chat - ${new Date().toLocaleString()}`;
      const newThread = await createNewThread(title, selectedAgent?.name);

      // Load the newly created thread
      if (newThread) {
        loadThread(newThread.id);
      }
    } catch (err) {
      console.error('Failed to create new thread:', err);
    }
  }, [createNewThread, loadThread, selectedAgentId]);

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

  // Handle sending a message
  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!currentThread) {
        console.warn('No active thread');
        return;
      }

      try {
        // Create message origin
        const origin: MessageOrigin[] = [
          {
            tool: selectedAgentId,
            instantiation_index: 1,
          },
        ];

        // Add message to thread
        await addMessageToThread(currentThread.id, {
          sender: 'HUMAN',
          origin,
          text,
        });

        // TODO: In Phase 4, send to activeNetwork via WebSocket
        // TODO: In Phase 5, call cruse_widget_agent if needed
        // For now, just add the user message to the UI

        // Placeholder: Simulate agent response (remove in Phase 4)
        setTimeout(async () => {
          await addMessageToThread(currentThread.id, {
            sender: 'AI',
            origin,
            text: `I received your message: "${text}". (Agent integration coming in Phase 4)`,
          });
        }, 1000);
      } catch (err) {
        console.error('Failed to send message:', err);
      }
    },
    [currentThread, selectedAgentId, addMessageToThread]
  );

  // Handle widget submission
  const handleWidgetSubmit = useCallback(
    async (data: Record<string, unknown>) => {
      if (!currentThread) return;

      try {
        const origin: MessageOrigin[] = [
          {
            tool: selectedAgentId,
            instantiation_index: 1,
          },
        ];

        // Format widget data as message text
        const formattedData = JSON.stringify(data, null, 2);

        await addMessageToThread(currentThread.id, {
          sender: 'HUMAN',
          origin,
          text: `Form submitted:\n\`\`\`json\n${formattedData}\n\`\`\``,
        });

        // TODO: In Phase 4, send to activeNetwork via WebSocket
      } catch (err) {
        console.error('Failed to submit widget:', err);
      }
    },
    [currentThread, selectedAgentId, addMessageToThread]
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

          <AgentSelector
            agents={EXAMPLE_AGENTS}
            selectedAgentId={selectedAgentId}
            onAgentChange={handleAgentChange}
          />
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
