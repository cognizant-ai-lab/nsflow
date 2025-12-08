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

import { useState } from 'react';
import {
  FormControl,
  Select,
  MenuItem,
  InputLabel,
  SelectChangeEvent,
  Box,
  Typography,
  Chip,
} from '@mui/material';
import { SmartToy as AgentIcon } from '@mui/icons-material';

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
}: AgentSelectorProps) {
  const [open, setOpen] = useState(false);

  const handleChange = (event: SelectChangeEvent<string>) => {
    const agentId = event.target.value;
    onAgentChange(agentId);
    setOpen(false);
  };

  return (
    <FormControl
      size={size}
      sx={{
        minWidth: 220,
        bgcolor: 'background.paper',
        borderRadius: 1,
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
        renderValue={(value) => {
          const agent = agents.find((a) => a.id === value);
          if (!agent) return '';

          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AgentIcon fontSize="small" color="primary" />
              <Typography variant="body2">{agent.name}</Typography>
              {agent.status && (
                <Chip
                  label={agent.status}
                  size="small"
                  color={agent.status === 'online' ? 'success' : 'default'}
                  sx={{ height: 20, fontSize: '0.7rem' }}
                />
              )}
            </Box>
          );
        }}
      >
        {agents.length === 0 ? (
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary">
              No agents available
            </Typography>
          </MenuItem>
        ) : (
          agents.map((agent) => (
            <MenuItem key={agent.id} value={agent.id}>
              <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <AgentIcon fontSize="small" color="primary" />
                  <Typography variant="body2" fontWeight={600}>
                    {agent.name}
                  </Typography>
                  {agent.status && (
                    <Chip
                      label={agent.status}
                      size="small"
                      color={agent.status === 'online' ? 'success' : 'default'}
                      sx={{ height: 18, fontSize: '0.65rem', ml: 'auto' }}
                    />
                  )}
                </Box>
                {agent.description && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ pl: 3 }}
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
