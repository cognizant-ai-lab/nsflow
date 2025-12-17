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

import { useState, useRef, useEffect } from 'react';
import {
  FormControl,
  Select,
  MenuItem,
  InputLabel,
  SelectChangeEvent,
  Box,
  Typography,
  TextField,
  InputAdornment,
  Tooltip,
} from '@mui/material';
import { SmartToy as AgentIcon, Search as SearchIcon } from '@mui/icons-material';
import { useGlassEffect } from '../../context/GlassEffectContext';

export interface Agent {
  /** Unique agent identifier */
  id: string;
  /** Display name */
  name: string;
  /** Optional description */
  description?: string;
  /** Optional status indicator */
  status?: 'online' | 'offline';
}

export interface AgentSelectorProps {
  /** Array of available agents */
  agents: Agent[];
  /** Currently selected agent ID */
  selectedAgentId?: string;
  /** Callback when agent selection changes */
  onAgentChange: (agentId: string) => void;
  /** Size variant */
  size?: 'small' | 'medium';
  /** Custom label */
  label?: string;
  /** External control of open state */
  open?: boolean;
  /** Callback when dropdown opens */
  onOpen?: () => void;
  /** Callback when dropdown closes */
  onClose?: () => void;
  /** Collapsed mode - shows only icon */
  collapsed?: boolean;
}

/**
 * AgentSelector Component
 *
 * Dropdown selector for choosing the active agent.
 * Sets the activeNetwork for WebSocket communication.
 *
 * Features:
 * - Agent list with descriptions
 * - Status indicators
 * - Icon decorations
 * - Compact or full-size variants
 */
export function AgentSelector({
  agents,
  selectedAgentId,
  onAgentChange,
  size = 'small',
  label = 'Select Agent',
  open: externalOpen,
  onOpen: externalOnOpen,
  onClose: externalOnClose,
  collapsed = false,
}: AgentSelectorProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { getGlassStyles } = useGlassEffect();

  // Use external open state if provided, otherwise use internal
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = (value: boolean) => {
    if (externalOpen !== undefined) {
      // External control
      if (value && externalOnOpen) {
        externalOnOpen();
      } else if (!value && externalOnClose) {
        externalOnClose();
      }
    } else {
      // Internal control
      setInternalOpen(value);
    }
  };

  // Auto-focus search input when dropdown opens
  useEffect(() => {
    if (open && searchInputRef.current) {
      // Delay to ensure the menu is fully rendered and visible
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    } else {
      // Clear search when dropdown closes
      setSearchQuery('');
    }
  }, [open]);

  const handleChange = (event: SelectChangeEvent<string>) => {
    const agentId = event.target.value;
    onAgentChange(agentId);
    setOpen(false);
  };

  // Filter agents based on search query
  const filteredAgents = agents.filter((agent) => {
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase();
    const nameMatch = agent.name.toLowerCase().includes(query);
    const descriptionMatch = agent.description?.toLowerCase().includes(query);

    return nameMatch || descriptionMatch;
  });

  const glassStyles = getGlassStyles();

  return (
    <FormControl
      fullWidth
      size={size}
      sx={{
        ...glassStyles,
        borderRadius: 1,
        '& .MuiInputLabel-root': {
          color: 'text.secondary',
          '&.Mui-focused': {
            color: 'primary.main',
          },
        },
        '& .MuiOutlinedInput-root': {
          '& fieldset': {
            borderColor: 'divider',
          },
          '&:hover fieldset': {
            borderColor: 'text.secondary',
          },
          '&.Mui-focused fieldset': {
            borderColor: 'primary.main',
          },
        },
      }}
    >
      <InputLabel id="agent-selector-label">{label}</InputLabel>
      <Select
        labelId="agent-selector-label"
        id="agent-selector"
        value={selectedAgentId || ''}
        label={label}
        onChange={handleChange}
        open={open}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        sx={{
          '& .MuiSelect-select': {
            color: 'text.primary',
          },
        }}
        MenuProps={{
          PaperProps: {
            sx: {
              bgcolor: 'background.paper',
              maxWidth: '100%',
              maxHeight: 400,
              '& .MuiList-root': {
                pt: 0, // Remove default padding to make search box flush
              },
              '& .MuiMenuItem-root': {
                color: 'text.primary',
                '&:hover': {
                  bgcolor: 'action.hover',
                },
                '&.Mui-selected': {
                  bgcolor: 'action.selected',
                  '&:hover': {
                    bgcolor: 'action.selected',
                  },
                },
              },
            },
          },
          anchorOrigin: {
            vertical: 'bottom',
            horizontal: 'left',
          },
          transformOrigin: {
            vertical: 'top',
            horizontal: 'left',
          },
        }}
        renderValue={(value) => {
          // In collapsed mode, show only search icon
          if (collapsed) {
            return (
              <Tooltip title={selectedAgentId ? agents.find(a => a.id === selectedAgentId)?.name || 'Select Agent' : 'Select Agent'} placement="right">
                <SearchIcon
                  sx={{
                    color: selectedAgentId ? 'primary.main' : 'text.secondary',
                    fontSize: '1.25rem',
                  }}
                />
              </Tooltip>
            );
          }

          // Normal mode - show agent name
          const agent = agents.find((a) => a.id === value);
          if (!agent) return '';

          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, overflow: 'hidden' }}>
              <AgentIcon fontSize="small" color="primary" sx={{ flexShrink: 0 }} />
              <Typography
                variant="body2"
                color="text.primary"
                sx={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
              >
                {agent.name}
              </Typography>
              {agent.status && (
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: agent.status === 'online' ? 'success.main' : 'grey.500',
                    flexShrink: 0,
                  }}
                />
              )}
            </Box>
          );
        }}
      >
        {/* Search Box - Pinned at top */}
        <Box
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 1,
            bgcolor: 'background.paper',
            p: 1.5,
            pb: 1,
            borderBottom: 1,
            borderColor: 'divider',
          }}
          onKeyDown={(e) => {
            // Prevent Select from closing when typing in search box
            e.stopPropagation();
          }}
          onMouseDown={(e) => {
            // Prevent menu from closing when clicking search box
            e.stopPropagation();
          }}
        >
          <TextField
            inputRef={searchInputRef}
            autoFocus
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="small"
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                </InputAdornment>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 3,
                bgcolor: 'action.hover',
                '& fieldset': {
                  borderColor: 'transparent',
                },
                '&:hover fieldset': {
                  borderColor: 'primary.main',
                },
                '&.Mui-focused fieldset': {
                  borderColor: 'primary.main',
                },
              },
            }}
          />
        </Box>

        {/* Agent List - Scrollable */}
        {agents.length === 0 ? (
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary">
              No agents available
            </Typography>
          </MenuItem>
        ) : filteredAgents.length === 0 ? (
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary">
              No agents match your search
            </Typography>
          </MenuItem>
        ) : (
          filteredAgents.map((agent) => (
            <MenuItem key={agent.id} value={agent.id}>
              <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', overflow: 'hidden' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <AgentIcon fontSize="small" color="primary" sx={{ flexShrink: 0 }} />
                  <Typography
                    variant="body2"
                    fontWeight={600}
                    color="success.light"
                    sx={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    }}
                  >
                    {agent.name}
                  </Typography>
                  {agent.status && (
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: agent.status === 'online' ? 'success.main' : 'grey.500',
                        flexShrink: 0,
                      }}
                    />
                  )}
                </Box>
                {agent.description && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      pl: 3,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {agent.description}
                  </Typography>
                )}
              </Box>
            </MenuItem>
          ))
        )}
      </Select>
    </FormControl>
  );
}
