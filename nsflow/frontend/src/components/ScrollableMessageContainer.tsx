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

import React, { useRef, useEffect, useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Box, Typography, IconButton, Paper, Tooltip, alpha, Chip, Stack, Button } from "@mui/material";
import { 
  ContentCopy as CopyIcon, 
  VolumeUp as VolumeIcon,
  InsertDriveFile as FileIcon,
  PictureAsPdf as PdfIcon,
  Article as ArticleIcon,
  Close as CloseIcon,
} from "@mui/icons-material";

import { Message } from "../context/ChatContext";
import { useTheme } from "../context/ThemeContext";
import { DynamicWidgetCard } from "./cruse/DynamicWidgetCard";
import { MultiMediaCard } from "./cruse/MultiMediaCard";
import { parseMultimediaFromText } from "../utils/cruse";
import { getFeatureFlags } from "../utils/config";

type Props = {
  messages: Message[];
  copiedMessage: number | null;
  onCopy: (text: string, index: number) => void;
  onTextToSpeech?: (text: string, index: number) => void;
  renderSenderLabel?: (msg: Message) => string;
  getMessageClass?: (msg: Message) => string;
  useSpeech?: boolean;
  onWidgetSubmit?: (data: Record<string, unknown>) => void;
  isCrusePage?: boolean;
  onFileClick?: (fileData: { 
    file: File; 
    content: string; 
    isPdf?: boolean;
    previewUrl?: string
  }) => void;
  /** Callback when widget form data changes (for Send button integration) */
  onWidgetDataChange?: (data: Record<string, unknown>) => void;
};

