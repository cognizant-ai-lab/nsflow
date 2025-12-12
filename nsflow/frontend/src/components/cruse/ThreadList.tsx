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

import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  IconButton,
  Divider,
  Typography,
  CircularProgress,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Chat as ChatIcon,
} from '@mui/icons-material';
import { formatMessageTime } from '../../utils/cruse';
import { AgentSelector, Agent } from './AgentSelector';
import type { CruseThread } from '../../types/cruse';

export interface ThreadListProps {
  /** Array of all threads */
  threads: CruseThread[];
  /** Currently selected thread ID */
  activeThreadId?: string;
  /** Loading state */
  isLoading?: boolean;
  /** Available agents */
  agents?: Agent[];
  /** Selected agent ID */
  selectedAgentId?: string;
  /** Loading state for agents */
  isLoadingAgents?: boolean;
  /** Callback when a thread is selected */
  onThreadSelect: (threadId: string) => void;
  /** Callback when new thread button is clicked */
  onNewThread: () => void;
  /** Callback when delete button is clicked */
  onDeleteThread: (threadId: string) => void;
  /** Callback when agent is changed */
  onAgentChange?: (agentId: string) => void;
}

/**
 * ThreadList Component
 *
 * Displays list of conversation threads in the left sidebar.
 * Features:
 * - Create new thread button
 * - Thread selection
 * - Thread deletion
 * - Active thread highlighting
 * - Relative timestamps
 */
export function ThreadList({
  threads,
  activeThreadId,
  isLoading = false,
  agents = [],
  selectedAgentId = '',
  isLoadingAgents = false,
  onThreadSelect,
  onNewThread,
  onDeleteThread,
  onAgentChange,
}: ThreadListProps) {
  // Filter threads by selected agent
  const agentThreads = selectedAgentId
    ? threads.filter((t) => t.agent_name === selectedAgentId)
    : [];

  // Show "+ New Thread" button only when agent is selected AND there are existing threads
  const showNewThreadButton = selectedAgentId && agentThreads.length > 0;

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
      }}
    >
      {/* Agent Selector at Top */}
      <Box
        sx={{
          p: 2,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        {isLoadingAgents ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <AgentSelector
            agents={agents}
            selectedAgentId={selectedAgentId}
            onAgentChange={onAgentChange || (() => {})}
          />
        )}
      </Box>

      {/* Show "+ New Thread" button only when agent is selected and has threads */}
      {showNewThreadButton && (
        <Box sx={{ px: 1.5, pt: 1.5, pb: 0.5 }}>
          <ListItemButton
            onClick={onNewThread}
            sx={{
              borderRadius: 3,
              border: 1,
              borderColor: 'primary.main',
              py: 0.4,
              px: 1,
              minHeight: 0,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 0.5,
              '&:hover': {
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                '& .MuiSvgIcon-root': {
                  color: 'primary.contrastText',
                },
              },
            }}
          >
            <AddIcon sx={{ fontSize: '1rem' }} color="primary" />
            <Typography
              sx={{
                fontWeight: 600,
                fontSize: '0.85rem',
                color: 'primary.main',
                '.MuiListItemButton-root:hover &': {
                  color: 'inherit',
                },
              }}
            >
              New Thread
            </Typography>
          </ListItemButton>
        </Box>
      )}

      {showNewThreadButton && <Divider sx={{ mt: 0.5 }} />}

      {/* Thread List - Only show for selected agent */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          '&::-webkit-scrollbar': {
            width: 6,
          },
          '&::-webkit-scrollbar-track': {
            bgcolor: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: (theme) => theme.palette.mode === 'dark'
              ? 'rgba(255, 255, 255, 0.1)'
              : 'rgba(0, 0, 0, 0.1)',
            borderRadius: 3,
            transition: 'background-color 0.2s',
            '&:hover': {
              bgcolor: (theme) => theme.palette.mode === 'dark'
                ? 'rgba(255, 255, 255, 0.2)'
                : 'rgba(0, 0, 0, 0.2)',
            },
          },
          '&:hover::-webkit-scrollbar-thumb': {
            bgcolor: (theme) => theme.palette.mode === 'dark'
              ? 'rgba(255, 255, 255, 0.15)'
              : 'rgba(0, 0, 0, 0.15)',
          },
        }}
      >
        {!selectedAgentId ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Select an agent to view threads
            </Typography>
          </Box>
        ) : isLoading ? (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
            }}
          >
            <CircularProgress size={32} />
          </Box>
        ) : agentThreads.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No threads for this agent yet
            </Typography>
          </Box>
        ) : (
          <List sx={{ pt: 1, px: 1.5, pb: 1 }}>
            {agentThreads.map((thread) => {
              const isActive = thread.id === activeThreadId;
              const timeString = formatMessageTime(thread.updated_at);

              return (
                <ListItem
                  key={thread.id}
                  disablePadding
                  secondaryAction={
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteThread(thread.id);
                      }}
                      sx={{
                        opacity: isActive ? 1 : 0,
                        transition: 'opacity 0.2s',
                        '.MuiListItem-root:hover &': {
                          opacity: 1,
                        },
                        mr: 0.5,
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  }
                  sx={{
                    mb: 0.5,
                    borderRadius: 2,
                    overflow: 'hidden',
                    '&:hover': {
                      bgcolor: 'action.hover',
                    },
                  }}
                >
                  <ListItemButton
                    selected={isActive}
                    onClick={() => onThreadSelect(thread.id)}
                    sx={{
                      py: 0.5,
                      px: 1.5,
                      borderRadius: 2,
                      minHeight: 0,
                      ...(isActive && {
                        bgcolor: 'action.selected',
                        '&:hover': {
                          bgcolor: 'action.selected',
                        },
                      }),
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <ChatIcon
                        sx={{ fontSize: '1rem' }}
                        color={isActive ? 'primary' : 'action'}
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={thread.title}
                      secondary={
                        <Typography
                          component="span"
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: '0.65rem' }}
                        >
                          {timeString}
                        </Typography>
                      }
                      slotProps={{
                        primary: {
                          fontWeight: isActive ? 600 : 400,
                          noWrap: true,
                          fontSize: '0.8rem',
                          lineHeight: 1.0,
                        },
                        secondary: {
                          component: 'div',
                          noWrap: true,
                        },
                      }}
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        )}
      </Box>
    </Box>
  );
}
