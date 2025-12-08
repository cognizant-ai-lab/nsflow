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
import {
  // TODO Phase 6: Uncomment for full theme agent integration
  // createThemeAgentConnection,
  // requestThemeFromAgent,
  DEFAULT_THEME,
} from '../utils/cruse/themeAgentClient';
import type { ThemeConfig } from '../types/cruse';

/**
 * Custom hook for CRUSE dynamic theme management.
 *
 * Integrates with cruse_theme_agent to provide context-aware themes
 * based on selected agent metadata. Supports manual theme refresh
 * and graceful fallback to default theme.
 *
 * @param agentName - Name of the selected agent for context-aware theming
 * @param autoFetchOnMount - Whether to fetch theme automatically on mount (default: true)
 * @returns Object with theme, loading state, and refresh function
 */
export function useCruseTheme(agentName?: string, autoFetchOnMount = true) {
  const [theme, setTheme] = useState<ThemeConfig>(DEFAULT_THEME);
  const [isLoadingTheme, setIsLoadingTheme] = useState(false);
  const [themeError, setThemeError] = useState<string | null>(null);

  // Fetch theme from theme agent
  const fetchTheme = useCallback(async () => {
    if (!agentName) {
      setTheme(DEFAULT_THEME);
      return;
    }

    setIsLoadingTheme(true);
    setThemeError(null);

    try {
      // TODO Phase 6: Full theme agent integration with WebSocket context
      // For now, use default theme. In Phase 6, we'll:
      // 1. Get wsUrl from useApiPort hook
      // 2. Get sessionId from useChatContext
      // 3. Call: const ws = createThemeAgentConnection(wsUrl, sessionId);
      // 4. Call: const themeConfig = await requestThemeFromAgent(agentMetadata, ws);

      // Temporary: Use default theme
      setTheme(DEFAULT_THEME);

      // Uncomment in Phase 6:
      // const ws = createThemeAgentConnection(wsUrl, sessionId);
      // const agentMetadata = { name: agentName, timestamp: new Date().toISOString() };
      // const themeConfig = await requestThemeFromAgent(agentMetadata, ws);
      // setTheme(themeConfig);
      // if (ws) ws.close();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch theme from agent';
      setThemeError(message);
      console.warn('Theme fetch failed, using default theme:', err);

      // Fallback to default theme
      setTheme(DEFAULT_THEME);
    } finally {
      setIsLoadingTheme(false);
    }
  }, [agentName]);

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
