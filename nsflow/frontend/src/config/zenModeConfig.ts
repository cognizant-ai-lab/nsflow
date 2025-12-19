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
 * Zen Mode Configuration
 * 
 * This configuration file controls which features are available in Zen Mode.
 * Different clients can customize this to suit their presentation needs.
 * 
 * Usage:
 * 1. Import the config in your components
 * 2. Use getZenModeConfig() to get the active configuration
 * 3. Create client-specific presets by modifying ZEN_MODE_PRESETS
 * 
 * To switch between client configurations:
 * - Set localStorage.setItem('zenModePreset', 'clientName')
 * - Or modify ACTIVE_PRESET below
 */

export interface ZenModeFeatures {
    // Layout features
    showAgentFlow: boolean;
    showChat: boolean;
    showHeader: boolean;
    
    // Agent Flow features
    showAgentFlowControls: boolean;
    showAgentFlowBackground: boolean;
    showLayoutPanel: boolean;
    showMinimap: boolean;
    enableNodeDragging: boolean;
    
    // Chat features
    showSampleQueries: boolean;
    showSpeechToText: boolean;
    showTextToSpeech: boolean;
    showClearChat: boolean;
    
    // Advanced panels
    showInternalChat: boolean;
    showConfigPanel: boolean;
    showSlyDataPanel: boolean;
    showLogsPanel: boolean;
    
    // Visual features
    enableAnimations: boolean;
    showNetworkTitle: boolean;
    showConnectionStatus: boolean;
    showActiveAgentIndicator: boolean;
    
    // Zoom & Accessibility
    enableZoomControls: boolean;
    defaultZoomLevel: number;
    minZoom: number;
    maxZoom: number;
    zoomStep: number;
    
    // Chat panel sizing
    chatPanelWidth: number; // percentage
    chatPanelMinWidth: number; // pixels
    chatPanelMaxWidth: number; // pixels
    
