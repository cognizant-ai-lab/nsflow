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

import { useState, KeyboardEvent } from 'react';
import {
  Box,
  TextField,
  IconButton,
  Typography,
  CircularProgress,
  Fab,
  Tooltip,
} from '@mui/material';
import {
  Send as SendIcon,
  Refresh as RefreshIcon,
  KeyboardArrowDown as ScrollDownIcon,
} from '@mui/icons-material';
import { DynamicMessageRenderer } from './DynamicMessageRenderer';
import { useSmartAutoScroll } from '../../hooks/useSmartAutoScroll';
import type { CruseMessage, ThemeConfig } from '../../types/cruse';

export interface ChatAreaProps {
  /** Array of messages to display */
  messages: CruseMessage[];
  /** Current thread title */
  threadTitle?: string;
  /** Loading state for messages */
  isLoading?: boolean;
  /** Theme configuration */
  theme?: ThemeConfig;
  /** Loading state for theme */
  isLoadingTheme?: boolean;
  /** Callback when user sends a message */
  onSendMessage: (text: string) => void;
  /** Callback when widget is submitted */
  onWidgetSubmit: (data: Record<string, unknown>) => void;
  /** Callback when theme refresh is requested */
  onThemeRefresh?: () => void;
}

/**
 * ChatArea Component
 *
 * Central chat interface with:
 * - Dynamic theme background and styling
 * - Message list with widget support
 * - Text input with send button
 * - Smart auto-scroll
 * - Theme refresh button
 * - Scroll-to-bottom FAB
 */
export function ChatArea({
  messages,
  threadTitle = 'CRUSE Chat',
  isLoading = false,
  theme,
  isLoadingTheme = false,
  onSendMessage,
  onWidgetSubmit,
  onThemeRefresh,
}: ChatAreaProps) {
  const [inputText, setInputText] = useState('');
  const { scrollRef, scrollToBottom, isNearBottom } = useSmartAutoScroll([messages]);

  // Handle send message
  const handleSend = () => {
    if (inputText.trim()) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  // Handle Enter key
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Apply theme styles
  const themeStyles: React.CSSProperties = {
    backgroundColor: theme?.backgroundColor || '#f5f5f5',
    backgroundImage: theme?.backgroundImage,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    fontFamily: theme?.fontFamily,
  };

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
      style={themeStyles}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          bgcolor: theme?.primaryColor || 'primary.main',
          color: 'white',
          boxShadow: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography variant="h6" fontWeight={600}>
          {threadTitle}
        </Typography>

        {/* Theme Refresh Button */}
        {onThemeRefresh && (
          <Tooltip title="Refresh Theme">
            <IconButton
              size="small"
              onClick={onThemeRefresh}
              disabled={isLoadingTheme}
              sx={{ color: 'white' }}
            >
              {isLoadingTheme ? (
                <CircularProgress size={20} color="inherit" />
              ) : (
                <RefreshIcon />
              )}
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Messages Area */}
      <Box
        ref={scrollRef}
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {isLoading && messages.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
            }}
          >
            <CircularProgress />
          </Box>
        ) : messages.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
              textAlign: 'center',
            }}
          >
            <Typography variant="body1" color="text.secondary">
              No messages yet. Start a conversation!
            </Typography>
          </Box>
        ) : (
          messages.map((message) => (
            <DynamicMessageRenderer
              key={message.id}
              message={message}
              onWidgetSubmit={onWidgetSubmit}
            />
          ))
        )}
      </Box>

      {/* Scroll to Bottom FAB */}
      {!isNearBottom && (
        <Fab
          size="small"
          color="primary"
          onClick={() => scrollToBottom(true)}
          sx={{
            position: 'absolute',
            bottom: 90,
            right: 20,
            boxShadow: 4,
          }}
        >
          <ScrollDownIcon />
        </Fab>
      )}

      {/* Input Area */}
      <Box
        sx={{
          p: 2,
          bgcolor: 'background.paper',
          borderTop: 1,
          borderColor: 'divider',
          display: 'flex',
          gap: 1,
        }}
      >
        <TextField
          fullWidth
          multiline
          maxRows={4}
          placeholder="Type your message..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          variant="outlined"
          size="small"
        />
        <IconButton
          color="primary"
          onClick={handleSend}
          disabled={!inputText.trim()}
          sx={{
            bgcolor: 'primary.main',
            color: 'white',
            '&:hover': {
              bgcolor: 'primary.dark',
            },
            '&:disabled': {
              bgcolor: 'action.disabledBackground',
            },
          }}
        >
          <SendIcon />
        </IconButton>
      </Box>
    </Box>
  );
}
