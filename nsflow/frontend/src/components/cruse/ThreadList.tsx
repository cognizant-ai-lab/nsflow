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

import { useState, useEffect } from 'react';
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
  Menu,
  MenuItem,
  Switch,
  Tooltip,
  Slider,
  TextField,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Chat as ChatIcon,
  SettingsTwoTone as SettingsIcon,
  DeleteSweep as DeleteSweepIcon,
  Visibility as VisibilityIcon,
  Refresh as RefreshIcon,
  ChevronLeft as CollapseIcon,
  ChevronRight as ExpandIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { formatMessageTime } from '../../utils/cruse';
import { AgentSelector, Agent } from './AgentSelector';
import type { CruseThread } from '../../types/cruse';
import { useGlassEffect } from '../../context/GlassEffectContext';
import { useChatContext } from '../../context/ChatContext';

const THREAD_LIST_COLLAPSED_KEY = 'cruse_thread_list_collapsed';

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
  /** Callback when delete all threads is clicked */
  onDeleteAllThreads?: () => void;
  /** Show logs state */
  showLogs?: boolean;
  /** Callback when toggle logs is clicked */
  onToggleLogs?: () => void;
  /** Cruse Theme enabled state */
  cruseThemeEnabled?: boolean;
  /** Callback when Cruse Theme is toggled */
  onCruseThemeToggle?: (enabled: boolean) => void;
  /** Background type (static or dynamic) */
  backgroundType?: 'static' | 'dynamic';
  /** Callback when background type is changed */
  onBackgroundTypeChange?: (type: 'static' | 'dynamic') => void;
  /** Callback when refresh theme button is clicked */
  onRefreshTheme?: (userPrompt?: string) => void;
  /** Is theme refreshing */
  isRefreshingTheme?: boolean;
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
  onDeleteAllThreads,
  showLogs = true,
  onToggleLogs,
  cruseThemeEnabled = false,
  onCruseThemeToggle,
  backgroundType = 'dynamic',
  onBackgroundTypeChange,
  onRefreshTheme,
  isRefreshingTheme = false,
}: ThreadListProps) {
  // Collapsed state from localStorage
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const stored = localStorage.getItem(THREAD_LIST_COLLAPSED_KEY);
    return stored === 'true';
  });

  // Glass effect from context
  const { opacity: glassOpacity, blur: glassBlur, setOpacity: setGlassOpacity, setBlur: setGlassBlur } = useGlassEffect();

  // Get targetNetwork from ChatContext (the active network being chatted with)
  const { targetNetwork } = useChatContext();

  const [settingsAnchorEl, setSettingsAnchorEl] = useState<null | HTMLElement>(null);
  const settingsOpen = Boolean(settingsAnchorEl);

  const [agentSelectorOpen, setAgentSelectorOpen] = useState(false);

  // Theme refresh prompt state - stored per targetNetwork (not selectedAgentId)
  const [themePrompt, setThemePrompt] = useState(() => {
    if (!targetNetwork) return '';
    const stored = localStorage.getItem(`cruse_theme_prompt_${targetNetwork}`);
    return stored || '';
  });

  // Filter threads by selected agent
  const agentThreads = selectedAgentId
    ? threads.filter((t) => t.agent_name === selectedAgentId)
    : [];

  // Show "+ New Thread" button when agent is selected
  const showNewThreadButton = !!selectedAgentId;

  // Persist collapsed state to localStorage
  useEffect(() => {
    localStorage.setItem(THREAD_LIST_COLLAPSED_KEY, String(isCollapsed));
  }, [isCollapsed]);

  // Persist theme prompt to localStorage (per targetNetwork)
  useEffect(() => {
    if (targetNetwork) {
      localStorage.setItem(`cruse_theme_prompt_${targetNetwork}`, themePrompt);
    }
  }, [themePrompt, targetNetwork]);

  // Load theme prompt when targetNetwork changes
  useEffect(() => {
    if (targetNetwork) {
      const stored = localStorage.getItem(`cruse_theme_prompt_${targetNetwork}`);
      setThemePrompt(stored || '');
    } else {
      setThemePrompt('');
    }
  }, [targetNetwork]);

  const handleToggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handleSettingsClick = (event: React.MouseEvent<HTMLElement>) => {
    setSettingsAnchorEl(event.currentTarget);
  };

  const handleSettingsClose = () => {
    setSettingsAnchorEl(null);
  };

  const handleDeleteAllThreads = () => {
    handleSettingsClose();
    // Small delay to allow menu to close and focus to be removed before opening dialog
    setTimeout(() => {
      if (onDeleteAllThreads) {
        onDeleteAllThreads();
      }
    }, 150);
  };

  const handleToggleLogs = () => {
    if (onToggleLogs) {
      onToggleLogs();
    }
  };

  // Reusable settings menu content
  const renderSettingsContent = () => (
    <>
      <MenuItem
        onClick={handleDeleteAllThreads}
        disabled={!selectedAgentId || agentThreads.length === 0}
        sx={{
          py: 1.5,
          px: 2,
          gap: 1.5,
          '&:hover': {
            bgcolor: 'error.main',
            color: 'error.contrastText',
            '& .MuiSvgIcon-root': {
              color: 'error.contrastText',
            },
          },
        }}
      >
        <DeleteSweepIcon fontSize="small" sx={{ color: 'error.main' }} />
        <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
          Delete All Threads
        </Typography>
      </MenuItem>

      <Divider sx={{ my: 0.5 }} />

      {/* Cruse Theme Settings - 3 Row Design */}
      <MenuItem
        sx={{
          py: 1,
          px: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 1,
          '&:hover': {
            bgcolor: 'action.hover',
          },
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Row 1: Cruse/MUI Toggle, Static/Dynamic Toggle, Refresh Button */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* Cruse/MUI Toggle */}
          <Box
            onClick={(e) => {
              e.stopPropagation();
              onCruseThemeToggle?.(!cruseThemeEnabled);
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              width: 80,
              height: 24,
              borderRadius: 16,
              bgcolor: cruseThemeEnabled ? 'success.main' : 'action.disabled',
              cursor: 'pointer',
              position: 'relative',
              transition: 'all 0.3s',
              '&:hover': {
                opacity: 0.9,
              },
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                left: cruseThemeEnabled ? 2 : 42,
                width: 36,
                height: 20,
                borderRadius: 14,
                bgcolor: 'background.paper',
                transition: 'left 0.3s',
              }}
            />
            <Typography
              variant="caption"
              sx={{
                position: 'absolute',
                left: cruseThemeEnabled ? 10 : 50,
                fontSize: '0.4rem',
                fontWeight: 600,
                color: 'text.primary',
                transition: 'all 0.3s',
              }}
            >
              {cruseThemeEnabled ? 'Cruse' : 'MUI'}
            </Typography>
          </Box>

          {/* Static/Dynamic Toggle */}
          <Box
            onClick={(e) => {
              e.stopPropagation();
              if (cruseThemeEnabled) {
                onBackgroundTypeChange?.(backgroundType === 'static' ? 'dynamic' : 'static');
              }
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              width: 80,
              height: 24,
              borderRadius: 16,
              bgcolor: cruseThemeEnabled && backgroundType === 'dynamic' ? 'primary.main' : 'action.disabled',
              cursor: cruseThemeEnabled ? 'pointer' : 'not-allowed',
              position: 'relative',
              transition: 'all 0.3s',
              opacity: cruseThemeEnabled ? 1 : 0.4,
              '&:hover': cruseThemeEnabled ? {
                opacity: 0.9,
              } : {},
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                left: backgroundType === 'static' ? 2 : 42,
                width: 36,
                height: 20,
                borderRadius: 14,
                bgcolor: 'background.paper',
                transition: 'left 0.3s',
              }}
            />
            <Typography
              variant="caption"
              sx={{
                position: 'absolute',
                left: backgroundType === 'static' ? 8 : 48,
                fontSize: '0.4rem',
                fontWeight: 600,
                color: 'text.primary',
                transition: 'all 0.3s',
              }}
            >
              {backgroundType === 'static' ? 'Static' : 'Dynamic'}
            </Typography>
          </Box>

          {/* Refresh Button */}
          <IconButton
            size="small"
            disabled={!cruseThemeEnabled || isRefreshingTheme}
            onClick={(e) => {
              e.stopPropagation();
              if (cruseThemeEnabled && !isRefreshingTheme) {
                onRefreshTheme?.(themePrompt);
              }
            }}
            sx={{
              width: 24,
              height: 24,
              border: 1,
              borderColor: 'divider',
              borderRadius: '50%',
              opacity: cruseThemeEnabled ? 1 : 0.4,
              '&:hover': {
                bgcolor: 'action.hover',
              },
              '&.Mui-disabled': {
                opacity: 0.4,
              },
            }}
          >
            {isRefreshingTheme ? (
              <CircularProgress size={16} />
            ) : (
              <RefreshIcon sx={{ fontSize: '1.1rem' }} />
            )}
          </IconButton>
        </Box>

        {/* Row 1.5: User Prompt for Theme Refresh */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0.5,
            opacity: cruseThemeEnabled ? 1 : 0.4,
            pointerEvents: cruseThemeEnabled ? 'auto' : 'none',
          }}
        >
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
            User Prompt
          </Typography>
          <TextField
            value={themePrompt}
            onChange={(e) => setThemePrompt(e.target.value)}
            placeholder="Optional: Customize theme generation..."
            disabled={!cruseThemeEnabled}
            multiline
            maxRows={1}
            minRows={1}
            size="small"
            fullWidth
            sx={{
              '& .MuiOutlinedInput-root': {
                fontSize: '0.75rem',
                '& fieldset': {
                  borderColor: 'divider',
                },
                '&:hover fieldset': {
                  borderColor: 'primary.main',
                },
                '&.Mui-focused fieldset': {
                  borderColor: 'primary.main',
                },
              },
              '& .MuiInputBase-input': {
                py: 0.5,
              },
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </Box>

        {/* Row 2: Opacity Slider (horizontal layout) */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            opacity: cruseThemeEnabled ? 1 : 0.4,
            pointerEvents: cruseThemeEnabled ? 'auto' : 'none',
          }}
        >
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem', width: 50 }}>
            Opacity
          </Typography>
          <Slider
            value={glassOpacity}
            onChange={(_, value) => setGlassOpacity(value as number)}
            min={0}
            max={100}
            step={5}
            disabled={!cruseThemeEnabled}
            size="small"
            sx={{
              flex: 1,
              '& .MuiSlider-thumb': {
                width: 12,
                height: 12,
              },
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          />
          <Typography variant="caption" sx={{ color: 'text.primary', fontSize: '0.7rem', fontWeight: 500, width: 35, textAlign: 'right' }}>
            {glassOpacity}%
          </Typography>
        </Box>

        {/* Row 3: Blur Slider (horizontal layout) */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            opacity: cruseThemeEnabled ? 1 : 0.4,
            pointerEvents: cruseThemeEnabled ? 'auto' : 'none',
          }}
        >
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem', width: 50 }}>
            Blur
          </Typography>
          <Slider
            value={glassBlur}
            onChange={(_, value) => setGlassBlur(value as number)}
            min={0}
            max={10}
            step={0.1}
            disabled={!cruseThemeEnabled}
            size="small"
            sx={{
              flex: 1,
              '& .MuiSlider-thumb': {
                width: 12,
                height: 12,
              },
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          />
          <Typography variant="caption" sx={{ color: 'text.primary', fontSize: '0.7rem', fontWeight: 500, width: 35, textAlign: 'right' }}>
            {glassBlur.toFixed(1)}px
          </Typography>
        </Box>
      </MenuItem>

      <Divider sx={{ my: 0.5 }} />

      <MenuItem
        onClick={handleToggleLogs}
        sx={{
          py: 1.5,
          px: 2,
          gap: 1.5,
        }}
      >
        <VisibilityIcon fontSize="small" sx={{ color: 'primary.main' }} />
        <Typography variant="body2" sx={{ fontWeight: 500, flex: 1, color: 'text.primary' }}>
          Show Logs
        </Typography>
        <Switch
          checked={showLogs}
          size="small"
          sx={{
            '& .MuiSwitch-switchBase.Mui-checked': {
              color: 'success.main',
            },
            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
              backgroundColor: 'success.main',
            },
          }}
        />
      </MenuItem>
    </>
  );

  const glassStyles = useGlassEffect().getGlassStyles();

  // Collapsed View - Icon only
  if (isCollapsed) {
    return (
      <Box
        sx={{
          height: 'calc(100% - 48px)',
          width: '60px',
          maxWidth: '60px',
          display: 'flex',
          flexDirection: 'column',
          ...glassStyles,
          borderRadius: '12px',
          margin: '24px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden',
        }}
      >
        {/* Expand Button at Top */}
        <Tooltip title="Expand" placement="right">
          <IconButton
            onClick={handleToggleCollapse}
            sx={{
              m: 1,
              width: 40,
              height: 40,
              color: 'text.secondary',
              '&:hover': {
                color: 'primary.main',
                bgcolor: 'action.hover',
              },
            }}
          >
            <ExpandIcon />
          </IconButton>
        </Tooltip>

        <Divider sx={{ mx: 1 }} />

        {/* Agent Selector - Shows as Search Icon in collapsed mode */}
        {isLoadingAgents ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 1 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <>
            {/* Hidden AgentSelector - controlled externally */}
            <Box
              sx={{
                position: 'absolute',
                left: -9999,
                opacity: 0,
                pointerEvents: agentSelectorOpen ? 'auto' : 'none',
              }}
            >
              <AgentSelector
                agents={agents}
                selectedAgentId={selectedAgentId}
                onAgentChange={(agentId) => {
                  if (onAgentChange) {
                    onAgentChange(agentId);
                  }
                }}
                open={agentSelectorOpen}
                onOpen={() => setAgentSelectorOpen(true)}
                onClose={() => setAgentSelectorOpen(false)}
                cruseThemeEnabled={cruseThemeEnabled}
              />
            </Box>

            {/* Visible Search Icon Button */}
            <Tooltip title="Select Agent" placement="right">
              <IconButton
                onClick={() => setAgentSelectorOpen(true)}
                sx={{
                  m: 1,
                  width: 40,
                  height: 40,
                  color: selectedAgentId ? 'primary.main' : 'text.secondary',
                  '&:hover': {
                    color: 'primary.main',
                    bgcolor: 'action.hover',
                  },
                }}
              >
                <SearchIcon />
              </IconButton>
            </Tooltip>
          </>
        )}

        {/* Add New Thread Icon */}
        {showNewThreadButton && (
          <Tooltip title="New Thread" placement="right">
            <IconButton
              onClick={onNewThread}
              sx={{
                m: 1,
                mt: 0,
                width: 40,
                height: 40,
                color: 'primary.main',
                '&:hover': {
                  bgcolor: 'action.hover',
                },
              }}
            >
              <AddIcon />
            </IconButton>
          </Tooltip>
        )}

        <Divider sx={{ mx: 1 }} />

        {/* Thread Icons */}
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0.5,
            py: 1,
            '&::-webkit-scrollbar': {
              width: 4,
            },
            '&::-webkit-scrollbar-thumb': {
              bgcolor: 'rgba(0, 0, 0, 0.2)',
              borderRadius: 2,
            },
          }}
        >
          {agentThreads.slice(0, 10).map((thread) => (
            <Tooltip key={thread.id} title={thread.title} placement="right">
              <IconButton
                onClick={() => onThreadSelect(thread.id)}
                sx={{
                  width: 40,
                  height: 40,
                  color: thread.id === activeThreadId ? 'primary.main' : 'text.secondary',
                  bgcolor: thread.id === activeThreadId ? 'action.selected' : 'transparent',
                  '&:hover': {
                    bgcolor: 'action.hover',
                  },
                }}
              >
                <ChatIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ))}
        </Box>

        <Divider sx={{ mx: 1 }} />

        {/* Settings Icon at Bottom */}
        <Tooltip title="Settings" placement="right">
          <IconButton
            onClick={handleSettingsClick}
            sx={{
              m: 1,
              width: 40,
              height: 40,
              color: 'text.secondary',
              '&:hover': {
                color: 'primary.main',
                bgcolor: 'action.hover',
              },
            }}
          >
            <SettingsIcon />
          </IconButton>
        </Tooltip>

        {/* Settings Menu (same as expanded view) */}
        <Menu
          anchorEl={settingsAnchorEl}
          open={settingsOpen}
          onClose={handleSettingsClose}
          anchorOrigin={{
            vertical: 'top',
            horizontal: 'right',
          }}
          transformOrigin={{
            vertical: 'bottom',
            horizontal: 'left',
          }}
          slotProps={{
            paper: {
              sx: {
                minWidth: 220,
                borderRadius: 2,
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
              },
            },
          }}
        >
          {renderSettingsContent()}
        </Menu>
      </Box>
    );
  }

  // Expanded View - Full ThreadList
  return (
    <Box
      sx={{
        height: 'calc(100% - 48px)',
        width: '280px',
        maxWidth: '280px',
        display: 'flex',
        flexDirection: 'column',
        ...glassStyles,
        borderRadius: '12px',
        margin: '24px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden',
      }}
    >
      {/* Collapse Button + Agent Selector */}
      <Box
        sx={{
          p: 1,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Tooltip title="Collapse" placement="right">
          <IconButton
            onClick={handleToggleCollapse}
            sx={{
              width: 40,
              height: 40,
              color: 'text.secondary',
              '&:hover': {
                color: 'primary.main',
                bgcolor: 'action.hover',
              },
            }}
          >
            <CollapseIcon />
          </IconButton>
        </Tooltip>

        <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {isLoadingAgents ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <AgentSelector
              agents={agents}
              selectedAgentId={selectedAgentId}
              onAgentChange={onAgentChange || (() => {})}
              cruseThemeEnabled={cruseThemeEnabled}
            />
          )}
        </Box>
      </Box>

      {/* Show "+ New Thread" button when agent is selected */}
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
                  color: 'text.primary',
                },
              },
            }}
          >
            <AddIcon sx={{ fontSize: '1rem' }} color="primary" />
            <Typography
              sx={{
                fontWeight: 600,
                fontSize: '0.85rem',
                color: 'text.primary',
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
                          fontSize: '0.7rem',
                          lineHeight: 1,
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

      {/* Settings Section at Bottom */}
      <Box
        sx={{
          borderTop: 1,
          borderColor: 'divider',
          p: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.paper',
        }}
      >
        <IconButton
          onClick={handleSettingsClick}
          sx={{
            width: 40,
            height: 40,
            color: 'text.secondary',
            '&:hover': {
              color: 'primary.main',
              bgcolor: (theme) => theme.palette.mode === 'dark'
                ? 'rgba(255, 255, 255, 0.05)'
                : 'rgba(0, 0, 0, 0.04)',
            },
          }}
        >
          <SettingsIcon />
        </IconButton>

        <Menu
          anchorEl={settingsAnchorEl}
          open={settingsOpen}
          onClose={handleSettingsClose}
          anchorOrigin={{
            vertical: 'top',
            horizontal: 'center',
          }}
          transformOrigin={{
            vertical: 'bottom',
            horizontal: 'center',
          }}
          slotProps={{
            paper: {
              sx: {
                mt: -1,
                minWidth: 220,
                borderRadius: 2,
                boxShadow: (theme) => theme.palette.mode === 'dark'
                  ? '0 4px 20px rgba(0, 0, 0, 0.5)'
                  : '0 4px 20px rgba(0, 0, 0, 0.15)',
              },
            },
          }}
        >
          {renderSettingsContent()}
        </Menu>
      </Box>
    </Box>
  );
}
