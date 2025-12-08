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

import { useState, useCallback, useEffect } from 'react';
import { useApiPort } from '../context/ApiPortContext';
import { useChatContext } from '../context/ChatContext';
import { DEFAULT_THEME } from '../utils/cruse/themeAgentClient';
import type { ThemeConfig } from '../types/cruse';

interface ThemeAgentResponse {
  theme?: ThemeConfig;
}

/**
 * Helper function to request theme from cruse_theme_agent.
 *
 * Theme Agent Integration
 * - Sends agent metadata to cruse_theme_agent
 * - Waits for theme response
 * - Parses with failsafe logic
 * - Returns theme or default on failure
 *
 * @param wsUrl - WebSocket URL
 * @param sessionId - Session ID
 * @param agentMetadata - Agent metadata object
 * @returns Promise<ThemeConfig>
 */
async function requestThemeFromAgent(
  wsUrl: string,
  sessionId: string,
  agentMetadata: any
): Promise<ThemeConfig> {
  return new Promise((resolve) => {
    // Timeout failsafe - resolve with default theme after 5 seconds
    const timeout = setTimeout(() => {
      console.warn('[CRUSE] Theme agent timeout (failsafe)');
      resolve(DEFAULT_THEME);
    }, 5000);

    // Create WebSocket connection to theme agent
    const themeWsUrl = `${wsUrl}/api/v1/ws/chat/cruse_theme_agent/${sessionId}`;
    console.log('[CRUSE] Connecting to theme agent:', themeWsUrl);

    try {
      const ws = new WebSocket(themeWsUrl);

      // Setup one-time message handler
      const handleMessage = (event: MessageEvent) => {
        try {
          clearTimeout(timeout);
          const data = JSON.parse(event.data) as ThemeAgentResponse;
          console.log('[CRUSE] Theme agent response:', data);

          if (data.theme) {
            console.log('[CRUSE] Theme received, applying');
            ws.close();
            resolve(data.theme);
          } else {
            console.log('[CRUSE] No theme in response, using default');
            ws.close();
            resolve(DEFAULT_THEME);
          }
        } catch (err) {
          console.error('[CRUSE] Error parsing theme agent response (failsafe):', err);
          clearTimeout(timeout);
          ws.close();
          resolve(DEFAULT_THEME);
        }
      };

      ws.onopen = () => {
        console.log('[CRUSE] Theme agent connected');

        // Prepare request matching the agent's expected format
        const request = {
          agent: agentMetadata,
          request: 'generate_theme',
        };

        console.log('[CRUSE] Sending theme request:', request);
        ws.send(JSON.stringify(request));
      };

      ws.onmessage = handleMessage;

      ws.onerror = (error) => {
        console.warn('[CRUSE] Theme agent error (failsafe):', error);
        clearTimeout(timeout);
        resolve(DEFAULT_THEME);
      };

      ws.onclose = () => {
        console.log('[CRUSE] Theme agent disconnected');
      };
    } catch (err) {
      console.error('[CRUSE] Failed to create theme agent connection (failsafe):', err);
      clearTimeout(timeout);
      resolve(DEFAULT_THEME);
    }
  });
}

/**
 * Custom hook for CRUSE dynamic theme management.
 *
 * Integrates with cruse_theme_agent to provide context-aware themes
 * based on selected agent metadata. Fetches agent metadata and sends to theme agent
 * for dynamic theme generation. Supports manual theme refresh and graceful fallback.
 *
 * @param agentName - Name of the selected agent for context-aware theming
 * @param autoFetchOnMount - Whether to fetch theme automatically on mount (default: true)
 * @returns Object with theme, loading state, and refresh function
 */
export function useCruseTheme(agentName?: string, autoFetchOnMount = true) {
  const { wsUrl, apiUrl } = useApiPort();
  const { sessionId } = useChatContext();

  const [theme, setTheme] = useState<ThemeConfig>(DEFAULT_THEME);
  const [isLoadingTheme, setIsLoadingTheme] = useState(false);
  const [themeError, setThemeError] = useState<string | null>(null);

  // Fetch theme from theme agent
  const fetchTheme = useCallback(async () => {
    if (!agentName || !wsUrl || !sessionId || !apiUrl) {
      console.log('[CRUSE] Theme fetch skipped: missing requirements', {
        agentName: !!agentName,
        wsUrl: !!wsUrl,
        sessionId: !!sessionId,
        apiUrl: !!apiUrl,
      });
      setTheme(DEFAULT_THEME);
      return;
    }

    setIsLoadingTheme(true);
    setThemeError(null);

    try {
      // Fetch agent metadata from connectivity endpoint
      console.log('[CRUSE] Fetching agent metadata for theme generation');
      const response = await fetch(`${apiUrl}/api/v1/connectivity/${agentName}`);

      let agentMetadata: any = {
        name: agentName,
        description: 'CRUSE Agent',
        tags: [],
      };

      if (response.ok) {
        const data = await response.json();
        agentMetadata = {
          name: agentName,
          description: data?.metadata?.description || agentName,
          tags: data?.metadata?.tags || [],
          ...data?.metadata, // Include any additional metadata
        };
        console.log('[CRUSE] Agent metadata loaded:', agentMetadata);
      } else {
        console.warn('[CRUSE] Failed to fetch agent metadata, using minimal data');
      }

      // Request theme from cruse_theme_agent
      const themeConfig = await requestThemeFromAgent(wsUrl, sessionId, agentMetadata);
      setTheme(themeConfig);
      console.log('[CRUSE] Theme applied:', themeConfig);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch theme from agent';
      setThemeError(message);
      console.warn('[CRUSE] Theme fetch failed, using default theme:', err);

      // Fallback to default theme
      setTheme(DEFAULT_THEME);
    } finally {
      setIsLoadingTheme(false);
    }
  }, [agentName, wsUrl, sessionId, apiUrl]);

  // Refresh theme (manual trigger)
  const refreshTheme = useCallback(() => {
    fetchTheme();
  }, [fetchTheme]);

  // Auto-fetch theme on mount or when agent changes
  useEffect(() => {
    if (autoFetchOnMount && agentName) {
      fetchTheme();
    }
  }, [agentName, autoFetchOnMount, fetchTheme]);

  // Convert theme config to CSS properties
  const getCSSProperties = useCallback((): React.CSSProperties => {
    return {
      backgroundColor: theme.backgroundColor,
      backgroundImage: theme.backgroundImage,
      fontFamily: theme.fontFamily,
      ...(theme.primaryColor && { '--primary-color': theme.primaryColor } as React.CSSProperties),
      ...(theme.secondaryColor && {
        '--secondary-color': theme.secondaryColor,
      } as React.CSSProperties),
    };
  }, [theme]);

  return {
    // State
    theme,
    isLoadingTheme,
    themeError,

    // Actions
    refreshTheme,
    getCSSProperties,
  };
}
