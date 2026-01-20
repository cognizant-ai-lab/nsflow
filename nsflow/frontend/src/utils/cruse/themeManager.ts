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

import type { BackgroundSchema } from '../../components/cruse/backgrounds/types';
import { fetchAgentTheme, saveAgentTheme } from '../../components/cruse/backgrounds/utils/themeLoader';

// LocalStorage keys for theme preferences
export const CRUSE_THEME_ENABLED_KEY = 'cruse_theme_enabled';
export const CRUSE_BACKGROUND_TYPE_KEY = 'cruse_background_type';

// Fallback schemas when theme generation fails
const FALLBACK_DYNAMIC_THEME: BackgroundSchema = {
  type: 'css-doodle',
  grid: '10x8',
  seed: 'agent:fallback',
  rules: ':doodle { @grid: 10x8 / 100vmax; background: var(--bg); } @shape: @p(triangle, square); background: @p(var(--color1), var(--color2), var(--color3), transparent); opacity: @rand(.2, .5); transform: scale(@rand(.8, 1.2)) rotate(@rand(360deg));',
  vars: {
    '--bg': '#f0f4c3',
    '--color1': '#ffb74d',
    '--color2': '#ff8a65',
    '--color3': '#aed581',
  },
};

const FALLBACK_STATIC_THEME: BackgroundSchema = {
  type: 'gradient',
  mode: 'linear',
  angle: '135deg',
  colors: [
    { color: '#ffafcc', stop: '0%' },
    { color: '#ffc3a0', stop: '33%' },
    { color: '#ffdfba', stop: '66%' },
    { color: '#c1f4c5', stop: '100%' },
  ],
};

/**
 * Connectivity API node structure
 */
interface ConnectivityNode {
  id: string;
  type: string;
  data: {
    label: string;
    depth: number;
    parent: string | null;
    children: string[];
    dropdown_tools?: string[];
    sub_networks?: string[];
  };
  position: {
    x: number;
    y: number;
  };
}

/**
 * Connectivity API response structure
 */
interface ConnectivityResponse {
  nodes: ConnectivityNode[];
  edges: any[];
  metadata: Record<string, any>;
}

/**
 * Simplified node structure for theme agent
 */
interface SimplifiedNode {
  label: string;
  children: string[];
}

/**
 * Agent details payload for cruse_theme_agent
 */
interface AgentDetails {
  nodes: SimplifiedNode[];
  metadata: Record<string, any>;
}

/**
 * Transform connectivity API response to simplified agent details
 */
export function transformConnectivityToAgentDetails(
  connectivityData: ConnectivityResponse
): AgentDetails {
  const simplifiedNodes: SimplifiedNode[] = connectivityData.nodes.map((node) => ({
    label: node.data.label,
    children: node.data.children,
  }));

  return {
    nodes: simplifiedNodes,
    metadata: connectivityData.metadata || {},
  };
}

/**
 * Fetch connectivity data for an agent
 */
