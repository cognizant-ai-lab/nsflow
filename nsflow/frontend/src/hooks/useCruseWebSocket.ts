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

import { useEffect, useRef, useState, useCallback } from 'react';
import { useApiPort } from '../context/ApiPortContext';
import { useChatContext } from '../context/ChatContext';
import type { CruseThread, MessageOrigin, CruseMessage, WidgetCardDefinition } from '../types/cruse';

export interface UseCruseWebSocketProps {
  /** Current active thread */
  currentThread: CruseThread | null;
  /** All messages in current thread (for widget agent context) */
  messages: CruseMessage[];
  /** Callback to add message to thread */
  onMessageReceived: (
    threadId: string,
    sender: 'AI' | 'HUMAN',
    text: string,
    origin: MessageOrigin[],
    widget?: WidgetCardDefinition
  ) => Promise<void>;
}

interface WidgetAgentResponse {
  display?: boolean;
  widget?: WidgetCardDefinition;
}

// Widget cache per activeNetwork + sessionId
const widgetCache = new Map<string, string>();

/**
 * Helper function to request widget from cruse_widget_agent.
 *
 * Widget Agent Middleware
 * - Sends conversation_context (formatted string with AI/HUMAN tags)
 * - Sends user_intent (last HUMAN message)
 * - Sends previous_widget (cached widget from previous interaction)
 * - Waits for widget response
 * - Parses with failsafe logic:
 *   - If `display` field is false, return undefined
 *   - If `display` field is missing but widget schema exists, default to true (return widget)
 *   - If no valid widget schema, return undefined
 *
 * @param widgetWs - Widget agent WebSocket connection
 * @param messages - Conversation history for context
 * @param latestMessage - Latest message from main agent
 * @param activeNetwork - Current active agent
 * @param sessionId - Current session ID
 * @returns Promise<WidgetCardDefinition | undefined>
 */
async function requestWidgetFromAgent(
  widgetWs: WebSocket,
  messages: CruseMessage[],
  latestMessage: string,
  activeNetwork: string,
  sessionId: string
): Promise<WidgetCardDefinition | undefined> {
  return new Promise((resolve) => {
    // Timeout failsafe - resolve with undefined after 5 seconds
    const timeout = setTimeout(() => {
      console.warn('[CRUSE] Widget agent timeout (failsafe)');
      resolve(undefined);
    }, 5000);

    // Setup one-time message handler
    const handleMessage = (event: MessageEvent) => {
      try {
        clearTimeout(timeout);
        const data = JSON.parse(event.data) as WidgetAgentResponse;
        console.log('[CRUSE] Widget agent raw response:', data);

        // Failsafe logic:
        // 1. If display is explicitly false, don't show widget
        if (data.display === false) {
          console.log('[CRUSE] Widget display=false, skipping');
          widgetWs.removeEventListener('message', handleMessage);
          resolve(undefined);
          return;
        }

        // 2. If widget schema exists, default to showing it (display defaults to true)
        if (data.widget && data.widget.schema) {
          console.log('[CRUSE] Widget schema found, display defaulting to true');
          widgetWs.removeEventListener('message', handleMessage);

          // Cache the widget for future iterations
          const cacheKey = `${activeNetwork}:${sessionId}`;
          widgetCache.set(cacheKey, JSON.stringify(data.widget));

          resolve(data.widget);
          return;
        }

        // 3. No valid widget schema
        console.log('[CRUSE] No valid widget schema found');
        widgetWs.removeEventListener('message', handleMessage);
        resolve(undefined);
      } catch (err) {
        console.error('[CRUSE] Error parsing widget agent response (failsafe):', err);
        clearTimeout(timeout);
        widgetWs.removeEventListener('message', handleMessage);
        resolve(undefined);
      }
    };

    widgetWs.addEventListener('message', handleMessage);

    // Format conversation_context as string with proper tags
    // Include last 5 messages + current AI message
    const lastNMessages = messages.slice(-5);
    const allMessages = [
      ...lastNMessages,
      { sender: 'AI' as const, text: latestMessage, origin: [], id: 'temp', thread_id: '', created_at: new Date() },
    ];

    const conversationContext = allMessages
      .map((msg) => `[${msg.sender}]: ${msg.text}`)
      .join('\n\n');

    // Find last HUMAN message for user_intent
    const lastHumanMessage = [...allMessages].reverse().find((msg) => msg.sender === 'HUMAN');
    const userIntent = lastHumanMessage?.text || 'General conversation';

    // Get cached previous widget if available
    const cacheKey = `${activeNetwork}:${sessionId}`;
    const previousWidget = widgetCache.get(cacheKey);

    // Prepare request matching the agent's expected format
    const request = {
      conversation_context: conversationContext,
      user_intent: userIntent,
      ...(previousWidget && { previous_widget: previousWidget }),
    };

    console.log('[CRUSE] Sending widget request:', {
      conversation_context: conversationContext.substring(0, 200) + '...',
      user_intent: userIntent,
      has_previous_widget: !!previousWidget,
    });
    widgetWs.send(JSON.stringify(request));
  });
}

