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

import { useState, useRef, useEffect } from "react";
import {
  Box,
  Typography,
  IconButton,
  Paper,
  Tooltip,
  TextField,
  Button,
  alpha,
  Chip,
  Stack,
  Collapse,
  Fade,
} from "@mui/material";
import {
  Send as SendIcon,
  Delete as DeleteIcon,
  StopCircle as StopIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Mic as MicIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
} from "@mui/icons-material";
import { useChatContext } from "../context/ChatContext";
import { useChatControls } from "../hooks/useChatControls";
import { useZenMode } from "../hooks/useZenMode";
import { useTheme } from "../context/ThemeContext";
import { getFeatureFlags } from "../utils/config";
import ScrollableMessageContainer from "./ScrollableMessageContainer";
import { useTextToSpeech as useTextToSpeechHook } from "../hooks/useTextToSpeech";
import { useSpeechToText as useSpeechToTextHook } from "../hooks/useSpeechToText";
import { useSampleQueries } from "../hooks/useSampleQueries";

const ZenModeChat = () => {
  const { theme } = useTheme();
  const { config } = useZenMode();
  const { viteUseSpeech } = getFeatureFlags();
  const enableSpeechToText = config.features.showSpeechToText && !!viteUseSpeech;
  const enableTextToSpeech = config.features.showTextToSpeech && !!viteUseSpeech;

  const {
    activeNetwork,
    chatMessages,
    addChatMessage,
    chatWs,
  } = useChatContext();

  const { stopWebSocket, clearChat } = useChatControls();
  const { textToSpeech, audioRef } = useTextToSpeechHook();
  const { isRecording, isProcessing, startRecording, stopRecording, processRecording } = useSpeechToTextHook();
  const sampleQueries = useSampleQueries(activeNetwork);

  const [newMessage, setNewMessage] = useState("");
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null);
  const [sampleQueriesExpanded, setSampleQueriesExpanded] = useState(true);
  const [shouldAutoPlayNextAgent, setShouldAutoPlayNextAgent] = useState(false);
  const [chatZoomLevel, setChatZoomLevel] = useState(1);
  const lastMessageCountRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Chat zoom controls
  const chatZoomIn = () => {
    setChatZoomLevel((prev) => Math.min(prev + 0.1, 2)); // Max 200%
  };

  const chatZoomOut = () => {
    setChatZoomLevel((prev) => Math.max(prev - 0.1, 0.5)); // Min 50%
  };

  const chatZoomReset = () => {
    setChatZoomLevel(1);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Auto-play agent responses when microphone was used
  useEffect(() => {
    if (shouldAutoPlayNextAgent && chatMessages.length > 0) {
      const currentMessageCount = chatMessages.length;
      const previousMessageCount = lastMessageCountRef.current;

      if (currentMessageCount > previousMessageCount) {
        const lastMessage = chatMessages[chatMessages.length - 1];
        if (lastMessage.sender === "agent") {
          setShouldAutoPlayNextAgent(false);
          lastMessageCountRef.current = currentMessageCount;
          const messageToPlay =
            typeof lastMessage.text === "string"
              ? lastMessage.text
              : JSON.stringify(lastMessage.text);
          setTimeout(() => {
            textToSpeech(messageToPlay);
          }, 100);
        } else {
          lastMessageCountRef.current = currentMessageCount;
        }
      }
    } else {
      lastMessageCountRef.current = chatMessages.length;
    }
  }, [chatMessages, shouldAutoPlayNextAgent, textToSpeech]);

  const sendMessage = () => {
    if (!newMessage.trim()) return;
    setShouldAutoPlayNextAgent(false);
    sendMessageWithText(newMessage);
  };

  const sendMessageWithText = (messageText: string) => {
    if (!messageText.trim()) return;
    if (!chatWs || chatWs.readyState !== WebSocket.OPEN) {
      console.error("WebSocket not connected.");
      return;
    }

    addChatMessage({
      sender: "user",
      text: messageText,
      network: activeNetwork,
    });

    chatWs.send(JSON.stringify({ message: messageText }));
    setNewMessage("");
    setSampleQueriesExpanded(false);
  };

  const handleSampleQueryClick = (query: string) => {
    setShouldAutoPlayNextAgent(false);
    sendMessageWithText(query);
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMessage(index);
      setTimeout(() => setCopiedMessage(null), 1000);
    });
  };

  const handleStopRecording = async () => {
    stopRecording();
    try {
      const transcribedText = await processRecording();
      if (transcribedText) {
        setNewMessage(transcribedText);
        setShouldAutoPlayNextAgent(true);
        setTimeout(() => sendMessageWithText(transcribedText), 1000);
      }
    } catch (error) {
      console.error("Error processing recording:", error);
      alert("Speech-to-text failed.");
    }
  };

  return (
    <Paper
      elevation={0}
      sx={{
        height: "100%",
        backgroundColor: 'transparent',
        display: "flex",
        flexDirection: "column",
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          px: 2,
          py: 1.5,
          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
          background: alpha(theme.palette.background.paper, 0.5),
          backdropFilter: 'blur(10px)',
        }}
      >
        <Typography
          variant="h6"
          sx={{ 
            fontWeight: 600, 
            color: theme.palette.text.primary,
            fontSize: '1rem',
          }}
        >
          Conversation
        </Typography>

        <Box sx={{ display: 'flex', gap: 0.5 }}>
        {config.features.enableZoomControls && (
        <>
          {/* Chat Zoom Controls */}
          <Tooltip title="Zoom In">
            <IconButton
              size="small"
              onClick={chatZoomIn}
              disabled={chatZoomLevel >= 2}
              sx={{
                color: theme.palette.text.secondary,
                "&:hover": { backgroundColor: alpha(theme.palette.primary.main, 0.1) },
                "&.Mui-disabled": { opacity: 0.3 },
              }}
            >
              <ZoomInIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Zoom Out">
            <IconButton
              size="small"
              onClick={chatZoomOut}
              disabled={chatZoomLevel <= 0.5}
              sx={{
                color: theme.palette.text.secondary,
                "&:hover": { backgroundColor: alpha(theme.palette.primary.main, 0.1) },
                "&.Mui-disabled": { opacity: 0.3 },
              }}
            >
              <ZoomOutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
            <Tooltip title={`Reset Zoom (${Math.round(chatZoomLevel * 100)}%)`}>
              <IconButton
                size="small"
                onClick={chatZoomReset}
                sx={{
                  color: theme.palette.text.secondary,
                  "&:hover": { backgroundColor: alpha(theme.palette.primary.main, 0.1) },
                  fontSize: '0.7rem',
                  minWidth: 'auto',
                  px: 0.5,
                }}
              >
                {Math.round(chatZoomLevel * 100)}%
              </IconButton>
            </Tooltip>
            </>
          )}
          {config.features.showClearChat && (
            <Tooltip title="Clear Chat">
              <IconButton
                size="small"
                onClick={() => clearChat()}
                sx={{
                  color: theme.palette.warning.main,
                  "&:hover": { backgroundColor: alpha(theme.palette.warning.main, 0.1) },
                }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Stop">
            <IconButton
              size="small"
              onClick={() => stopWebSocket()}
              sx={{
                color: theme.palette.error.main,
                "&:hover": { backgroundColor: alpha(theme.palette.error.main, 0.1) },
              }}
            >
              <StopIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Messages */}
      <Box
        sx={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          backgroundColor: theme.palette.background.default,
        }}
      >
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            transform: `scale(${chatZoomLevel})`,
            transformOrigin: 'top left',
            width: `${100 / chatZoomLevel}%`,
            height: `${100 / chatZoomLevel}%`,
            backgroundColor: theme.palette.background.default,
          }}
        >
          <ScrollableMessageContainer
            messages={chatMessages}
            copiedMessage={copiedMessage}
            onCopy={copyToClipboard}
            onTextToSpeech={(text) => textToSpeech(text)}
            useSpeech={enableTextToSpeech}
          />
        </Box>
      </Box>

      {/* Audio playback */}
      <Box
        sx={{
          px: 2,
          py: 0.5,
          borderTop: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
          display: "flex",
          alignItems: "center",
          background: alpha(theme.palette.background.paper, 0.3),
        }}
      >
        <audio ref={audioRef} controls style={{ flexGrow: 1, height: "28px", opacity: 0.8 }} />
      </Box>

      {/* Input Section */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderTop: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
          background: alpha(theme.palette.background.paper, 0.5),
          backdropFilter: 'blur(10px)',
        }}
      >
        {/* Sample Queries */}
        {config.features.showSampleQueries && sampleQueries.length > 0 && (
          <Fade in={true}>
            <Box sx={{ mb: 1.5 }}>
              <Box
                onClick={() => setSampleQueriesExpanded(!sampleQueriesExpanded)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  cursor: 'pointer',
                  mb: 0.5,
                  '&:hover': {
                    opacity: 0.8,
                  },
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    color: theme.palette.text.secondary,
                    fontSize: '0.7rem',
                    fontWeight: 500,
                  }}
                >
                  Quick Prompts
                </Typography>
                {sampleQueriesExpanded ? 
                  <ExpandLessIcon sx={{ fontSize: 14, color: theme.palette.text.secondary }} /> : 
                  <ExpandMoreIcon sx={{ fontSize: 14, color: theme.palette.text.secondary }} />
                }
              </Box>
              <Collapse in={sampleQueriesExpanded}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 1,
                    backgroundColor: alpha(theme.palette.primary.main, 0.05),
                    border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
                    borderRadius: 1.5,
                  }}
                >
                  <Box
                    sx={{
                      maxHeight: 60,
                      overflowY: "auto",
                      "&::-webkit-scrollbar": { width: 4 },
                      "&::-webkit-scrollbar-thumb": {
                        backgroundColor: alpha(theme.palette.text.primary, 0.2),
                        borderRadius: 4
                      },
                    }}
                  >
                    <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.5}>
                      {sampleQueries.map((query, index) => (
                        <Chip
                          key={`${query}-${index}`}
                          size="small"
                          variant="outlined"
                          label={query}
                          onClick={() => handleSampleQueryClick(query)}
                          sx={{
                            height: 24,
                            borderRadius: "12px",
                            cursor: "pointer",
                            borderColor: alpha(theme.palette.primary.main, 0.3),
                            color: theme.palette.text.secondary,
                            "& .MuiChip-label": { px: 1, fontSize: "0.7rem" },
                            "&:hover": {
                              backgroundColor: alpha(theme.palette.primary.main, 0.15),
                              borderColor: theme.palette.primary.main,
                              color: theme.palette.primary.main,
                            },
                            transition: "all 150ms ease"
                          }}
                        />
                      ))}
                    </Stack>
                  </Box>
                </Paper>
              </Collapse>
            </Box>
          </Fade>
        )}

        {/* Message Input */}
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-end" }}>
          <TextField
            multiline
            minRows={2}
            maxRows={4}
            placeholder="Type your message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            sx={{
              flexGrow: 1,
              "& .MuiOutlinedInput-root": {
                backgroundColor: alpha(theme.palette.background.paper, 0.8),
                color: theme.palette.text.primary,
                borderRadius: 2,
                "&:hover .MuiOutlinedInput-notchedOutline": {
                  borderColor: theme.palette.primary.main,
                },
                "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                  borderColor: theme.palette.primary.main,
                  borderWidth: 2,
                },
              },
              "& .MuiOutlinedInput-notchedOutline": {
                borderColor: alpha(theme.palette.divider, 0.3),
              },
            }}
          />
          
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5 }}>
            {enableSpeechToText && (
              <Tooltip
                title={
                  isProcessing ? "Processing..." : isRecording ? "Recording..." : "Hold to record"
                }
              >
                <span>
                  <IconButton
                    size="small"
                    onMouseDown={startRecording}
                    onMouseUp={handleStopRecording}
                    onMouseLeave={handleStopRecording}
                    onTouchStart={startRecording}
                    onTouchEnd={handleStopRecording}
                    disabled={isProcessing}
                    sx={{
                      width: 36,
                      height: 36,
                      color: isProcessing
                        ? theme.palette.info.main
                        : isRecording
                        ? theme.palette.error.main
                        : theme.palette.primary.main,
                      borderRadius: 999,
                      border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
                      "&:hover": {
                        backgroundColor: alpha(theme.palette.primary.main, 0.1),
                      },
                    }}
                  >
                    <MicIcon
                      sx={{
                        fontSize: 20,
                        animation: isRecording ? "pulse 1s ease-in-out infinite" : "none",
                        "@keyframes pulse": {
                          "0%, 100%": { opacity: 1 },
                          "50%": { opacity: 0.5 },
                        },
                      }}
                    />
                  </IconButton>
                </span>
              </Tooltip>
            )}

            <Button
              variant="contained"
              onClick={sendMessage}
              disabled={!newMessage.trim()}
              sx={{
                backgroundColor: theme.palette.primary.main,
                "&:hover": { backgroundColor: theme.palette.primary.dark },
                "&.Mui-disabled": {
                  backgroundColor: alpha(theme.palette.primary.main, 0.3),
                },
                minWidth: 90,
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
              }}
              startIcon={<SendIcon />}
            >
              Send
            </Button>
          </Box>
        </Box>
      </Box>
    </Paper>
  );
};

export default ZenModeChat;
