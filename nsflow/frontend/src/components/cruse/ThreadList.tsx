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
import { Box, List, ListItem, ListItemButton, ListItemText, ListItemIcon, IconButton, Divider,
  Typography, CircularProgress, Menu, MenuItem, Switch, Tooltip, Slider, TextField, useTheme, Checkbox
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Chat as ChatIcon, SettingsTwoTone as SettingsIcon,
  DeleteSweep as DeleteSweepIcon, Visibility as VisibilityIcon, Refresh as RefreshIcon, ChevronLeft as CollapseIcon,
  ChevronRight as ExpandIcon, Search as SearchIcon, Palette as PaletteIcon } from '@mui/icons-material';
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
  onRefreshTheme?: (userPrompt?: string, modifyPreviousBackground?: boolean) => void;
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
  onCruseThemeToggle: _onCruseThemeToggle,
  backgroundType: _backgroundType = 'dynamic',
  onBackgroundTypeChange: _onBackgroundTypeChange,
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
  const theme = useTheme();

  // Theme refresh prompt state - stored per targetNetwork (not selectedAgentId)
  const [themePrompt, setThemePrompt] = useState(() => {
    if (!targetNetwork) return '';
    const stored = localStorage.getItem(`cruse_theme_prompt_${targetNetwork}`);
    return stored || '';
  });

  // Modify previous background state - stored per targetNetwork
  const [modifyPreviousBackground, setModifyPreviousBackground] = useState(() => {
    if (!targetNetwork) return false;
    const stored = localStorage.getItem(`cruse_modify_previous_${targetNetwork}`);
    return stored === 'true';
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

  // Persist modify previous background to localStorage (per targetNetwork)
  useEffect(() => {
    if (targetNetwork) {
      localStorage.setItem(`cruse_modify_previous_${targetNetwork}`, String(modifyPreviousBackground));
    }
  }, [modifyPreviousBackground, targetNetwork]);

  // Load theme prompt when targetNetwork changes
  useEffect(() => {
    if (targetNetwork) {
      const stored = localStorage.getItem(`cruse_theme_prompt_${targetNetwork}`);
      setThemePrompt(stored || '');
    } else {
      setThemePrompt('');
    }
  }, [targetNetwork]);

  // Load modify previous background when targetNetwork changes
  useEffect(() => {
    if (targetNetwork) {
      const stored = localStorage.getItem(`cruse_modify_previous_${targetNetwork}`);
      setModifyPreviousBackground(stored === 'true');
    } else {
      setModifyPreviousBackground(false);
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
          py: 1,
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

      <Divider sx={{ my: 0 }} />

      {/* Theme Settings Header */}
      <Box
        sx={{
          py: 1,
          px: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 0.75,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <PaletteIcon fontSize="small" sx={{ color: 'primary.main' }} />
          <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
            Theme
          </Typography>
        </Box>
        {/* Refresh Button */}
        <IconButton
          size="small"
          disabled={isRefreshingTheme}
          onClick={(e) => {
            e.stopPropagation();
            if (!isRefreshingTheme) {
              onRefreshTheme?.(themePrompt, modifyPreviousBackground);
            }
          }}
          sx={{
            width: 28,
            height: 28,
            border: 1,
            borderColor: 'divider',
            borderRadius: '50%',
            '&:hover': {
              bgcolor: 'action.hover',
            },
            '&.Mui-disabled': {
              opacity: 0.4,
            },
          }}
        >
          {isRefreshingTheme ? (
            <CircularProgress size={18} />
          ) : (
            <RefreshIcon sx={{ fontSize: '1.4rem' }} />
          )}
        </IconButton>
      </Box>

      {/* Theme Settings Content */}
      <MenuItem
        sx={{
          py: 0.5,
          px: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 0.25,
          '&:hover': {
            bgcolor: 'action.hover',
          },
        }}
        onClick={(e) => e.stopPropagation()}
      >

        {/* User Prompt for Theme Refresh */}
        <Box
          sx={{
            mt: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.3,
          }}
        >
          {/* Label Row */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 0.25 }}>
            <Typography
              variant="caption"
              sx={{
                color: theme.palette.text.secondary,
                fontSize: '0.6rem',
                fontWeight: 500,
              }}
            >
              User Prompt
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography
                variant="caption"
                sx={{
                  color: theme.palette.text.secondary,
                  fontSize: '0.6rem',
                  fontWeight: 500,
                }}
              >
                Modify Bg
              </Typography>
              <Checkbox
                checked={modifyPreviousBackground}
                onChange={(e) => setModifyPreviousBackground(e.target.checked)}
                size="small"
                sx={{
                  padding: 0,
                  width: 16,
                  height: 16,
                  '& .MuiSvgIcon-root': {
                    fontSize: '1rem',
                  },
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </Box>
          </Box>

          {/* TextField - Slightly taller than 1 row with scroll */}
          <TextField
            value={themePrompt}
            onChange={(e) => setThemePrompt(e.target.value)}
            placeholder="Optional: Customize theme generation..."
            multiline
            maxRows={1.5}
            minRows={1.5}
            size="small"
            fullWidth
            sx={{
              '& .MuiOutlinedInput-root': {
                fontSize: '0.75rem',
                maxHeight: '42px',
                overflow: 'hidden',
                '& fieldset': {
                  borderColor: 'divider',
                },
                '&:hover fieldset': {
                  borderColor: 'primary.main',
                },
                '&.Mui-focused fieldset': {
                  borderColor: 'primary.main',
                },
                '& textarea': {
                  overflow: 'auto !important',
                  '&::-webkit-scrollbar': {
                    width: '6px',
                  },
                  '&::-webkit-scrollbar-thumb': {
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '3px',
                  },
                },
              },
              '& .MuiInputBase-input': {
                py: 0.5,
                px: 0.75,
              },
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </Box>

        {/* Opacity Slider */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mt: 0.25,
          }}
        >
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', width: 48 }}>
            Opacity
          </Typography>
          <Slider
            value={glassOpacity}
            onChange={(_, value) => setGlassOpacity(value as number)}
            min={0}
            max={100}
            step={1}
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
          <Typography variant="caption" sx={{ color: 'text.primary', fontSize: '0.65rem', fontWeight: 500, width: 32, textAlign: 'right' }}>
            {glassOpacity}%
          </Typography>
        </Box>

        {/* Blur Slider */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mt: 0.25,
          }}
        >
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', width: 48 }}>
            Blur
          </Typography>
          <Slider
            value={glassBlur}
            onChange={(_, value) => setGlassBlur(value as number)}
            min={0}
            max={10}
            step={0.1}
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
          <Typography variant="caption" sx={{ color: 'text.primary', fontSize: '0.65rem', fontWeight: 500, width: 32, textAlign: 'right' }}>
            {glassBlur.toFixed(1)}px
          </Typography>
        </Box>
      </MenuItem>

      <Divider sx={{ my: 0 }} />

      <MenuItem
        onClick={handleToggleLogs}
        sx={{
          py: 1,
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
        onClick={(e) => {
          if (!settingsOpen) {
            handleSettingsClick(e);
          }
        }}
        sx={{
          borderTop: 1,
          borderColor: 'divider',
          p: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.paper',
          cursor: 'pointer',
          transition: 'background-color 0.2s',
          '&:hover': {
            bgcolor: (theme) => theme.palette.mode === 'dark'
              ? 'rgba(255, 255, 255, 0.12)'
              : 'rgba(0, 0, 0, 0.08)',
            '& .settings-icon': {
              color: 'primary.main',
            },
          },
        }}
      >
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            handleSettingsClick(e);
          }}
          sx={{
            width: 40,
            height: 40,
            color: 'text.secondary',
            pointerEvents: 'all',
            '&:hover': {
              color: 'primary.main',
              bgcolor: (theme) => theme.palette.mode === 'dark'
                ? 'rgba(255, 255, 255, 0.05)'
                : 'rgba(0, 0, 0, 0.04)',
            },
          }}
        >
          <SettingsIcon className="settings-icon" />
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
