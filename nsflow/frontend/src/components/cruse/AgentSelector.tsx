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

import { useRef } from 'react';
import {
  Autocomplete,
  Box,
  Typography,
  TextField,
  Tooltip,
  alpha,
} from '@mui/material';
import { AccountTreeTwoTone as AgentIcon, Close as CloseIcon, Search as SearchIcon } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
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
  /** Cruse Theme enabled state */
  cruseThemeEnabled?: boolean;
  /** Disable interactions */
  disabled?: boolean;
}

/**
 * AgentSelector Component
 *
 * Autocomplete-based selector for choosing the active agent.
 * The input itself acts as a search box. Clearing and blurring
 * without a new selection restores the previous agent.
 *
 * Features:
 * - Type-to-search in the input field
 * - Agent list with descriptions and status indicators
 * - Clear (X) button to reset selection
 * - Restore previous selection on blur without new pick
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
  cruseThemeEnabled = false,
  disabled = false,
}: AgentSelectorProps) {
  const theme = useTheme();
  const { getGlassStyles } = useGlassEffect();
  const previousAgentRef = useRef<string | undefined>(selectedAgentId);

  // Track whether a selection was made during this open session
  const selectionMadeRef = useRef(false);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) || null;

  const glassStyles = cruseThemeEnabled ? getGlassStyles() : {};

  // Collapsed mode: just show an icon button (handled externally in ThreadList)
  if (collapsed) {
    return (
      <Tooltip title={selectedAgent?.name || 'Select Agent'} placement="right">
        <SearchIcon
          sx={{
            color: selectedAgentId ? 'primary.main' : 'text.secondary',
            fontSize: '1.25rem',
          }}
        />
      </Tooltip>
    );
  }

  // Sort agents: by folder first, then by leaf name
  const sortedAgents = [...agents].sort((a, b) => {
    const folderA = a.id.split('/').slice(0, -1).join('/');
    const folderB = b.id.split('/').slice(0, -1).join('/');
    if (folderA !== folderB) return folderA.localeCompare(folderB);
    return a.id.localeCompare(b.id);
  });

  const groupBgColor = theme.palette.mode === 'dark'
    ? 'rgba(30, 30, 30, 0.98)'
    : 'rgba(255, 255, 255, 0.98)';

  return (
    <Autocomplete
      disabled={disabled}
      size={size}
      options={sortedAgents}
      getOptionLabel={(option) => option.name}
      groupBy={(option) => option.id.split('/').slice(0, -1).join('/') || ''}
      value={selectedAgent}
      {...(externalOpen !== undefined ? { open: externalOpen } : {})}
      onOpen={() => {
        previousAgentRef.current = selectedAgentId;
        selectionMadeRef.current = false;
        externalOnOpen?.();
      }}
      onClose={() => {
        if (!selectionMadeRef.current && previousAgentRef.current) {
          if (selectedAgentId !== previousAgentRef.current) {
            onAgentChange(previousAgentRef.current);
          }
        }
        externalOnClose?.();
      }}
      onChange={(_event, value) => {
        if (value) {
          selectionMadeRef.current = true;
          onAgentChange(value.id);
        }
      }}
      clearIcon={
        <Tooltip title="Clear agent selection">
          <CloseIcon sx={{ fontSize: 18 }} />
        </Tooltip>
      }
      onInputChange={(_event, _value, reason) => {
        if (reason === 'clear') {
          selectionMadeRef.current = true;
          onAgentChange('');
        }
      }}
      filterOptions={(options, { inputValue }) => {
        if (!inputValue.trim()) return options;
        const query = inputValue.toLowerCase();
        return options.filter(
          (agent) =>
            agent.name.toLowerCase().includes(query) ||
            agent.id.toLowerCase().includes(query) ||
            agent.description?.toLowerCase().includes(query)
        );
      }}
      isOptionEqualToValue={(option, value) => option.id === value.id}
      noOptionsText="No agents match your search"
      renderGroup={(params) => (
        <li key={params.key}>
          {params.group && (
            <Box
              component="div"
              sx={{
                fontSize: 12,
                fontWeight: 700,
                lineHeight: '26px',
                minHeight: 26,
                pl: 1,
                color: theme.palette.text.secondary,
                position: 'sticky',
                top: -4,
                zIndex: 1,
                backgroundColor: groupBgColor,
              }}
            >
              {params.group}
            </Box>
          )}
          <ul style={{ padding: 0 }}>{params.children}</ul>
        </li>
      )}
      slotProps={{
        clearIndicator: {
          sx: {
            color: theme.palette.error.main,
            backgroundColor: alpha(theme.palette.error.main, 0.1),
            borderRadius: '50%',
            width: 22,
            height: 22,
            transition: 'all 200ms ease',
            '&:hover': {
              backgroundColor: alpha(theme.palette.error.main, 0.22),
              transform: 'scale(1.1)',
              boxShadow: `0 2px 8px ${alpha(theme.palette.error.main, 0.3)}`,
            },
            '&:active': {
              transform: 'scale(0.95)',
            },
          },
        },
        listbox: {
          sx: {
            maxHeight: 350,
            py: 0.5,
            '& .MuiAutocomplete-option': {
              fontSize: 13,
              minHeight: 28,
              py: '2px',
              pl: 3,
              pr: 1,
              backgroundColor: 'transparent',
              '&[aria-selected="true"]': {
                backgroundColor: alpha(theme.palette.primary.main, 0.15),
              },
              '&.Mui-focused, &:hover': {
                backgroundColor: alpha(theme.palette.primary.main, 0.08),
              },
            },
            '& .MuiAutocomplete-groupLabel': {
              display: 'none',
            },
            '& .MuiAutocomplete-groupUl': {
              backgroundColor: 'transparent',
            },
          },
        },
        paper: {
          sx: {
            bgcolor: groupBgColor,
            backdropFilter: 'blur(20px)',
            border: `1px solid ${
              theme.palette.mode === 'dark'
                ? 'rgba(255, 255, 255, 0.08)'
                : 'rgba(0, 0, 0, 0.06)'
            }`,
            borderRadius: 3,
            boxShadow: theme.palette.mode === 'dark'
              ? '0 8px 32px rgba(0, 0, 0, 0.5)'
              : '0 8px 32px rgba(0, 0, 0, 0.12)',
          },
        },
      }}
      renderOption={(props, agent) => {
        const { key, ...rest } = props as any;
        // Show only the leaf name (last segment of the id)
        const leafName = agent.id.split('/').pop() || agent.name;
        return (
          <li key={key} {...rest}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, overflow: 'hidden' }}>
              <AgentIcon sx={{ fontSize: 14, color: 'primary.main', flexShrink: 0 }} />
              <Typography
                variant="body2"
                sx={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'text.primary',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
              >
                {leafName}
              </Typography>
            </Box>
          </li>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          variant="outlined"
          placeholder="Type to search..."
        />
      )}
      sx={{
        ...glassStyles,
        borderRadius: 1,
        minWidth: 0,
        mt: 0.7,
        '& .MuiInputLabel-root': {
          color: 'text.secondary',
          '&.Mui-focused': {
            color: 'primary.main',
          },
        },
        '& .MuiOutlinedInput-root': {
          '& fieldset': {
            borderColor: theme.palette.divider,
          },
          '&:hover fieldset': {
            borderColor: theme.palette.text.secondary,
          },
          '&.Mui-focused fieldset': {
            borderColor: theme.palette.primary.main,
          },
        },
      }}
    />
  );
}