/**
 * Custom hook for managing CRUSE WebSocket connections.
 *
 * Manages two WebSocket connections:
 * 1. Main Agent - Communicates with the selected agent (activeNetwork)
 * 2. Widget Agent - Communicates with cruse_widget_agent
 *
 * Follows the same patterns as TabbedChatPanel.tsx for consistency.
 *
 * Widget Generation Flow
 * - Intercepts main agent responses
 * - Sends conversation context to cruse_widget_agent
 * - Parses widget response with failsafe logic
 * - Conditionally includes widget in message (default true if schema received)
 */
export function useCruseWebSocket({ currentThread, messages, onMessageReceived }: UseCruseWebSocketProps) {
  const { wsUrl } = useApiPort();
  const { sessionId, activeNetwork } = useChatContext();

  const [mainWs, setMainWs] = useState<WebSocket | null>(null);
  const [widgetWs, setWidgetWs] = useState<WebSocket | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastNetworkRef = useRef<string | null>(null);

  // Setup WebSocket connections when activeNetwork changes
  useEffect(() => {
    if (!activeNetwork || !wsUrl || !sessionId) {
      console.log('[CRUSE] Skipping WebSocket setup: missing requirements', {
        activeNetwork,
        wsUrl: !!wsUrl,
        sessionId: !!sessionId,
      });
      return;
    }

    // Skip if already connected to this network
    if (lastNetworkRef.current === activeNetwork && mainWs?.readyState === WebSocket.OPEN) {
      console.log('[CRUSE] Already connected to', activeNetwork);
      return;
    }

    // Close previous connections
    if (mainWs && mainWs.readyState === WebSocket.OPEN) {
      console.log('[CRUSE] Closing previous main WebSocket...');
      mainWs.close();
    }
    if (widgetWs && widgetWs.readyState === WebSocket.OPEN) {
      console.log('[CRUSE] Closing previous widget WebSocket...');
      widgetWs.close();
    }

    setIsConnecting(true);
    setError(null);
    lastNetworkRef.current = activeNetwork;

    // ==========================================
    // 1. Main Agent WebSocket Connection
    // ==========================================
    const mainWsUrl = `${wsUrl}/api/v1/ws/chat/${activeNetwork}/${sessionId}`;
    console.log('[CRUSE] Connecting to main agent:', mainWsUrl);
    const newMainWs = new WebSocket(mainWsUrl);

    newMainWs.onopen = () => {
      console.log('[CRUSE] Main agent connected:', activeNetwork);
      setIsConnecting(false);
      setError(null);
    };

    newMainWs.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[CRUSE] Main agent message:', data);

        // Expected format from TabbedChatPanel: { message: { type: "AI", text: "..." } }
        if (data.message && typeof data.message === 'object' && data.message.type === 'AI') {
          const messageText = data.message.text;

          if (currentThread) {
            const origin: MessageOrigin[] = [
              {
                tool: activeNetwork,
                instantiation_index: 1,
              },
            ];

            // Request widget from cruse_widget_agent (middleware)
            let widgetData: WidgetCardDefinition | undefined = undefined;

            if (newWidgetWs && newWidgetWs.readyState === WebSocket.OPEN) {
              try {
                widgetData = await requestWidgetFromAgent(
                  newWidgetWs,
                  messages,
                  messageText,
                  activeNetwork,
                  sessionId
                );
                console.log('[CRUSE] Widget agent response:', widgetData);
              } catch (err) {
                console.warn('[CRUSE] Widget agent request failed (failsafe):', err);
                // Continue without widget - failsafe behavior
              }
            } else {
              console.log('[CRUSE] Widget agent not available (failsafe)');
            }

            // Add agent message to thread (with optional widget)
            await onMessageReceived(currentThread.id, 'AI', messageText, origin, widgetData);
          }
        }
      } catch (err) {
        console.error('[CRUSE] Error parsing main agent message:', err);
      }
    };

    newMainWs.onerror = (event) => {
      console.error('[CRUSE] Main agent error:', event);
      setError(`Connection error: ${activeNetwork}`);
      setIsConnecting(false);
    };

    newMainWs.onclose = (event) => {
      console.log('[CRUSE] Main agent disconnected:', event.code, event.reason);
      setIsConnecting(false);
      if (event.code !== 1000) {
        // Not a normal closure
        setError(`Disconnected from ${activeNetwork}`);
      }
    };

    setMainWs(newMainWs);

    // ==========================================
    // 2. Widget Agent WebSocket Connection
    // ==========================================
    const widgetWsUrl = `${wsUrl}/api/v1/ws/chat/cruse_widget_agent/${sessionId}`;
    console.log('[CRUSE] Connecting to widget agent:', widgetWsUrl);
    const newWidgetWs = new WebSocket(widgetWsUrl);

    newWidgetWs.onopen = () => {
      console.log('[CRUSE] Widget agent connected');
    };

    // Note: Widget agent responses are handled by requestWidgetFromAgent's one-time handler
    // No persistent onmessage handler needed here

    newWidgetWs.onerror = (event) => {
      // Widget agent is optional - don't fail if unavailable
      console.warn('[CRUSE] Widget agent error (optional service):', event);
    };

    newWidgetWs.onclose = () => {
      console.log('[CRUSE] Widget agent disconnected');
    };

    setWidgetWs(newWidgetWs);

    // Cleanup on unmount or network change
    return () => {
      console.log('[CRUSE] Cleaning up WebSocket connections');
      if (newMainWs.readyState === WebSocket.OPEN) {
        newMainWs.close();
      }
      if (newWidgetWs.readyState === WebSocket.OPEN) {
        newWidgetWs.close();
      }
    };
  }, [activeNetwork, wsUrl, sessionId, currentThread, messages, onMessageReceived]);

  /**
   * Send message to main agent.
   * Follows the pattern from TabbedChatPanel.tsx.
   */
  const sendMessage = useCallback(
    (text: string): boolean => {
      if (!mainWs) {
        console.error('[CRUSE] Cannot send message: WebSocket not initialized');
        setError('Not connected to agent');
        return false;
      }

      if (mainWs.readyState !== WebSocket.OPEN) {
        console.error('[CRUSE] Cannot send message: WebSocket not open', mainWs.readyState);
        setError('Connection not ready');
        return false;
      }

      try {
        // Message format from TabbedChatPanel.tsx
        const message = {
          type: 'HUMAN',
          text,
        };

        mainWs.send(JSON.stringify(message));
        console.log('[CRUSE] Message sent to', activeNetwork, ':', text);
        return true;
      } catch (err) {
        console.error('[CRUSE] Error sending message:', err);
        setError('Failed to send message');
        return false;
      }
    },
    [mainWs, activeNetwork]
  );

  return {
    // WebSocket instances
    mainWs,
    widgetWs,

    // Connection state
    isConnecting,
    isConnected: mainWs?.readyState === WebSocket.OPEN,
    error,

    // Actions
    sendMessage,
  };
}