export async function fetchConnectivity(
  apiUrl: string,
  agentName: string
): Promise<ConnectivityResponse | null> {
  try {
    const response = await fetch(`${apiUrl}/api/v1/connectivity/${encodeURIComponent(agentName)}`);

    if (!response.ok) {
      console.error(`[ThemeManager] Failed to fetch connectivity: ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`[ThemeManager] Error fetching connectivity:`, error);
    return null;
  }
}

/**
 * Call cruse_theme_agent via oneshot API to generate a theme
 */
export async function generateTheme(
  apiUrl: string,
  themeAgentName: string,
  agentDetails: AgentDetails,
  backgroundType: 'static' | 'dynamic',
  userPrompt?: string,
  previousBackground?: BackgroundSchema,
  includePreviousBackground: boolean = true
): Promise<BackgroundSchema> {
  try {
    const payload: any = {
      agent_details: agentDetails,
      background_type: backgroundType,
    };

    // Add user prompt if provided
    if (userPrompt && userPrompt.trim()) {
      payload.user_prompt = userPrompt.trim();
    }

    // Add previous background if provided and user wants to modify it
    if (previousBackground && includePreviousBackground) {
      payload.previous_background = previousBackground;
    }

    console.log(`[ThemeManager] Generating ${backgroundType} theme via ${themeAgentName}`);

    const response = await fetch(`${apiUrl}/api/v1/oneshot/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_name: themeAgentName,
        message: JSON.stringify(payload),
      }),
    });

    if (!response.ok) {
      console.warn(`[ThemeManager] Theme agent failed to respond (${response.statusText}), using fallback default schema`);
      return backgroundType === 'dynamic' ? FALLBACK_DYNAMIC_THEME : FALLBACK_STATIC_THEME;
    }

    const data = await response.json();
    console.log(`[ThemeManager] Theme agent response:`, data);

    // Parse the response to extract the generated theme
    // The theme should be in data.raw_response.message or similar structure
    if (data.raw_response?.message) {
      try {
        // Try parsing as JSON if it's a string
        const themeData = typeof data.raw_response.message === 'string'
          ? JSON.parse(data.raw_response.message)
          : data.raw_response.message;

        // Validate that it's a proper BackgroundSchema
        if (themeData && themeData.type) {
          console.log(`[ThemeManager] Successfully generated ${backgroundType} theme`);
          return themeData as BackgroundSchema;
        }
      } catch (parseError) {
        console.warn(`[ThemeManager] Failed to parse theme response, using fallback default schema:`, parseError);
        return backgroundType === 'dynamic' ? FALLBACK_DYNAMIC_THEME : FALLBACK_STATIC_THEME;
      }
    }

    console.warn(`[ThemeManager] Invalid theme response structure, using fallback default schema`);
    return backgroundType === 'dynamic' ? FALLBACK_DYNAMIC_THEME : FALLBACK_STATIC_THEME;
  } catch (error) {
    console.warn(`[ThemeManager] Error generating theme, using fallback default schema:`, error);
    return backgroundType === 'dynamic' ? FALLBACK_DYNAMIC_THEME : FALLBACK_STATIC_THEME;
  }
}

/**
 * Get or generate theme for an agent
 *
 * 1. Try to fetch theme from DB
 * 2. If not found, fetch connectivity and generate via cruse_theme_agent
 * 3. Save generated theme to DB
 * 4. Return the theme
 */
export async function getOrGenerateTheme(
  apiUrl: string,
  themeAgentName: string,
  agentName: string,
  backgroundType: 'static' | 'dynamic'
): Promise<BackgroundSchema> {
  try {
    console.log(`[ThemeManager] Getting ${backgroundType} theme for ${agentName}`);

    // Step 1: Try to fetch from DB
    const existingTheme = await fetchAgentTheme(agentName);

    if (existingTheme) {
      const theme = backgroundType === 'static'
        ? existingTheme.static_theme
        : existingTheme.dynamic_theme;

      if (theme) {
        console.log(`[ThemeManager] Found existing ${backgroundType} theme in DB`);
        return theme;
      }
    }

    console.log(`[ThemeManager] No existing ${backgroundType} theme found, generating new one`);

    // Step 2: Fetch connectivity data
    const connectivityData = await fetchConnectivity(apiUrl, agentName);
    if (!connectivityData) {
      console.warn(`[ThemeManager] Failed to fetch connectivity data, using fallback default schema`);
      return backgroundType === 'dynamic' ? FALLBACK_DYNAMIC_THEME : FALLBACK_STATIC_THEME;
    }

    // Transform connectivity data
    const agentDetails = transformConnectivityToAgentDetails(connectivityData);

    // Step 3: Generate theme via cruse_theme_agent (always returns a valid schema, fallback if needed)
    const generatedTheme = await generateTheme(apiUrl, themeAgentName, agentDetails, backgroundType);

    // Step 4: Save to DB
    await saveAgentTheme(agentName, backgroundType, generatedTheme);
    console.log(`[ThemeManager] Saved ${backgroundType} theme to DB`);

    return generatedTheme;
  } catch (error) {
    console.warn(`[ThemeManager] Error in getOrGenerateTheme, using fallback default schema:`, error);
    return backgroundType === 'dynamic' ? FALLBACK_DYNAMIC_THEME : FALLBACK_STATIC_THEME;
  }
}

