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

import { ThemeAgentResponse, ThemeConfig } from '../../types/cruse';

/**
 * Default theme configuration used when theme agent is not available
 * or returns an error.
 */
export const DEFAULT_THEME: ThemeConfig = {
  backgroundColor: '#1a1a1a',
  primaryColor: '#9c27b0',
  secondaryColor: '#f50057',
  fontFamily: 'Roboto, sans-serif',
};

/**
 * Creates a WebSocket connection to cruse_theme_agent.
 * Uses the same pattern as TabbedChatPanel: /api/v1/ws/chat/{targetNetwork}/{sessionId}
 *
 * @param wsUrl - WebSocket base URL (from useApiPort)
 * @param sessionId - Session ID (from useChatContext)
 * @returns WebSocket connection or null if failed
 */
export function createThemeAgentConnection(
  wsUrl: string,
  sessionId: string
): WebSocket | null {
  try {
    const themeAgentWsUrl = `${wsUrl}/api/v1/ws/chat/cruse_theme_agent/${sessionId}`;
    console.log('[Theme Agent] Connecting:', themeAgentWsUrl);

    const ws = new WebSocket(themeAgentWsUrl);

    ws.onopen = () => {
      console.log('[Theme Agent] WebSocket Connected');
    };

    ws.onerror = (error) => {
      console.error('[Theme Agent] WebSocket Error:', error);
    };

    ws.onclose = () => {
      console.log('[Theme Agent] WebSocket Disconnected');
    };

    return ws;
  } catch (error) {
    console.error('[Theme Agent] Failed to create connection:', error);
    return null;
  }
}

/**
 * Requests theme configuration from cruse_theme_agent based on active agent metadata.
 *
 * @param agentMetadata - Metadata about the currently selected agent
 * @param ws - WebSocket connection to cruse_theme_agent
 * @param timeoutMs - Timeout in milliseconds (default 5000)
 * @returns Promise with theme configuration
 */
export async function requestThemeFromAgent(
  agentMetadata: { name: string; [key: string]: unknown },
  ws: WebSocket | null,
  timeoutMs = 5000
): Promise<ThemeConfig> {
  // Failsafe: if agent not available, return default theme
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn('[Theme Agent] WebSocket not available, using default theme');
    return DEFAULT_THEME;
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.warn('[Theme Agent] Request timed out, using default theme');
      resolve(DEFAULT_THEME);
    }, timeoutMs);

    // Listen for response
    const handleMessage = (event: MessageEvent) => {
      try {
        clearTimeout(timeout);
        const data = JSON.parse(event.data);

        // Expected format: { message: { type: "AI", text: {...theme json...} } }
        if (data.message && typeof data.message === 'object') {
          const responseText = data.message.text;

          // Parse theme JSON from response
          let themeResponse: ThemeAgentResponse;
          if (typeof responseText === 'string') {
            themeResponse = JSON.parse(responseText);
          } else {
            themeResponse = responseText;
          }

          ws.removeEventListener('message', handleMessage);

          // Return theme or default if not provided
          resolve(themeResponse.theme || DEFAULT_THEME);
        } else {
          ws.removeEventListener('message', handleMessage);
          resolve(DEFAULT_THEME);
        }
      } catch (error) {
        console.error('[Theme Agent] Failed to parse response:', error);
        ws.removeEventListener('message', handleMessage);
        resolve(DEFAULT_THEME);
      }
    };

    ws.addEventListener('message', handleMessage);

    // Send request with agent metadata
    // IMPORTANT: Match TabbedChatPanel format: { message: text }
    const messageText = JSON.stringify({
      agent: agentMetadata,
      request: 'generate_theme',
    });

    const request = {
      message: messageText,  // Match TabbedChatPanel/ChatPanel format
    };

    try {
      ws.send(JSON.stringify(request));
      console.log('[Theme Agent] Request sent for agent:', agentMetadata.name);
    } catch (error) {
      clearTimeout(timeout);
      console.error('[Theme Agent] Failed to send request:', error);
      ws.removeEventListener('message', handleMessage);
      resolve(DEFAULT_THEME);
    }
  });
}

/**
 * Validates and sanitizes theme configuration.
 * Ensures all values are safe CSS values.
 *
 * @param theme - Theme configuration to validate
 * @returns Validated theme configuration
 */
export function validateThemeConfig(theme: ThemeConfig): ThemeConfig {
  const validatedTheme: ThemeConfig = { ...DEFAULT_THEME };

  // Validate colors (hex, rgb, rgba, color names)
  const colorRegex = /^(#[0-9A-Fa-f]{3,8}|rgb\(|rgba\(|[a-zA-Z]+).*$/;

  if (theme.backgroundColor && colorRegex.test(theme.backgroundColor)) {
    validatedTheme.backgroundColor = theme.backgroundColor;
  }

  if (theme.primaryColor && colorRegex.test(theme.primaryColor)) {
    validatedTheme.primaryColor = theme.primaryColor;
  }

  if (theme.secondaryColor && colorRegex.test(theme.secondaryColor)) {
    validatedTheme.secondaryColor = theme.secondaryColor;
  }

  // Validate background image (url or gradient)
  const bgImageRegex = /^(url\(|linear-gradient\(|radial-gradient\().*$/;
  if (theme.backgroundImage && bgImageRegex.test(theme.backgroundImage)) {
    validatedTheme.backgroundImage = theme.backgroundImage;
  }

  // Validate font family (allow common font names and fallbacks)
  if (theme.fontFamily && theme.fontFamily.length < 200) {
    validatedTheme.fontFamily = theme.fontFamily;
  }

  // Pass through any additional custom properties
  Object.keys(theme).forEach((key) => {
    if (
      !['backgroundColor', 'primaryColor', 'secondaryColor', 'backgroundImage', 'fontFamily'].includes(
        key
      )
    ) {
      validatedTheme[key] = theme[key];
    }
  });

  return validatedTheme;
}
