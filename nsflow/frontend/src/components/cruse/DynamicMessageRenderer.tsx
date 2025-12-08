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

import { Box, Paper, Typography, Chip } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import { CruseMessage } from '../../types/cruse';
import { DynamicWidgetCard } from './DynamicWidgetCard';
import { hasWidget, getToolName, formatMessageTime } from '../../utils/cruse';

export interface DynamicMessageRendererProps {
  /** Message to render */
  message: CruseMessage;
  /** Callback when widget form is submitted */
  onWidgetSubmit: (data: Record<string, unknown>) => void;
}

/**
 * DynamicMessageRenderer
 *
 * Renders a CRUSE message with optional dynamic widget.
 * Displays message text with markdown support and inline widget card.
 */
export function DynamicMessageRenderer({
  message,
  onWidgetSubmit,
}: DynamicMessageRendererProps) {
  const isUser = message.sender === 'HUMAN';
  const isSystem = message.sender === 'SYSTEM';
  const toolName = getToolName(message.origin);
  const timeString = formatMessageTime(message.created_at);
  const showWidget = hasWidget(message);

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        mb: 2,
      }}
    >
      <Box
        sx={{
          maxWidth: '70%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: isUser ? 'flex-end' : 'flex-start',
        }}
      >
        {/* Message header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mb: 0.5,
          }}
        >
          <Chip
            label={isUser ? 'You' : isSystem ? 'System' : toolName}
            size="small"
            color={isUser ? 'primary' : isSystem ? 'default' : 'secondary'}
            sx={{ fontSize: '0.75rem' }}
          />
          <Typography variant="caption" color="text.secondary">
            {timeString}
          </Typography>
        </Box>

        {/* Message content */}
        <Paper
          elevation={1}
          sx={{
            p: 2,
            backgroundColor: isUser
              ? 'primary.main'
              : isSystem
              ? 'action.hover'
              : 'background.paper',
            color: isUser ? 'primary.contrastText' : 'text.primary',
            borderRadius: 2,
            ...(isUser && {
              borderTopRightRadius: 4,
            }),
            ...(!isUser && {
              borderTopLeftRadius: 4,
            }),
          }}
        >
          <ReactMarkdown>{message.text}</ReactMarkdown>
        </Paper>

        {/* Dynamic Widget */}
        {showWidget && message.widget && (
          <Box sx={{ mt: 2, width: '100%' }}>
            <DynamicWidgetCard
              widget={message.widget}
              onSubmit={onWidgetSubmit}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}
