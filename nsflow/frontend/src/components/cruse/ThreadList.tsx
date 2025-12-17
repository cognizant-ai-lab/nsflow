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
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Chat as ChatIcon,
  SettingsTwoTone as SettingsIcon,
  DeleteSweep as DeleteSweepIcon,
  Visibility as VisibilityIcon,
  Palette as PaletteIcon,
  Refresh as RefreshIcon,
  FlashOn as DynamicIcon,
  Image as StaticIcon,
  ChevronLeft as CollapseIcon,
  ChevronRight as ExpandIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { formatMessageTime } from '../../utils/cruse';
import { AgentSelector, Agent } from './AgentSelector';
import type { CruseThread } from '../../types/cruse';
import { useGlassEffect } from '../../context/GlassEffectContext';

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
  onRefreshTheme?: () => void;
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

  const [settingsAnchorEl, setSettingsAnchorEl] = useState<null | HTMLElement>(null);
  const settingsOpen = Boolean(settingsAnchorEl);

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

  const glassStyles = useGlassEffect().getGlassStyles();

  // Collapsed View - Icon only
  if (isCollapsed) {
    return (
      <Box
        sx={{
          height: '100%',
          width: '60px',
          display: 'flex',
          flexDirection: 'column',
          ...glassStyles,
          borderRadius: '12px',
          margin: '24px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        }}
      >
        {/* Expand Button at Top */}
        <Tooltip title="Expand" placement="right">
          <IconButton
            onClick={handleToggleCollapse}
            sx={{
              m: 1,
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

        {/* Agent Search Icon */}
        <Tooltip title="Select Agent" placement="right">
          <IconButton
            sx={{
              m: 1,
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

          {/* Cruse Theme Settings (same as expanded) */}
          <MenuItem
            sx={{
              py: 1.5,
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <PaletteIcon fontSize="small" sx={{ color: 'primary.main' }} />
              <Typography variant="body2" sx={{ fontWeight: 500, flex: 1, color: 'text.primary' }}>
                Cruse Theme
              </Typography>
              <Switch
                checked={cruseThemeEnabled}
                onChange={(e) => {
                  e.stopPropagation();
                  onCruseThemeToggle?.(e.target.checked);
                }}
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
            </Box>

            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                ml: 4,
                opacity: cruseThemeEnabled ? 1 : 0.4,
                pointerEvents: cruseThemeEnabled ? 'auto' : 'none',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  overflow: 'hidden',
                  flex: 1,
                }}
              >
                <Box
                  onClick={(e) => {
                    e.stopPropagation();
                    if (cruseThemeEnabled) {
                      onBackgroundTypeChange?.('static');
                    }
                  }}
                  sx={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 0.5,
                    py: 0.5,
                    px: 1,
                    cursor: cruseThemeEnabled ? 'pointer' : 'not-allowed',
                    bgcolor: backgroundType === 'static' ? 'primary.main' : 'transparent',
                    color: backgroundType === 'static' ? 'primary.contrastText' : 'text.secondary',
                    transition: 'all 0.2s',
                    '&:hover': cruseThemeEnabled ? {
                      bgcolor: backgroundType === 'static' ? 'primary.dark' : 'action.hover',
                    } : {},
                  }}
                >
                  <StaticIcon sx={{ fontSize: '0.9rem' }} />
                  <Typography variant="caption" sx={{ fontWeight: 500, fontSize: '0.7rem' }}>
                    Static
                  </Typography>
                </Box>
                <Box
                  onClick={(e) => {
                    e.stopPropagation();
                    if (cruseThemeEnabled) {
                      onBackgroundTypeChange?.('dynamic');
                    }
                  }}
                  sx={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 0.5,
                    py: 0.5,
                    px: 1,
                    cursor: cruseThemeEnabled ? 'pointer' : 'not-allowed',
                    bgcolor: backgroundType === 'dynamic' ? 'primary.main' : 'transparent',
                    color: backgroundType === 'dynamic' ? 'primary.contrastText' : 'text.secondary',
                    transition: 'all 0.2s',
                    '&:hover': cruseThemeEnabled ? {
                      bgcolor: backgroundType === 'dynamic' ? 'primary.dark' : 'action.hover',
                    } : {},
                  }}
                >
                  <DynamicIcon sx={{ fontSize: '0.9rem' }} />
                  <Typography variant="caption" sx={{ fontWeight: 500, fontSize: '0.7rem' }}>
                    Dynamic
                  </Typography>
                </Box>
              </Box>

              <IconButton
                size="small"
                disabled={!cruseThemeEnabled || isRefreshingTheme}
                onClick={(e) => {
                  e.stopPropagation();
                  if (cruseThemeEnabled && !isRefreshingTheme) {
                    onRefreshTheme?.();
                  }
                }}
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 0.5,
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
                  <RefreshIcon sx={{ fontSize: '1rem' }} />
                )}
              </IconButton>
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
          p: 2,
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
            size="small"
            sx={{
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

        <Box sx={{ flex: 1 }}>
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

          {/* Cruse Theme Settings */}
          <MenuItem
            sx={{
              py: 1.5,
              px: 2,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: 1,
              '&:hover': {
                bgcolor: 'action.hover',
              },
            }}
            onClick={(e) => e.stopPropagation()} // Prevent menu from closing
          >
            {/* First Row: Cruse Theme Toggle */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <PaletteIcon fontSize="small" sx={{ color: 'primary.main' }} />
              <Typography variant="body2" sx={{ fontWeight: 500, flex: 1, color: 'text.primary' }}>
                Cruse Theme
              </Typography>
              <Switch
                checked={cruseThemeEnabled}
                onChange={(e) => {
                  e.stopPropagation();
                  onCruseThemeToggle?.(e.target.checked);
                }}
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
            </Box>

            {/* Second Row: Type Toggle and Refresh Button */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                ml: 4, // Indent to align with content
                opacity: cruseThemeEnabled ? 1 : 0.4,
                pointerEvents: cruseThemeEnabled ? 'auto' : 'none',
              }}
            >
              {/* Static/Dynamic Toggle Buttons */}
              <Box
                sx={{
                  display: 'flex',
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  overflow: 'hidden',
                  flex: 1,
                }}
              >
                <Box
                  onClick={(e) => {
                    e.stopPropagation();
                    if (cruseThemeEnabled) {
                      onBackgroundTypeChange?.('static');
                    }
                  }}
                  sx={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 0.5,
                    py: 0.5,
                    px: 1,
                    cursor: cruseThemeEnabled ? 'pointer' : 'not-allowed',
                    bgcolor: backgroundType === 'static' ? 'primary.main' : 'transparent',
                    color: backgroundType === 'static' ? 'primary.contrastText' : 'text.secondary',
                    transition: 'all 0.2s',
                    '&:hover': cruseThemeEnabled ? {
                      bgcolor: backgroundType === 'static' ? 'primary.dark' : 'action.hover',
                    } : {},
                  }}
                >
                  <StaticIcon sx={{ fontSize: '0.9rem' }} />
                  <Typography variant="caption" sx={{ fontWeight: 500, fontSize: '0.7rem' }}>
                    Static
                  </Typography>
                </Box>
                <Box
                  onClick={(e) => {
                    e.stopPropagation();
                    if (cruseThemeEnabled) {
                      onBackgroundTypeChange?.('dynamic');
                    }
                  }}
                  sx={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 0.5,
                    py: 0.5,
                    px: 1,
                    cursor: cruseThemeEnabled ? 'pointer' : 'not-allowed',
                    bgcolor: backgroundType === 'dynamic' ? 'primary.main' : 'transparent',
                    color: backgroundType === 'dynamic' ? 'primary.contrastText' : 'text.secondary',
                    transition: 'all 0.2s',
                    '&:hover': cruseThemeEnabled ? {
                      bgcolor: backgroundType === 'dynamic' ? 'primary.dark' : 'action.hover',
                    } : {},
                  }}
                >
                  <DynamicIcon sx={{ fontSize: '0.9rem' }} />
                  <Typography variant="caption" sx={{ fontWeight: 500, fontSize: '0.7rem' }}>
                    Dynamic
                  </Typography>
                </Box>
              </Box>

              {/* Refresh Button */}
              <IconButton
                size="small"
                disabled={!cruseThemeEnabled || isRefreshingTheme}
                onClick={(e) => {
                  e.stopPropagation();
                  if (cruseThemeEnabled && !isRefreshingTheme) {
                    onRefreshTheme?.();
                  }
                }}
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 0.5,
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
                  <RefreshIcon sx={{ fontSize: '1rem' }} />
                )}
              </IconButton>
            </Box>

            {/* Third Row: Opacity Slider */}
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 0.5,
                ml: 4,
                mt: 1,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                  Opacity
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.primary', fontSize: '0.7rem', fontWeight: 500 }}>
                  {glassOpacity}%
                </Typography>
              </Box>
              <Slider
                value={glassOpacity}
                onChange={(_, value) => setGlassOpacity(value as number)}
                min={0}
                max={100}
                step={5}
                size="small"
                sx={{
                  '& .MuiSlider-thumb': {
                    width: 12,
                    height: 12,
                  },
                  '& .MuiSlider-track': {
                    bgcolor: 'primary.main',
                  },
                }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              />
            </Box>

            {/* Fourth Row: Blur Slider */}
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 0.5,
                ml: 4,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                  Blur
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.primary', fontSize: '0.7rem', fontWeight: 500 }}>
                  {glassBlur.toFixed(1)}px
                </Typography>
              </Box>
              <Slider
                value={glassBlur}
                onChange={(_, value) => setGlassBlur(value as number)}
                min={0}
                max={10}
                step={0.1}
                size="small"
                sx={{
                  '& .MuiSlider-thumb': {
                    width: 12,
                    height: 12,
                  },
                  '& .MuiSlider-track': {
                    bgcolor: 'primary.main',
                  },
                }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              />
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
        </Menu>
      </Box>
    </Box>
  );
}