    // Transition & Animation settings
    transitionDuration: number; // ms
    fadeInDuration: number; // ms
    scaleFrom: number;
  }
  
  export interface ZenModeTheme {
    // Background
    backgroundGradient: string;
    overlayOpacity: number;
    
    // Header (when visible)
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
  
  // Default configuration - suitable for most client demos
  const DEFAULT_CONFIG: ZenModeConfig = {
    name: 'default',
    description: 'Standard Zen Mode configuration for client demonstrations',
    features: {
      // Layout
      showAgentFlow: true,
      showChat: true,
      showHeader: true,
      
      // Agent Flow
      showAgentFlowControls: true,
      showAgentFlowBackground: true,
      showLayoutPanel: true, // Hidden for cleaner look
      showMinimap: false, // Hidden for cleaner look
      enableNodeDragging: true,
      
      // Chat
      showSampleQueries: true,
      showSpeechToText: false,
      showTextToSpeech: true,
      showClearChat: true,
      
      // Advanced panels
      showInternalChat: false,
      showConfigPanel: false,
      showSlyDataPanel: false,
      showLogsPanel: false,
      
      // Visual
      enableAnimations: true,
      showNetworkTitle: true,
      showConnectionStatus: true,
      showActiveAgentIndicator: true,
      
      // Zoom
      enableZoomControls: true,
      defaultZoomLevel: 1,
      minZoom: 0.25,
      maxZoom: 2,
      zoomStep: 0.1,
      
      // Chat sizing
      chatPanelWidth: 30,
      chatPanelMinWidth: 320,
      chatPanelMaxWidth: 600,
      
      // Transitions
      transitionDuration: 400,
      fadeInDuration: 300,
      scaleFrom: 0.95,
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
  
  // Executive presentation - minimal distractions
  const EXECUTIVE_CONFIG: ZenModeConfig = {
    name: 'executive',
    description: 'Minimal interface for executive presentations - focus on flow and results',
    features: {
      ...DEFAULT_CONFIG.features,
      showAgentFlowControls: false,
      showLayoutPanel: false,
      showMinimap: false,
      showSampleQueries: true,
      showSpeechToText: false,
      showTextToSpeech: false,
      showClearChat: false,
      enableNodeDragging: false,
      chatPanelWidth: 25,
    },
    theme: {
      ...DEFAULT_CONFIG.theme,
      backgroundGradient: 'linear-gradient(180deg, #0c1222 0%, #1a2744 100%)',
    },
  };
  
  // Technical demo - show more details
  const TECHNICAL_CONFIG: ZenModeConfig = {
    name: 'technical',
    description: 'Full-featured mode for technical demonstrations',
    features: {
      ...DEFAULT_CONFIG.features,
      showAgentFlowControls: true,
      showLayoutPanel: true,
      showMinimap: true,
      showSampleQueries: true,
      showSpeechToText: false,
      showTextToSpeech: true,
      showClearChat: true,
      chatPanelWidth: 35,
    },
    theme: {
      ...DEFAULT_CONFIG.theme,
    },
  };
  
  // Chat-focused - larger chat panel
  const CHAT_FOCUSED_CONFIG: ZenModeConfig = {
    name: 'chat-focused',
    description: 'Emphasizes the chat interface for conversational demos',
    features: {
      ...DEFAULT_CONFIG.features,
      showAgentFlowControls: false,
      showLayoutPanel: false,
      chatPanelWidth: 45,
      chatPanelMinWidth: 400,
    },
    theme: {
      ...DEFAULT_CONFIG.theme,
    },
  };
  
  // Flow-focused - minimal chat
  const FLOW_FOCUSED_CONFIG: ZenModeConfig = {
    name: 'flow-focused',
    description: 'Emphasizes the agent flow visualization',
    features: {
      ...DEFAULT_CONFIG.features,
      showAgentFlowControls: true,
      showMinimap: true,
      chatPanelWidth: 20,
      chatPanelMinWidth: 280,
    },
    theme: {
      ...DEFAULT_CONFIG.theme,
    },
  };
  
  // All available presets
  export const ZEN_MODE_PRESETS: Record<string, ZenModeConfig> = {
    default: DEFAULT_CONFIG,
    executive: EXECUTIVE_CONFIG,
    technical: TECHNICAL_CONFIG,
    'chat-focused': CHAT_FOCUSED_CONFIG,
    'flow-focused': FLOW_FOCUSED_CONFIG,
  };
  
  // Get available preset names
  export const getAvailablePresets = (): string[] => {
    return Object.keys(ZEN_MODE_PRESETS);
  };
  
  // Get config for a specific preset
  export const getPresetConfig = (presetName: string): ZenModeConfig => {
    return ZEN_MODE_PRESETS[presetName] || DEFAULT_CONFIG;
  };
  
  // Get the currently active configuration
  export const getZenModeConfig = (): ZenModeConfig => {
    // Check localStorage for a saved preset preference
    const savedPreset = localStorage.getItem('zenModePreset');
    if (savedPreset && ZEN_MODE_PRESETS[savedPreset]) {
      return ZEN_MODE_PRESETS[savedPreset];
    }
    
    // Check for custom config in localStorage
    const customConfig = localStorage.getItem('zenModeCustomConfig');
    if (customConfig) {
      try {
        const parsed = JSON.parse(customConfig);
        return mergeConfig(DEFAULT_CONFIG, parsed);
      } catch (e) {
        console.warn('Failed to parse custom zen mode config:', e);
      }
    }
    
    return DEFAULT_CONFIG;
  };
  
  // Save a preset preference
  export const setZenModePreset = (presetName: string): void => {
    if (ZEN_MODE_PRESETS[presetName]) {
      localStorage.setItem('zenModePreset', presetName);
      localStorage.removeItem('zenModeCustomConfig');
    }
  };
  
  // Save a custom configuration
  export const setCustomZenModeConfig = (config: Partial<ZenModeConfig>): void => {
    localStorage.setItem('zenModeCustomConfig', JSON.stringify(config));
    localStorage.removeItem('zenModePreset');
  };
  
  // Reset to default configuration
  export const resetZenModeConfig = (): void => {
    localStorage.removeItem('zenModePreset');
    localStorage.removeItem('zenModeCustomConfig');
  };
  
  // Deep merge helper for configs
  const mergeConfig = (base: ZenModeConfig, override: Partial<ZenModeConfig>): ZenModeConfig => {
    return {
      name: override.name || base.name,
      description: override.description || base.description,
      features: {
        ...base.features,
        ...(override.features || {}),
      },
      theme: {
        ...base.theme,
        ...(override.theme || {}),
      },
    };
  };
  
  // Create a custom config from partial overrides
  export const createCustomConfig = (overrides: Partial<ZenModeConfig>): ZenModeConfig => {
    return mergeConfig(DEFAULT_CONFIG, overrides);
  };
  
  // Export types for use in components
  export type { ZenModeConfig as ZenConfig };