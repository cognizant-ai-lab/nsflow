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

import { useState, useCallback, useEffect, ReactNode } from 'react';
import {
  ZenModeConfig,
  getZenModeConfig,
  getDefaultZenModeConfig,
  setCustomZenModeConfig,
  resetZenModeConfig,
} from '../config/zenModeConfig';
import { ZenModeContext, ZenModeContextType } from './zenModeTypes';

// Re-export context and type for convenience
export { ZenModeContext };
export type { ZenModeContextType };

interface ZenModeProviderProps {
  children: ReactNode;
}

export const ZenModeProvider = ({ children }: ZenModeProviderProps) => {
  const [isZenMode, setIsZenMode] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [config, setConfig] = useState<ZenModeConfig>(() => getZenModeConfig());
  const [zoomLevel, setZoomLevel] = useState(1);

  // Initialize zoom level from config
  useEffect(() => {
    setZoomLevel(config.features.defaultZoomLevel);
  }, [config.features.defaultZoomLevel]);

  // Zen Mode runs as a windowed overlay. Users who want a real fullscreen
  // browser window can use the browser's own shortcut (Cmd-Ctrl-F / F11).
  const enterZenMode = useCallback(() => {
    // Idempotent: skip when we're already in Zen Mode or mid-transition.
    if (isZenMode || isTransitioning) return;
    setIsTransitioning(true);
    setIsZenMode(true);
    setTimeout(() => {
      setIsTransitioning(false);
    }, config.features.transitionDuration);
  }, [config.features.transitionDuration, isZenMode, isTransitioning]);

  const exitZenMode = useCallback(() => {
    // Idempotent: skip when we're already out of Zen Mode or mid-transition,
    // so rapid clicks (or StrictMode re-invokes) can't stack timers.
    if (!isZenMode || isTransitioning) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setIsZenMode(false);
      setIsTransitioning(false);
    }, config.features.transitionDuration);
  }, [config.features.transitionDuration, isZenMode, isTransitioning]);

  const toggleZenMode = useCallback(() => {
    if (isZenMode) {
      exitZenMode();
    } else {
      enterZenMode();
    }
  }, [isZenMode, enterZenMode, exitZenMode]);

  // Zoom controls
  const zoomIn = useCallback(() => {
    setZoomLevel((prev) => {
      const newLevel = Math.min(prev + config.features.zoomStep, config.features.maxZoom);
      return Math.round(newLevel * 100) / 100;
    });
  }, [config.features.zoomStep, config.features.maxZoom]);

  const zoomOut = useCallback(() => {
    setZoomLevel((prev) => {
      const newLevel = Math.max(prev - config.features.zoomStep, config.features.minZoom);
      return Math.round(newLevel * 100) / 100;
    });
  }, [config.features.zoomStep, config.features.minZoom]);

  const resetZoom = useCallback(() => {
    setZoomLevel(config.features.defaultZoomLevel);
  }, [config.features.defaultZoomLevel]);

  // Escape exits Zen Mode. Zoom uses the browser's native Ctrl/Cmd +/-/0,
  // so we don't bind custom zoom shortcuts here.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isZenMode) return;
      if (event.key === 'Escape') {
        exitZenMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isZenMode, exitZenMode]);

  const setZoom = useCallback((level: number) => {
    const clampedLevel = Math.max(
      config.features.minZoom,
      Math.min(level, config.features.maxZoom)
    );
    setZoomLevel(Math.round(clampedLevel * 100) / 100);
  }, [config.features.minZoom, config.features.maxZoom]);

  // Persist the user's edits to localStorage so they survive a reload.
  const updateConfig = useCallback((updates: Partial<ZenModeConfig>) => {
    setConfig((prev) => {
      const newConfig = {
        ...prev,
        ...updates,
        features: {
          ...prev.features,
          ...(updates.features || {}),
        },
        theme: {
          ...prev.theme,
          ...(updates.theme || {}),
        },
      };
      setCustomZenModeConfig(newConfig);
      return newConfig;
    });
  }, []);

  const resetConfigHandler = useCallback(() => {
    resetZenModeConfig();
    setConfig(getDefaultZenModeConfig());
  }, []);

  const value: ZenModeContextType = {
    isZenMode,
    isTransitioning,
    zoomLevel,
    config,
    enterZenMode,
    exitZenMode,
    toggleZenMode,
    zoomIn,
    zoomOut,
    resetZoom,
    setZoom,
    updateConfig,
    resetConfig: resetConfigHandler,
  };

  return (
    <ZenModeContext.Provider value={value}>
      {children}
    </ZenModeContext.Provider>
  );
};

// useZenMode hook is exported from '../hooks/useZenMode'