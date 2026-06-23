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

/**
 * Zen Mode Configuration.
 * This file defines the structure of the Zen Mode configuration, including
 * feature toggles and theme settings, as well as utility functions to get,
 * set, and reset the configuration in localStorage.  
 */

export interface ZenModeFeatures {
  // Layout
  /** Mount the agent-network sidebar inside the overlay. */
  showSidebar: boolean;

  // Agent Flow
  /** Render the minimap inside the agent-flow panel. */
  showMinimap: boolean;

  // Advanced panels (default ON — they share the ChatPanel real estate).
  showInternalChat: boolean;
  showConfigPanel: boolean;
  showSlyDataPanel: boolean;
  showConnectorsPanel: boolean;
  showLogsPanel: boolean;

  // Chat panel sizing
  chatPanelWidth: number; // percentage
  chatPanelMinWidth: number; // pixels
  chatPanelMaxWidth: number; // pixels

  // Transition & animation constants (not user-facing)
  transitionDuration: number; // ms
  fadeInDuration: number; // ms
  scaleFrom: number;

  // Zoom constants (not user-facing — on-screen buttons govern actual zoom)
  defaultZoomLevel: number;
  minZoom: number;
  maxZoom: number;
  zoomStep: number;
}

export interface ZenModeTheme {
  // Background
  backgroundGradient: string;
  overlayOpacity: number;

  // Header
  headerBackground: string;
  headerHeight: number;

  // Agent Flow panel
  agentFlowBackground: string;
  agentFlowBorder: string;

  // Chat panel
  chatBackground: string;
  chatBorder: string;

  // Active agent highlighting
  activeAgentGlow: string;
  activeAgentBorder: string;

  // Accent colors
  primaryAccent: string;
  secondaryAccent: string;
}

export interface ZenModeConfig {
  name: string;
  description: string;
  features: ZenModeFeatures;
  theme: ZenModeTheme;
}

const DEFAULT_CONFIG: ZenModeConfig = {
  name: 'default',
  description: 'Default Zen Mode configuration',
  features: {
    // Layout
    showSidebar: false,

    // Agent Flow
    showMinimap: false,

    // Advanced panels — default ON; they share the ChatPanel real estate.
    showInternalChat: true,
    showConfigPanel: true,
    showSlyDataPanel: true,
    showConnectorsPanel: false,
    showLogsPanel: true,

    // Chat sizing
    chatPanelWidth: 30,
    chatPanelMinWidth: 320,
    chatPanelMaxWidth: 600,

    // Transitions
    transitionDuration: 400,
    fadeInDuration: 300,
    scaleFrom: 0.95,

    // Zoom
    defaultZoomLevel: 1,
    minZoom: 0.25,
    maxZoom: 2,
    zoomStep: 0.1,
  },
  theme: {
    backgroundGradient: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
    overlayOpacity: 0.98,
    headerBackground: 'rgba(15, 23, 42, 0.9)',
    headerHeight: 56,
    agentFlowBackground: 'transparent',
    agentFlowBorder: 'rgba(59, 130, 246, 0.2)',
    chatBackground: 'rgba(30, 41, 59, 0.95)',
    chatBorder: 'rgba(59, 130, 246, 0.3)',
    activeAgentGlow: '0 0 20px rgba(250, 204, 21, 0.6)',
    activeAgentBorder: '#fbbf24',
    primaryAccent: '#3b82f6',
    secondaryAccent: '#10b981',
  },
};

const CUSTOM_KEY = 'zenModeCustomConfig';

// Deep merge: features and theme are spread so partial overrides keep defaults
// for missing keys.
const mergeConfig = (base: ZenModeConfig, override: Partial<ZenModeConfig>): ZenModeConfig => ({
  name: override.name || base.name,
  description: override.description || base.description,
  features: { ...base.features, ...(override.features || {}) },
  theme: { ...base.theme, ...(override.theme || {}) },
});

export const getZenModeConfig = (): ZenModeConfig => {
  try {
    const stored = localStorage.getItem(CUSTOM_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return mergeConfig(DEFAULT_CONFIG, parsed);
    }
  } catch (e) {
    console.warn('Failed to parse custom zen mode config:', e);
  }
  return DEFAULT_CONFIG;
};

export const setCustomZenModeConfig = (config: Partial<ZenModeConfig>): void => {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(config));
};

export const resetZenModeConfig = (): void => {
  localStorage.removeItem(CUSTOM_KEY);
};

export const getDefaultZenModeConfig = (): ZenModeConfig => DEFAULT_CONFIG;
