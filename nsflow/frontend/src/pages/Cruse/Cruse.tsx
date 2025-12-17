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

import * as React from "react";
import { useEffect, useState, useCallback, useRef } from "react";
import { Box } from "@mui/material";
import Header from "../../components/Header";
import { CruseInterface } from "../../components/cruse/CruseInterface";
import EditorLogsPanel from "../../components/EditorLogsPanel";
import { BackgroundEngine, type BackgroundSchema } from "../../components/cruse/backgrounds";
import { ApiPortProvider, useApiPort } from "../../context/ApiPortContext";
import { NeuroSanProvider } from "../../context/NeuroSanContext";
import { ChatProvider, useChatContext } from "../../context/ChatContext";
import { getInitialTheme } from "../../utils/theme";
import {
  getOrGenerateTheme,
  refreshTheme,
  getThemePreferences,
  saveThemePreferences,
} from "../../utils/cruse/themeManager";

const CRUSE_SHOW_LOGS_KEY = 'cruse_show_logs';

const CruseContent: React.FC = () => {
  const { setIsEditorMode, activeNetwork } = useChatContext();
  const { apiUrl } = useApiPort();

  // Initialize showLogs from localStorage, default to true if not set
  const [showLogs, setShowLogs] = useState(() => {
    const stored = localStorage.getItem(CRUSE_SHOW_LOGS_KEY);
    return stored !== null ? stored === 'true' : true;
  });

  // Theme preferences from localStorage
  const [cruseThemeEnabled, setCruseThemeEnabled] = useState(() => {
    return getThemePreferences().enabled;
  });

  const [backgroundType, setBackgroundType] = useState<'static' | 'dynamic'>(() => {
    return getThemePreferences().backgroundType;
  });

  // Current background schema
  const [backgroundSchema, setBackgroundSchema] = useState<BackgroundSchema | null>(null);

  // Theme refreshing state
  const [isRefreshingTheme, setIsRefreshingTheme] = useState(false);

  // Track if transparency override is active to prevent cleanup race conditions
  const transparencyAppliedRef = useRef(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", getInitialTheme());
    // Set editor mode to false for CRUSE (it's a chat interface, not editor)
    setIsEditorMode(false);

    return () => setIsEditorMode(false);
  }, [setIsEditorMode]);

  // Make body transparent when CRUSE theme is enabled so fixed background is visible
  // CRITICAL: Use !important to override MUI's CssBaseline which applies theme.palette.background.default to body
  // Uses ref to prevent StrictMode double-invocation cleanup from removing transparency prematurely
  useEffect(() => {
    if (cruseThemeEnabled) {
      const body = document.body;
      const html = document.documentElement;
      const root = document.getElementById('root');

      // Use !important to override MUI CssBaseline's injected CSS
      // CssBaseline applies theme.palette.background.default ('#0f172a' dark or '#f8fafc' light)
      body.style.setProperty('background-color', 'transparent', 'important');
      body.style.setProperty('background', 'transparent', 'important');
      html.style.setProperty('background-color', 'transparent', 'important');
      html.style.setProperty('background', 'transparent', 'important');

      if (root) {
        root.style.setProperty('background-color', 'transparent', 'important');
        root.style.setProperty('background', 'transparent', 'important');
      }

      transparencyAppliedRef.current = true;

      return () => {
        // Only clean up if theme is actually being disabled (not just StrictMode re-render)
        if (!cruseThemeEnabled) {
          body.style.removeProperty('background-color');
          body.style.removeProperty('background');
          html.style.removeProperty('background-color');
          html.style.removeProperty('background');

          if (root) {
            root.style.removeProperty('background-color');
            root.style.removeProperty('background');
          }
          transparencyAppliedRef.current = false;
        }
      };
    } else if (transparencyAppliedRef.current) {
      // Theme was disabled, clean up
      const body = document.body;
      const html = document.documentElement;
      const root = document.getElementById('root');

      body.style.removeProperty('background-color');
      body.style.removeProperty('background');
      html.style.removeProperty('background-color');
      html.style.removeProperty('background');

      if (root) {
        root.style.removeProperty('background-color');
        root.style.removeProperty('background');
      }
      transparencyAppliedRef.current = false;
    }
  }, [cruseThemeEnabled]);

  // Persist showLogs to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(CRUSE_SHOW_LOGS_KEY, String(showLogs));
  }, [showLogs]);

  // Persist theme preferences to localStorage
  useEffect(() => {
    saveThemePreferences(cruseThemeEnabled, backgroundType);
  }, [cruseThemeEnabled, backgroundType]);

  // Load theme when Cruse Theme is enabled or when active agent/background type changes
  useEffect(() => {
    const loadTheme = async () => {
      // Clear theme if disabled or no agent selected
      if (!cruseThemeEnabled || !activeNetwork || !apiUrl) {
        setBackgroundSchema(null);
        return;
      }

      try {
        // Get or generate theme (fetches from DB or generates if not exists)
        const theme = await getOrGenerateTheme(apiUrl, activeNetwork, backgroundType);

        if (theme) {
          setBackgroundSchema(theme);
        } else {
          // Fallback to default gradient if theme loading fails
          setBackgroundSchema({
            type: 'gradient',
            mode: 'linear',
            angle: '135deg',
            colors: [
              { color: '#0f172a', stop: '0%' },
              { color: '#1e293b', stop: '100%' },
            ],
          });
        }
      } catch (error) {
        console.error(`[Cruse] Error loading theme:`, error);
        // Fallback to default gradient
        setBackgroundSchema({
          type: 'gradient',
          mode: 'linear',
          angle: '135deg',
          colors: [
            { color: '#0f172a', stop: '0%' },
            { color: '#1e293b', stop: '100%' },
          ],
        });
      }
    };

    loadTheme();
  }, [cruseThemeEnabled, activeNetwork, backgroundType, apiUrl]);

  const handleToggleLogs = () => {
    setShowLogs(!showLogs);
  };

  // Handle Cruse Theme toggle
  const handleCruseThemeToggle = useCallback((enabled: boolean) => {
    setCruseThemeEnabled(enabled);
  }, []);

  // Handle background type change
  const handleBackgroundTypeChange = useCallback((type: 'static' | 'dynamic') => {
    setBackgroundType(type);
  }, []);

  // Handle theme refresh
  const handleRefreshTheme = useCallback(async () => {
    if (!activeNetwork || !apiUrl) {
      console.warn(`[Cruse] Cannot refresh theme: missing activeNetwork or apiUrl`);
      return;
    }

    setIsRefreshingTheme(true);

    try {
      const theme = await refreshTheme(apiUrl, activeNetwork, backgroundType);

      if (theme) {
        setBackgroundSchema(theme);
      } else {
        console.error(`[Cruse] Failed to refresh theme`);
      }
    } catch (error) {
      console.error(`[Cruse] Error refreshing theme:`, error);
    } finally {
      setIsRefreshingTheme(false);
    }
  }, [activeNetwork, backgroundType, apiUrl]);

  return (
    <ApiPortProvider>
      <NeuroSanProvider>
        {/* Background Canvas - Vanta needs container to be relative */}
        {cruseThemeEnabled && backgroundSchema && (
          <Box
            sx={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              zIndex: -1,
              pointerEvents: 'none',
            }}
          >
            <BackgroundEngine schema={backgroundSchema} enableTransition={false} />
          </Box>
        )}

        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            width: '100vw',
            bgcolor: cruseThemeEnabled ? 'transparent' : 'background.default',
            background: cruseThemeEnabled ? 'none' : undefined,
            overflow: 'hidden',
            position: 'relative',
            zIndex: 0,
          }}
        >
          <Header selectedNetwork="" isCrusePage={true} />

          <Box sx={{
            flex: 1,
            overflow: 'hidden',
            bgcolor: cruseThemeEnabled ? 'transparent' : undefined,
            background: cruseThemeEnabled ? 'none' : undefined,
          }}>
            <CruseInterface
              showLogs={showLogs}
              onToggleLogs={handleToggleLogs}
              cruseThemeEnabled={cruseThemeEnabled}
              onCruseThemeToggle={handleCruseThemeToggle}
              backgroundType={backgroundType}
              onBackgroundTypeChange={handleBackgroundTypeChange}
              onRefreshTheme={handleRefreshTheme}
              isRefreshingTheme={isRefreshingTheme}
            />

            {/* Expandable Logs Panel in bottom center-left */}
            {showLogs && <EditorLogsPanel />}
          </Box>
        </Box>
      </NeuroSanProvider>
    </ApiPortProvider>
  );
};

const Cruse: React.FC = () => {
  return (
    <ChatProvider>
      <CruseContent />
    </ChatProvider>
  );
};

export default Cruse;