const ScrollableMessageContainer: React.FC<Props> = ({
  messages,
  copiedMessage,
  onCopy,
  onTextToSpeech,
  useSpeech,
  onWidgetSubmit,
  isCrusePage = false,
  onFileClick,
  onWidgetDataChange,
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
  const { pluginMultiMediaCard } = getFeatureFlags();
  const useMultimediaCard = !!pluginMultiMediaCard
  const [copiedMediaUrl, setCopiedMediaUrl] = useState<string | null>(null);
  
  // State to track which file is being viewed in modal
  const [viewingFileFromMessage, setViewingFileFromMessage] = useState<{ 
    file: File; 
    content: string; 
    isPdf: boolean;
    previewUrl?: string;
  } | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handler for copying multimedia URLs
  const handleMediaCopy = (url: string) => {
    setCopiedMediaUrl(url);
    setTimeout(() => setCopiedMediaUrl(null), 2000);
  };

  // Pre-parse multimedia items for all messages to avoid re-parsing (only if feature flag is enabled)
  const messageMultimedia = useMemo(() => {
    if (!useMultimediaCard) {
      // Feature flag disabled - return empty arrays for all messages
      return messages.map(() => []);
    }
    return messages.map((msg) => {
      const messageText = typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text);
      return parseMultimediaFromText(messageText);
    });
  }, [messages, useMultimediaCard]);

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

  // Helper function to get file icon based on extension
  const getFileIcon = (filename: string) => {
    const ext = filename.toLowerCase().split('.').pop();
    switch (ext) {
      case 'pdf':
        return <PdfIcon sx={{ fontSize: 16 }} />;
      case 'md':
      case 'txt':
        return <ArticleIcon sx={{ fontSize: 16 }} />;
      default:
        return <FileIcon sx={{ fontSize: 16 }} />;
    }
  };

  // Helper function to format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <Box sx={{
      flexGrow: 1,
      overflow: 'auto',
      pr: 0.5,
      // Only apply background when NOT on Cruse page (other pages need it)
      ...(!isCrusePage && { backgroundColor: theme.palette.background.default }),
    }}>
      <Box sx={{
        p: 0.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 1
      }}>
        {(() => {
          // Find the index of the last agent message once for all messages
          const lastAgentMessageIndex = messages.map((m, i) => m.sender === 'agent' ? i : -1)
            .filter(i => i !== -1)
            .pop() ?? -1;

          return messages.map((msg, index) => {
            const colors = getMessageColors(msg.sender);
            const messageText = typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text);
            const key = msg.id ?? (msg.ts ? `${msg.sender}-${msg.ts}` : `${msg.sender}-${index}`);
            const isLatestAgentMessage = msg.sender === 'agent' && index === lastAgentMessageIndex;

            // Get pre-parsed multimedia items for this message
            const multimediaItems = messageMultimedia[index];

            // Create a set of multimedia URLs to exclude from rendering in markdown
            const multimediaUrls = new Set(multimediaItems.map(item => item.url));
            if (multimediaItems.some(item => item.originalUrl)) {
              multimediaItems.forEach(item => {
                if (item.originalUrl) multimediaUrls.add(item.originalUrl);
              });
            }

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

              {/* Attached Files Display */}
              {msg.attachedFiles && msg.attachedFiles.length > 0 && (
                <Box sx={{ mb: 1, mt: 0.5 }}>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {msg.attachedFiles.map((fileData, fileIdx) => {
                      const isPdf = fileData.file.name.toLowerCase().endsWith('.pdf');
                      
                      return (
                        <Paper
                          key={`${key}-file-${fileIdx}`}
                          elevation={0}
                          onClick={() => {
                            if (isPdf) {
                              // Use existing preview URL if available, otherwise create one
                              const existingUrl = (fileData as any).previewUrl;
                              const previewUrl = existingUrl || URL.createObjectURL(fileData.file);
                              setViewingFileFromMessage({
                                ...fileData,
                                isPdf: true,
                                previewUrl
                              });
                            } else {
                              // Open text file in modal
                              onFileClick?.(fileData);
                            }
                          }}
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.75,
                            px: 1,
                            py: 0.5,
                            backgroundColor: alpha(
                              msg.sender === 'user' 
                                ? theme.palette.primary.contrastText 
                                : theme.palette.primary.main, 
                              msg.sender === 'user' ? 0.15 : 0.08
                            ),
                            border: `1px solid ${alpha(
                              msg.sender === 'user'
                                ? theme.palette.primary.contrastText
                                : theme.palette.primary.main,
                              0.3
                            )}`,
                            borderRadius: 1,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                              backgroundColor: alpha(
                                msg.sender === 'user'
                                  ? theme.palette.primary.contrastText
                                  : theme.palette.primary.main,
                                msg.sender === 'user' ? 0.25 : 0.15
                              ),
                              boxShadow: theme.shadows[2],
                              transform: 'translateY(-1px)',
                            }
                          }}
                        >
                          <Box sx={{ 
                            display: 'flex', 
                            alignItems: 'center',
                            color: msg.sender === 'user' 
                              ? theme.palette.primary.contrastText 
                              : theme.palette.primary.main
                          }}>
                            {getFileIcon(fileData.file.name)}
                          </Box>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                            <Typography 
                              variant="body2" 
                              sx={{ 
                                fontSize: '0.75rem',
                                fontWeight: 500,
                                color: colors.color,
                                lineHeight: 1.2,
                              }}
                            >
                              {fileData.file.name}
                            </Typography>
                            <Typography 
                              variant="caption" 
                              sx={{ 
                                fontSize: '0.65rem',
                                color: alpha(colors.color, 0.7),
                                lineHeight: 1,
                              }}
                            >
                              {formatFileSize(fileData.file.size)}
                            </Typography>
                          </Box>
                        </Paper>
                      );
                    })}
                  </Stack>
                </Box>
              )}

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
                    img: ({ src, alt }) => {
                      // Only prevent duplicate rendering if feature flag enabled
                      if (useMultimediaCard && src && multimediaUrls.has(src)) {
                        // Don't render images that are being handled by MultiMediaCard
                        // Instead, show the URL as a text link
                        return (
                          <Typography
                            component="a"
                            href={src}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{
                              color: theme.palette.primary.light,
                              textDecoration: 'none',
                              fontSize: '0.875rem',
                              display: 'inline-block',
                              my: 0.5,
                              '&:hover': { textDecoration: 'underline' }
                            }}
                          >
                            {src}
                          </Typography>
                        );
                      }
                      // Render images normally (when feature flag disabled or not in multimedia list)
                      return (
                        <Box
                          component="img"
                          src={src}
                          alt={alt}
                          sx={{
                            maxWidth: '100%',
                            height: 'auto',
                            borderRadius: 1,
                            my: 1
                          }}
                        />
                      );
                    },
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

              {/* Multimedia Rendering - only if feature flag enabled */}
              {useMultimediaCard && multimediaItems.length > 0 && (
                <Box sx={{ mt: 1.5, mb: 0.5 }}>
                  {multimediaItems.map((item, idx) => (
                    <MultiMediaCard
                      key={`${key}-media-${idx}`}
                      url={item.url}
                      type={item.type}
                      isEmbed={item.isEmbed}
                      originalUrl={item.originalUrl}
                      index={idx}
                      onCopy={handleMediaCopy}
                    />
                  ))}
                </Box>
              )}

              {/* Widget Rendering (CRUSE) */}
              {msg.widget && msg.widget.schema && (
                <Box sx={{ mt: 1.5, mb: 0.5 }}>
                  <DynamicWidgetCard
                    widget={msg.widget}
                    onSubmit={(data) => {
                      console.log('[CRUSE] Widget form submitted:', data);
                      if (onWidgetSubmit) {
                        onWidgetSubmit(data);
                      }
                    }}
                    defaultExpanded={true}
                    disabled={!isLatestAgentMessage}
                    onFormDataChange={isLatestAgentMessage && onWidgetDataChange ? onWidgetDataChange : undefined}
                  />
                </Box>
              )}

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

              {/* Multimedia URL copied notification - only if feature flag enabled */}
              {useMultimediaCard && copiedMediaUrl && multimediaItems.some(item => item.url === copiedMediaUrl || item.originalUrl === copiedMediaUrl) && (
                <Paper
                  elevation={3}
                  sx={{
                    position: 'absolute',
                    bottom: 8,
                    right: 8,
                    backgroundColor: theme.palette.info.main,
                    color: 'white',
                    px: 1.5,
                    py: 0.75,
                    borderRadius: 1,
                    fontSize: '0.75rem',
                    zIndex: 1000
                  }}
                >
                  URL Copied!
                </Paper>
              )}
            </Paper>
            );
          });
        })()}
        <Box ref={messagesEndRef} />
      </Box>
      
      {/* File Viewer Modal - for PDFs clicked from messages */}
      {viewingFileFromMessage && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => {
            // Don't revoke URL - it's managed by ChatPanel
            setViewingFileFromMessage(null);
          }}
        >
          <Box
            onClick={(e) => e.stopPropagation()}
            sx={{
              width: '90%',
              maxWidth: '900px',
              height: '90vh',
              backgroundColor: theme.palette.background.paper,
              borderRadius: 2,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: 2,
                borderBottom: `1px solid ${theme.palette.divider}`,
              }}
            >
              <FileIcon sx={{ color: theme.palette.primary.main }} />
              <Typography variant="h6" sx={{ flexGrow: 1 }}>
                {viewingFileFromMessage.file.name}
              </Typography>
              <IconButton
                size="small"
                onClick={() => {
                  // Don't revoke URL - it's managed by ChatPanel
                  setViewingFileFromMessage(null);
                }}
              >
                <CloseIcon />
              </IconButton>
            </Box>
            
            {/* Content */}
            <Box sx={{ flexGrow: 1, overflow: 'hidden', p: 2 }}>
              {viewingFileFromMessage.isPdf && viewingFileFromMessage.previewUrl ? (
                <iframe
                  src={viewingFileFromMessage.previewUrl}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    borderRadius: '4px',
                  }}
                  title={`PDF Preview: ${viewingFileFromMessage.file.name}`}
                />
              ) : (
                <Box
                  sx={{
                    p: 2,
                    backgroundColor: alpha(theme.palette.background.default, 0.5),
                    borderRadius: 1,
                    height: '100%',
                    overflowY: 'auto',
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {viewingFileFromMessage.content}
                </Box>
              )}
            </Box>
            
            {/* Footer */}
            <Box sx={{ p: 2, borderTop: `1px solid ${theme.palette.divider}`, textAlign: 'right' }}>
              <Button
                variant="outlined"
                onClick={() => {
                  // Don't revoke URL - it's managed by ChatPanel
                  setViewingFileFromMessage(null);
                }}
              >
                Close
              </Button>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default ScrollableMessageContainer;
