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
  Chip,
  Stack,
  Paper,
  Collapse,
  alpha,
} from '@mui/material';
import {
  Send as SendIcon,
  Refresh as RefreshIcon,
  KeyboardArrowDown as ScrollDownIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
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
  /** Sample queries from agent metadata */
  sampleQueries?: string[];
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
  sampleQueries = [],
  onSendMessage,
  onWidgetSubmit,
  onThemeRefresh,
}: ChatAreaProps) {
  const [inputText, setInputText] = useState('');
  const [sampleQueriesExpanded, setSampleQueriesExpanded] = useState(true);
  const { scrollRef, scrollToBottom, isNearBottom} = useSmartAutoScroll([messages]);

  // Handle sample query click
  const handleSampleQueryClick = (query: string) => {
    onSendMessage(query);
  };

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

  // Handle widget submission with combined text input
  // When user submits a widget form, combine form data with any text in input box
  const handleWidgetSubmitWithText = (widgetData: Record<string, unknown>) => {
    // Combine widget data with text input
    const combinedData = {
      ...widgetData,
      ...(inputText.trim() && { additionalText: inputText.trim() }),
    };

    onWidgetSubmit(combinedData);
    setInputText(''); // Clear input after submission
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
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
              textAlign: 'center',
              gap: 3,
              p: 4,
            }}
          >
            <Typography variant="h6" color="text.primary" fontWeight={600}>
              Start a conversation
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {sampleQueries.length > 0
                ? 'Select a sample query below or type your own message'
                : 'Type your message below to get started'}
            </Typography>
          </Box>
        ) : (
          messages.map((message) => (
            <DynamicMessageRenderer
              key={message.id}
              message={message}
              onWidgetSubmit={handleWidgetSubmitWithText}
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
          flexDirection: 'column',
          gap: 1,
        }}
      >
        {/* Sample Queries Section - Collapsible (like ChatPanel) */}
        {sampleQueries.length > 0 && (
          <Box sx={{ position: 'relative' }}>
            <Box
              onClick={() => setSampleQueriesExpanded(!sampleQueriesExpanded)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                mb: 0,
                cursor: 'pointer',
                borderRadius: 1,
                px: 0.5,
                py: 0.2,
                '&:hover': {
                  backgroundColor: alpha(theme?.primaryColor || '#1976d2', 0.05),
                },
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: theme?.secondaryColor || 'text.secondary',
                  fontSize: '0.6rem',
                  fontWeight: 500,
                  userSelect: 'none',
                }}
              >
                Sample Queries
              </Typography>
              <Box
                sx={{
                  width: 20,
                  height: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: theme?.secondaryColor || 'text.secondary',
                }}
              >
                {sampleQueriesExpanded ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
              </Box>
            </Box>
            <Collapse in={sampleQueriesExpanded}>
              <Paper
                elevation={1}
                sx={{
                  p: 0.8,
                  backgroundColor: alpha(theme?.primaryColor || '#1976d2', 0.04),
                  border: `1px solid ${alpha(theme?.primaryColor || '#1976d2', 0.2)}`,
                  borderRadius: 1,
                  mb: 0.5
                }}
              >
                <Box
                  sx={{
                    maxHeight: 48,
                    overflowY: "auto",
                    pr: 0.5,
                    "&::-webkit-scrollbar": { width: 8, height: 8 },
                    "&::-webkit-scrollbar-thumb": {
                      backgroundColor: alpha(theme?.secondaryColor || '#666', 0.2),
                      borderRadius: 8
                    },
                    "&::-webkit-scrollbar-track": {
                      backgroundColor: alpha(theme?.backgroundColor || '#f5f5f5', 0.4)
                    }
                  }}
                >
                  <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.5} alignItems="center">
                    {sampleQueries.map((query, index) => (
                      <Chip
                        key={`${query}-${index}`}
                        size="small"
                        variant="outlined"
                        label={query}
                        onClick={() => handleSampleQueryClick(query)}
                        sx={{
                          height: 20,
                          borderRadius: "16px",
                          cursor: "pointer",
                          "& .MuiChip-label": { px: 0.75, fontSize: "0.65rem" },
                          "&:hover": {
                            backgroundColor: alpha(theme?.primaryColor || '#1976d2', 0.1),
                            borderColor: theme?.primaryColor || '#1976d2',
                          },
                          transition: "background-color 120ms ease, border-color 120ms ease"
                        }}
                        title={`Click to send: "${query}"`}
                      />
                    ))}
                  </Stack>
                </Box>
              </Paper>
            </Collapse>
          </Box>
        )}

        {/* Message Input */}
        <Box sx={{ display: 'flex', gap: 1 }}>
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
    </Box>
  );
}
