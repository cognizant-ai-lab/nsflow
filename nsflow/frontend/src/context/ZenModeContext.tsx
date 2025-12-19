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

import { useState, useCallback, useEffect, useMemo, ReactNode } from 'react';
import {
  ZenModeConfig,
  getZenModeConfig,
  setZenModePreset,
  getAvailablePresets,
  getPresetConfig,
  setCustomZenModeConfig,
  resetZenModeConfig,
  ZEN_MODE_PRESETS,
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
  const [currentPreset, setCurrentPreset] = useState<string>(() => {
    return localStorage.getItem('zenModePreset') || 'default';
  });
  const [zoomLevel, setZoomLevel] = useState(1);

  // Initialize zoom level from config
  useEffect(() => {
    setZoomLevel(config.features.defaultZoomLevel);
  }, [config.features.defaultZoomLevel]);

  // Handle fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isZenMode) {
        // User exited fullscreen via browser controls
        setIsZenMode(false);
        setIsTransitioning(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [isZenMode]);

  const enterZenMode = useCallback(() => {
    setIsTransitioning(true);
    
    // Request fullscreen
    document.documentElement.requestFullscreen?.().catch((err) => {
      console.warn('Could not enter fullscreen:', err);
    });

    // Start transition
    setTimeout(() => {
      setIsZenMode(true);
      setTimeout(() => {
        setIsTransitioning(false);
      }, config.features.transitionDuration);
    }, 50);
  }, [config.features.transitionDuration]);

  const exitZenMode = useCallback(() => {
    setIsTransitioning(true);

    // Exit fullscreen
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch((err) => {
        console.warn('Could not exit fullscreen:', err);
      });
    }

    setTimeout(() => {
      setIsZenMode(false);
      setIsTransitioning(false);
    }, config.features.transitionDuration);
  }, [config.features.transitionDuration]);

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

  // Handle keyboard shortcuts in zen mode
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isZenMode) return;

      // Escape to exit zen mode
      if (event.key === 'Escape') {
        exitZenMode();
        return;
      }

      // Zoom controls (only if zoom controls are enabled)
      if (config.features.enableZoomControls) {
        // + or = to zoom in
        if (event.key === '+' || event.key === '=') {
          event.preventDefault();
          zoomIn();
        }
        // - to zoom out
        if (event.key === '-') {
          event.preventDefault();
          zoomOut();
        }
        // 0 to reset zoom
        if (event.key === '0') {
          event.preventDefault();
          resetZoom();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isZenMode, config.features.enableZoomControls, zoomIn, zoomOut, resetZoom, exitZenMode]);

  const setZoom = useCallback((level: number) => {
    const clampedLevel = Math.max(
      config.features.minZoom,
      Math.min(level, config.features.maxZoom)
    );
    setZoomLevel(Math.round(clampedLevel * 100) / 100);
  }, [config.features.minZoom, config.features.maxZoom]);

  // Config management
  const setPreset = useCallback((presetName: string) => {
    const presetConfig = getPresetConfig(presetName);
    setZenModePreset(presetName);
    setConfig(presetConfig);
    setCurrentPreset(presetName);
  }, []);

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
      setCurrentPreset('custom');
      return newConfig;
    });
  }, []);

  const resetConfigHandler = useCallback(() => {
    resetZenModeConfig();
    const defaultConfig = getZenModeConfig();
    setConfig(defaultConfig);
    setCurrentPreset('default');
  }, []);

  // Memoize available presets to ensure they're always available
  const availablePresets = useMemo(() => {
    const presets = getAvailablePresets();
    // Fallback: if presets are empty, get them directly from ZEN_MODE_PRESETS
    if (presets.length === 0 && ZEN_MODE_PRESETS) {
      return Object.keys(ZEN_MODE_PRESETS);
    }
    return presets;
  }, []);

  const value: ZenModeContextType = {
    isZenMode,
    isTransitioning,
    zoomLevel,
    config,
    currentPreset,
    availablePresets,
    enterZenMode,
    exitZenMode,
    toggleZenMode,
    zoomIn,
    zoomOut,
    resetZoom,
    setZoom,
    setPreset,
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