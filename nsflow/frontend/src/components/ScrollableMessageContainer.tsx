
// Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
// All Rights Reserved.
// Issued under the Academic Public License.
//
// You can be released from the terms, and requirements of the Academic Public
// License by purchasing a commercial license.
// Purchase of a commercial license is mandatory for any use of the
// nsflow SDK Software in commercial settings.
//
// END COPYRIGHT
import React, { useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { 
  Box, 
  Typography, 
  IconButton, 
  Paper, 
  Tooltip,
  alpha,
  Chip
} from "@mui/material";
import { 
  ContentCopy as CopyIcon,
  VolumeUp as VolumeIcon
} from "@mui/icons-material";

import { Message } from "../types/chat";
import { useTheme } from "../context/ThemeContext";

// type Message = {
//   sender: "user" | "agent" | "system";
//   text: string;
//   network?: string;
// };

type Props = {
  messages: Message[];
  copiedMessage: number | null;
  onCopy: (text: string, index: number) => void;
  onTextToSpeech?: (text: string, index: number) => void;
  renderSenderLabel?: (msg: Message) => string;
  getMessageClass?: (msg: Message) => string;
  useSpeech?: boolean;
};

const ScrollableMessageContainer: React.FC<Props> = ({
  messages,
  copiedMessage,
  onCopy,
  onTextToSpeech,
  useSpeech,
  renderSenderLabel = (msg) =>
    msg.sender === "user"
      ? "User"
      : msg.sender === "agent"
      ? msg.network || "Unknown Agent"
      : "System",
  getMessageClass = (msg) =>
    `chat-msg ${
      msg.sender === "user"
        ? "chat-msg-user"
        : msg.sender === "agent"
        ? "chat-msg-agent"
        : "chat-msg-system"
    }`
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Helper function to get message colors based on sender
  const getMessageColors = (sender: string) => {
    switch (sender) {
      case "user":
        return {
          backgroundColor: theme.palette.primary.main,
          color: theme.palette.primary.contrastText,
          chipColor: theme.palette.primary.dark,
        };
      case "agent":
        return {
          backgroundColor: alpha(theme.palette.secondary.main, 0.1),
          color: theme.palette.text.primary,
          chipColor: theme.palette.secondary.main,
        };
      case "system":
        return {
          backgroundColor: alpha(theme.palette.info.main, 0.1),
          color: theme.palette.text.primary,
          chipColor: theme.palette.info.main,
        };
      default:
        return {
          backgroundColor: alpha(theme.palette.grey[500], 0.1),
          color: theme.palette.text.primary,
          chipColor: theme.palette.grey[500],
        };
    }
  };

  return (
    <Box sx={{ 
      flexGrow: 1, 
      overflow: 'auto', 
      pr: 0.5,
      backgroundColor: theme.palette.background.default
    }}>
      <Box sx={{ 
        p: 0.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 1
      }}>
        {messages.map((msg, index) => {
          const colors = getMessageColors(msg.sender);
          const messageText = typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text);
          const key = msg.id ?? (msg.ts ? `${msg.sender}-${msg.ts}` : `${msg.sender}-${index}`);
          
          return (
            <Paper
              key={key}
              elevation={1}
              data-msg-class={getMessageClass(msg)}
              sx={{
                p: 0.5,
                pb: 0,
                backgroundColor: colors.backgroundColor,
                color: colors.color,
                maxWidth: msg.sender === "user" ? "75%" : "90%",
                alignSelf: msg.sender === "user" ? "flex-end" : "flex-start",
                position: 'relative',
                border: `1px solid ${alpha(colors.chipColor, 0.2)}`,
                transition: 'all 0.2s ease',
                '&:hover': {
                  boxShadow: theme.shadows[2],
                }
              }}
            >
              {/* Compact Header with sender and actions */}
              <Box sx={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                mb: 0,
                minHeight: '20px'
              }}>
                <Chip
                  label={renderSenderLabel(msg)}
                  size="small"
                  sx={{
                    backgroundColor: colors.chipColor,
                    color: 'white',
                    fontWeight: 500,
                    fontSize: '0.65rem',
                    height: '20px',
                    '& .MuiChip-label': {
                      px: 0.75,
                      py: 0
                    }
                  }}
                />
                
                <Box sx={{ display: 'flex', gap: 0.25 }}>
                  {useSpeech && onTextToSpeech && (
                    <Tooltip title="Text to speech">
                      <IconButton
                        size="small"
                        onClick={() => onTextToSpeech(messageText, index)}
                        sx={{ 
                          color: colors.color,
                          opacity: 0.6,
                          p: 0.25,
                          '&:hover': { 
                            opacity: 1,
                            backgroundColor: alpha(colors.chipColor, 0.1)
                          }
                        }}
                      >
                        <VolumeIcon sx={{ fontSize: '0.875rem' }} />
                      </IconButton>
                    </Tooltip>
                  )}
                  
                  <Tooltip title="Copy to clipboard">
                    <IconButton
                      size="small"
                      onClick={() => onCopy(messageText, index)}
                      sx={{ 
                        color: colors.color,
                        opacity: 0.6,
                        p: 0.25,
                        '&:hover': { 
                          opacity: 1,
                          backgroundColor: alpha(colors.chipColor, 0.1)
                        }
                      }}
                    >
                      <CopyIcon sx={{ fontSize: '0.875rem' }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>

              {/* Message Content */}
              <Box sx={{ color: colors.color }}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkBreaks]}
                  components={{
                    h1: ({ children }) => (
                      <Typography variant="h4" sx={{ mt: 2, mb: 1, fontWeight: 'bold', color: colors.color }}>
                        {children}
                      </Typography>
                    ),
                    h2: ({ children }) => (
                      <Typography variant="h5" sx={{ mt: 1.5, mb: 1, fontWeight: 600, color: colors.color }}>
                        {children}
                      </Typography>
                    ),
                    h3: ({ children }) => (
                      <Typography variant="h6" sx={{ mt: 1, mb: 0.5, fontWeight: 600, color: colors.color }}>
                        {children}
                      </Typography>
                    ),
                    ul: ({ children }) => (
                      <Box component="ul" sx={{ pl: 3, color: colors.color, listStyleType: 'disc' }}>
                        {children}
                      </Box>
                    ),
                    ol: ({ children }) => (
                      <Box component="ol" sx={{ pl: 3, color: colors.color, listStyleType: 'decimal' }}>
                        {children}
                      </Box>
                    ),
                    li: ({ children }) => (
                      <Typography component="li" sx={{ mb: 0.5, color: colors.color }}>
                        {children}
                      </Typography>
                    ),
                    p: ({ children }) => (
                      <Typography variant="body2" sx={{ mb: 1, lineHeight: 1.6, color: colors.color }}>
                        {children}
                      </Typography>
                    ),
                    strong: ({ children }) => (
                      <Typography component="strong" sx={{ fontWeight: 'bold', color: colors.color }}>
                        {children}
                      </Typography>
                    ),
                    em: ({ children }) => (
                      <Typography component="em" sx={{ fontStyle: 'italic', color: colors.color, opacity: 0.9 }}>
                        {children}
                      </Typography>
                    ),
                    a: ({ children, href }) => (
                      <Typography
                        component="a"
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{
                          color: theme.palette.primary.light,
                          textDecoration: 'none',
                          '&:hover': { textDecoration: 'underline' }
                        }}
                      >
                        {children}
                      </Typography>
                    ),
                    blockquote: ({ children }) => (
                      <Box
                        sx={{
                          borderLeft: `4px solid ${alpha(colors.chipColor, 0.5)}`,
                          pl: 2,
                          py: 1,
                          fontStyle: 'italic',
                          backgroundColor: alpha(colors.chipColor, 0.05),
                          borderRadius: '0 4px 4px 0',
                          color: colors.color
                        }}
                      >
                        {children}
                      </Box>
                    ),
                    pre: ({ children }) => (
                      <Box
                        component="pre"
                        sx={{
                          backgroundColor: alpha(theme.palette.common.black, 0.1),
                          color: theme.palette.text.primary,
                          p: 2,
                          borderRadius: 1,
                          overflow: 'auto',
                          fontSize: '0.875rem',
                          fontFamily: 'monospace',
                          border: `1px solid ${theme.palette.divider}`
                        }}
                      >
                        {children}
                      </Box>
                    ),
                    code: ({ className = "", children, ...props }) => {
                      const isBlock = className.includes("language-");
                      const codeContent = String(children).trim();

                      if (isBlock) {
                        return (
                          <Box sx={{ position: 'relative', my: 1 }}>
                            <Box
                              component="pre"
                              sx={{
                                backgroundColor: alpha(theme.palette.common.black, 0.1),
                                color: theme.palette.text.primary,
                                p: 2,
                                borderRadius: 1,
                                overflow: 'auto',
                                fontSize: '0.875rem',
                                fontFamily: 'monospace',
                                border: `1px solid ${theme.palette.divider}`
                              }}
                            >
                              <code className={className} {...props}>
                                {codeContent}
                              </code>
                            </Box>
                            
                            <Tooltip title="Copy code">
                              <IconButton
                                size="small"
                                onClick={() => onCopy(codeContent, index)}
                                sx={{
                                  position: 'absolute',
                                  top: 8,
                                  right: 8,
                                  backgroundColor: alpha(theme.palette.background.paper, 0.8),
                                  color: theme.palette.text.secondary,
                                  '&:hover': {
                                    backgroundColor: theme.palette.background.paper,
                                    color: theme.palette.text.primary
                                  }
                                }}
                              >
                                <CopyIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        );
                      }

                      return (
                        <Typography
                          component="code"
                          sx={{
                            backgroundColor: alpha(colors.chipColor, 0.1),
                            color: colors.color,
                            px: 0.5,
                            py: 0.25,
                            borderRadius: 0.5,
                            fontSize: '0.875rem',
                            fontFamily: 'monospace'
                          }}
                        >
                          {codeContent}
                        </Typography>
                      );
                    },
                  }}
                >
                  {messageText}
                </ReactMarkdown>
              </Box>

              {/* Copied notification */}
              {copiedMessage === index && (
                <Paper
                  elevation={3}
                  sx={{
                    position: 'absolute',
                    top: 8,
                    right: 60,
                    backgroundColor: theme.palette.success.main,
                    color: 'white',
                    px: 1,
                    py: 0.5,
                    borderRadius: 1,
                    fontSize: '0.75rem',
                    zIndex: 1000
                  }}
                >
                  Copied!
                </Paper>
              )}
            </Paper>
          );
        })}
        <Box ref={messagesEndRef} />
      </Box>
    </Box>
  );
};

export default ScrollableMessageContainer;
