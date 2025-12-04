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

import { CruseMessage, WidgetAgentResponse } from '../../types/cruse';
import { prepareMessagesForAgent } from './messageParser';

/**
 * Creates a WebSocket connection to cruse_widget_agent.
 * Uses the same pattern as TabbedChatPanel: /api/v1/ws/chat/{targetNetwork}/{sessionId}
 *
 * @param wsUrl - WebSocket base URL (from useApiPort)
 * @param sessionId - Session ID (from useChatContext)
 * @returns WebSocket connection or null if failed
 */
export function createWidgetAgentConnection(
  wsUrl: string,
  sessionId: string
): WebSocket | null {
  try {
    const widgetAgentWsUrl = `${wsUrl}/api/v1/ws/chat/cruse_widget_agent/${sessionId}`;
    console.log('[Widget Agent] Connecting:', widgetAgentWsUrl);

    const ws = new WebSocket(widgetAgentWsUrl);

    ws.onopen = () => {
      console.log('[Widget Agent] WebSocket Connected');
    };

    ws.onerror = (error) => {
      console.error('[Widget Agent] WebSocket Error:', error);
    };

    ws.onclose = () => {
      console.log('[Widget Agent] WebSocket Disconnected');
    };

    return ws;
  } catch (error) {
    console.error('[Widget Agent] Failed to create connection:', error);
    return null;
  }
}

/**
 * Sends messages to cruse_widget_agent and receives widget definition.
 *
 * This is a middleman agent that analyzes the conversation and determines
 * if a dynamic widget should be displayed.
 *
 * @param messages - Last N messages from conversation
 * @param ws - WebSocket connection to cruse_widget_agent
 * @param timeoutMs - Timeout in milliseconds (default 5000)
 * @returns Promise with widget agent response
 */
export async function requestWidgetFromAgent(
  messages: CruseMessage[],
  ws: WebSocket | null,
  timeoutMs = 5000
): Promise<WidgetAgentResponse> {
  // Failsafe: if agent not available, return empty response
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn('[Widget Agent] WebSocket not available, skipping widget generation');
    return { display: false };
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.warn('[Widget Agent] Request timed out');
      resolve({ display: false });
    }, timeoutMs);

    // Listen for response
    const handleMessage = (event: MessageEvent) => {
      try {
        clearTimeout(timeout);
        const data = JSON.parse(event.data);

        // Expected format: { message: { type: "AI", text: {...widget json...} } }
        if (data.message && typeof data.message === 'object') {
          const responseText = data.message.text;

          // Parse widget JSON from response
          let widgetResponse: WidgetAgentResponse;
          if (typeof responseText === 'string') {
            widgetResponse = JSON.parse(responseText);
          } else {
            widgetResponse = responseText;
          }

          ws.removeEventListener('message', handleMessage);
          resolve(widgetResponse);
        } else {
          ws.removeEventListener('message', handleMessage);
          resolve({ display: false });
        }
      } catch (error) {
        console.error('[Widget Agent] Failed to parse response:', error);
        ws.removeEventListener('message', handleMessage);
        resolve({ display: false });
      }
    };

    ws.addEventListener('message', handleMessage);

    // Send request with last N messages
    const simplifiedMessages = prepareMessagesForAgent(messages);
    const request = {
      type: 'HUMAN',
      text: JSON.stringify({
        messages: simplifiedMessages,
        request: 'generate_widget',
      }),
    };

    try {
      ws.send(JSON.stringify(request));
      console.log('[Widget Agent] Request sent with', messages.length, 'messages');
    } catch (error) {
      clearTimeout(timeout);
      console.error('[Widget Agent] Failed to send request:', error);
      ws.removeEventListener('message', handleMessage);
      resolve({ display: false });
    }
  });
}

/**
 * Gets the recommended number of messages to send to widget agent.
 * Based on context window and conversation length.
 *
 * @param totalMessages - Total messages in conversation
 * @returns Number of messages to send
 */
export function getWidgetAgentMessageCount(totalMessages: number): number {
  // Send last 10 messages or all if fewer
  const MAX_MESSAGES = 10;
  return Math.min(totalMessages, MAX_MESSAGES);
}