/**
 * Refresh (regenerate) theme for an agent
 * This always calls cruse_theme_agent and updates the DB
 */
export async function refreshTheme(
  apiUrl: string,
  themeAgentName: string,
  agentName: string,
  backgroundType: 'static' | 'dynamic',
  userPrompt?: string,
  includePreviousBackground: boolean = true
): Promise<BackgroundSchema> {
  try {
    console.log(`[ThemeManager] Refreshing ${backgroundType} theme for ${agentName}`);

    // Fetch existing theme from DB to include as previous_background (if user wants to modify it)
    const existingTheme = await fetchAgentTheme(agentName);
    const previousBackground = existingTheme
      ? (backgroundType === 'static' ? existingTheme.static_theme : existingTheme.dynamic_theme) ?? undefined
      : undefined;

    if (previousBackground && includePreviousBackground) {
      console.log(`[ThemeManager] Found previous ${backgroundType} theme, including in refresh payload`);
    } else if (previousBackground && !includePreviousBackground) {
      console.log(`[ThemeManager] Found previous ${backgroundType} theme, but user chose not to modify it`);
    }

    // Fetch connectivity data
    const connectivityData = await fetchConnectivity(apiUrl, agentName);
    if (!connectivityData) {
      console.warn(`[ThemeManager] Failed to fetch connectivity data, using fallback default schema`);
      return backgroundType === 'dynamic' ? FALLBACK_DYNAMIC_THEME : FALLBACK_STATIC_THEME;
    }

    // Transform connectivity data
    const agentDetails = transformConnectivityToAgentDetails(connectivityData);

    // Generate theme via cruse_theme_agent (always returns a valid schema, fallback if needed)
    // Pass previousBackground and includePreviousBackground flag
    const generatedTheme = await generateTheme(apiUrl, themeAgentName, agentDetails, backgroundType, userPrompt, previousBackground, includePreviousBackground);

    // Save to DB (this will update existing theme)
    await saveAgentTheme(agentName, backgroundType, generatedTheme);
    console.log(`[ThemeManager] Refreshed and saved ${backgroundType} theme to DB`);

    return generatedTheme;
  } catch (error) {
    console.warn(`[ThemeManager] Error in refreshTheme, using fallback default schema:`, error);
    return backgroundType === 'dynamic' ? FALLBACK_DYNAMIC_THEME : FALLBACK_STATIC_THEME;
  }
}

/**
 * Get theme preferences from localStorage
 */
export function getThemePreferences(): {
  enabled: boolean;
  backgroundType: 'static' | 'dynamic';
} {
  // Default to true (enabled) - always use Cruse themes
  const storedEnabled = localStorage.getItem(CRUSE_THEME_ENABLED_KEY);
  const enabled = storedEnabled === null ? true : storedEnabled === 'true';

  // Always force 'dynamic' as the default background type
  // (Overrides any old 'static' values from localStorage)
  const backgroundType: 'static' | 'dynamic' = 'dynamic';

  return { enabled, backgroundType };
}

/**
 * Save theme preferences to localStorage
 */
export function saveThemePreferences(_enabled: boolean, _backgroundType: 'static' | 'dynamic'): void {
  // Always save as enabled (true)
  localStorage.setItem(CRUSE_THEME_ENABLED_KEY, 'true');
  // Always save as 'dynamic' (ignore the passed value)
  localStorage.setItem(CRUSE_BACKGROUND_TYPE_KEY, 'dynamic');
}
