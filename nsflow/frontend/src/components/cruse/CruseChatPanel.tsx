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

import { useState, useEffect, useRef, useCallback } from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Chip,
  Stack,
  Collapse,
  alpha,
} from "@mui/material";
import {
  Send as SendIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from "@mui/icons-material";
import { useApiPort } from "../../context/ApiPortContext";
import { useChatContext } from "../../context/ChatContext";
import { useTheme } from "../../context/ThemeContext";
import ScrollableMessageContainer from "../ScrollableMessageContainer";
import type { MessageOrigin, CruseThread } from "../../types/cruse";

interface CruseChatPanelProps {
  currentThread: CruseThread | null;
  onSaveMessage: (messageRequest: any) => Promise<void>;
}

/**
 * Extracts JSON from markdown code blocks or parses directly
 * Handles formats like:
 * - ```json\n{...}\n```
 * - ```\n{...}\n```
 * - Plain JSON string
 * - Already parsed object
 */
function parseWidgetResponse(response: any): any {
  // Already an object with schema
  if (typeof response === 'object' && response !== null && response.schema) {
    return response;
  }

  // String - try to extract from markdown code block
  if (typeof response === 'string') {
    // Remove markdown code block syntax
    let jsonStr = response.trim();

    // Match ```json ... ``` or ``` ... ```
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    // Try to parse as JSON
    try {
      const parsed = JSON.parse(jsonStr);
      return parsed;
    } catch (e) {
      console.error('[CRUSE] Failed to parse widget JSON:', e);
      return null;
    }
  }

  return response;
}

const CruseChatPanel: React.FC<CruseChatPanelProps> = ({ currentThread, onSaveMessage }) => {
  const { apiUrl } = useApiPort();
  const { theme } = useTheme();
  const {
    activeNetwork,
    chatMessages,
    addChatMessage,
    chatWs,
    setChatMessages,
  } = useChatContext();

  // Component mount logging
  useEffect(() => {
    console.log('[CRUSE] CruseChatPanel mounted');
    return () => console.log('[CRUSE] CruseChatPanel unmounted');
  }, []);

  // Log chatMessages changes
  useEffect(() => {
    console.log('[CRUSE] chatMessages changed. Count:', chatMessages.length, 'Messages:', chatMessages);
  }, [chatMessages]);

  const [newMessage, setNewMessage] = useState("");
  const [sampleQueries, setSampleQueries] = useState<string[]>([]);
  const [sampleQueriesExpanded, setSampleQueriesExpanded] = useState(true);
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch sample queries when activeNetwork changes
  useEffect(() => {
    const fetchSampleQueries = async () => {
      if (!activeNetwork || !apiUrl) {
        setSampleQueries([]);
        return;
      }

      try {
        const response = await fetch(`${apiUrl}/api/v1/connectivity/${activeNetwork}`);
        if (!response.ok) {
          console.log('[CRUSE] Failed to fetch connectivity info');
          setSampleQueries(['What can you help me with?']);
          return;
        }

        const data = await response.json();
        const queries = data?.metadata?.sample_queries || [];
        const allQueries = [...queries, 'What can you help me with?'];
        setSampleQueries(allQueries);
      } catch (error) {
        console.log('[CRUSE] Error fetching sample queries:', error);
        setSampleQueries(['What can you help me with?']);
      }
    };

    fetchSampleQueries();
  }, [activeNetwork, apiUrl]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Send message function
  const sendMessage = useCallback(() => {
    if (!newMessage.trim() || !chatWs) return;

    try {
      // Add user message to UI
      addChatMessage({
        sender: "user",
        text: newMessage,
        network: activeNetwork,
      });

      // Send to WebSocket (main agent only)
      const message = { message: newMessage };
      chatWs.send(JSON.stringify(message));
      console.log('[CRUSE] Message sent to main agent:', newMessage);

      setNewMessage("");
    } catch (error) {
      console.error('[CRUSE] Error sending message:', error);
    }
  }, [newMessage, chatWs, addChatMessage, activeNetwork]);

  const handleSampleQueryClick = (query: string) => {
    setNewMessage(query);
    // Auto-send the query
    setTimeout(() => sendMessage(), 100);
  };

  // Track the last processed AI message count to avoid reprocessing DB-loaded messages
  const lastProcessedCountRef = useRef<number>(0);

  // Reset when thread changes
  useEffect(() => {
    lastProcessedCountRef.current = 0;
  }, [currentThread?.id]);

  useEffect(() => {
    console.log('[CRUSE] useEffect triggered - chatMessages.length:', chatMessages.length, 'lastProcessed:', lastProcessedCountRef.current);

    if (!currentThread) {
      console.log('[CRUSE] No current thread, skipping');
      return;
    }

    if (chatMessages.length === 0) {
      console.log('[CRUSE] No messages, skipping');
      lastProcessedCountRef.current = 0;
      return;
    }

    // If we just loaded a thread (lastProcessed is 0 but we have messages), initialize the counter
    // This happens when DB messages are synced to ChatContext
    if (lastProcessedCountRef.current === 0 && chatMessages.length > 0) {
      console.log('[CRUSE] Initializing counter for DB-loaded messages:', chatMessages.length);
      lastProcessedCountRef.current = chatMessages.length;
      return;
    }

    // Only process if we have NEW messages (not DB-loaded ones)
    if (chatMessages.length <= lastProcessedCountRef.current) {
      console.log('[CRUSE] No new messages to process (already processed)');
      return;
    }

    const lastMessage = chatMessages[chatMessages.length - 1];
    console.log('[CRUSE] Last message:', { sender: lastMessage.sender, text: typeof lastMessage.text === 'string' ? lastMessage.text.substring(0, 50) : lastMessage.text });

    // Only process AI messages
    if (lastMessage.sender !== 'agent') {
      console.log('[CRUSE] Last message not from agent, skipping. Sender:', lastMessage.sender);
      lastProcessedCountRef.current = chatMessages.length; // Mark as processed
      return;
    }

    console.log('[CRUSE] ✓ New AI message detected, will process widget and save to DB');

    // Request widget and save to DB
    const requestWidgetAndSave = async () => {
      let widgetData: any = undefined;

      try {
        // Get last 5 messages from chatMessages (includes the new AI message)
        const MAX_MESSAGES = 5;
        const recentMessages = chatMessages.slice(-MAX_MESSAGES);

        // Format messages for widget agent
        const formattedMessages = recentMessages.map(msg => ({
          sender: msg.sender === 'user' ? 'HUMAN' : msg.sender === 'agent' ? 'AI' : 'SYSTEM',
          text: typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text),
          origin: [{ tool: msg.network || activeNetwork || 'unknown', instantiation_index: 1 }],
        }));

        console.log('[CRUSE] Sending last', formattedMessages.length, 'messages to widget agent:', formattedMessages);

        // Use oneshot endpoint instead of WebSocket
        const payload = JSON.stringify({
          messages: formattedMessages,
          request: 'generate_widget',
        });

        console.log('[CRUSE] Sending widget request to oneshot endpoint');

        const response = await fetch(`${apiUrl}/api/v1/oneshot/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_name: 'cruse_widget_agent',
            message: payload,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          console.log('[CRUSE] Widget agent raw response:', data);

          // Parse the raw_response.message
          if (data.raw_response && data.raw_response.message) {
            // Parse widget response (handles markdown code blocks, plain JSON, etc.)
            const parsedWidget = parseWidgetResponse(data.raw_response.message);

            if (parsedWidget && parsedWidget.schema) {
              console.log('[CRUSE] Widget received:', parsedWidget);
              widgetData = parsedWidget;
            } else if (parsedWidget && parsedWidget.display === false) {
              console.log('[CRUSE] Widget agent decided not to display widget');
              widgetData = { display: false };
            } else {
              console.log('[CRUSE] No widget schema in response');
              console.log('[CRUSE] Raw message was:', data.raw_response.message);
              widgetData = { display: false };
            }
          } else {
            // No widget response at all
            widgetData = { display: false };
          }
        } else {
          console.error('[CRUSE] Widget request failed:', response.statusText);
          widgetData = { display: false };
        }
      } catch (error) {
        console.error('[CRUSE] Failed to request widget:', error);
        widgetData = { display: false };
      }

      // ALWAYS save the complete AI message to DB (with or without widget)
      try {
        const origin: MessageOrigin[] = [
          {
            tool: activeNetwork || 'unknown',
            instantiation_index: 1,
          },
        ];

        const messageToSave: any = {
          sender: 'AI',
          origin,
          text: typeof lastMessage.text === 'string' ? lastMessage.text : JSON.stringify(lastMessage.text),
        };

        // Only include widget if it has a schema (actual widget)
        // Don't save {"display": false} to DB, just omit the widget field
        if (widgetData && widgetData.schema) {
          messageToSave.widget = widgetData;
        }

        await onSaveMessage(messageToSave);

        console.log('[CRUSE] ✓ Saved AI message to DB', widgetData && widgetData.schema ? 'with widget' : 'without widget');

        // Update the message in ChatContext to include the widget for display
        if (widgetData && widgetData.schema) {
          console.log('[CRUSE] Updating ChatContext message with widget');
          const updatedMessages = chatMessages.map((msg, idx) => {
            if (idx === chatMessages.length - 1 && msg.sender === 'agent') {
              return { ...msg, widget: widgetData };
            }
            return msg;
          });
          setChatMessages(updatedMessages);
        }

        // Mark this message count as processed
        lastProcessedCountRef.current = chatMessages.length;
      } catch (error) {
        console.error('[CRUSE] ✗ Failed to save AI message to DB:', error);
        // Still mark as processed even on error to avoid retry loops
        lastProcessedCountRef.current = chatMessages.length;
      }
    };

    requestWidgetAndSave();
  }, [chatMessages.length]); // Only trigger when new chat messages arrive (not when DB updates)

  // TODO: Add one-time theme agent call on agent selection

  return (
    <PanelGroup direction="vertical">
      {/* Panel 1: Messages */}
      <Panel defaultSize={72} minSize={50}>
        <Box
          sx={{
            height: "100%",
            overflowY: "auto",
            px: 2,
            py: 1,
            backgroundColor: theme.palette.background.default,
            "&::-webkit-scrollbar": { width: 8 },
            "&::-webkit-scrollbar-thumb": {
              backgroundColor: alpha(theme.palette.text.primary, 0.2),
              borderRadius: 8
            },
          }}
        >
          <ScrollableMessageContainer
            messages={chatMessages}
            copiedMessage={copiedMessage}
            onCopy={(_text, index) => {
              setCopiedMessage(index);
              setTimeout(() => setCopiedMessage(null), 2000);
            }}
          />
          <div ref={messagesEndRef} />
        </Box>
      </Panel>

      <PanelResizeHandle
        style={{
          height: "4px",
          backgroundColor: theme.palette.divider,
          cursor: "row-resize",
        }}
      />

      {/* Panel 2: Input */}
      <Panel defaultSize={28} minSize={15}>
        <Box
          sx={{
            height: "100%",
            overflowY: "auto",
            pt: 0.5,
            px: 2,
            pb: 2,
            display: "flex",
            flexDirection: "column",
            gap: 0.5,
          }}
        >
          {/* Sample Queries Section */}
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
                    backgroundColor: alpha(theme.palette.primary.main, 0.05),
                  },
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    color: theme.palette.text.secondary,
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
                    color: theme.palette.text.secondary,
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
                    backgroundColor: alpha(theme.palette.primary.main, 0.04),
                    border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
                    borderRadius: 1
                  }}
                >
                  <Box
                    sx={{
                      maxHeight: 48,
                      overflowY: "auto",
                      pr: 0.5,
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
                              backgroundColor: alpha(theme.palette.primary.main, 0.1),
                              borderColor: theme.palette.primary.main,
                            },
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

          {/* Message input */}
          <Box sx={{ display: "flex", gap: 2, alignItems: "flex-end" }}>
            <TextField
              multiline
              minRows={2}
              placeholder="Type a message..."
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
                  backgroundColor: theme.palette.background.paper,
                  color: theme.palette.text.primary,
                },
              }}
            />
            <Button
              variant="contained"
              endIcon={<SendIcon />}
              onClick={sendMessage}
              disabled={!newMessage.trim()}
              sx={{
                minHeight: 40,
                px: 2,
              }}
            >
              Send
            </Button>
          </Box>
        </Box>
      </Panel>
    </PanelGroup>
  );
};

export default CruseChatPanel;
