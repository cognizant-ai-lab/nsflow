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

import type { BackgroundSchema } from '../types';

export interface AgentTheme {
  agent_name: string;
  static_theme: BackgroundSchema | null;
  dynamic_theme: BackgroundSchema | null;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch theme configuration for a specific agent from the backend
 */
export async function fetchAgentTheme(agentName: string): Promise<AgentTheme | null> {
  try {
    const response = await fetch(`/api/v1/cruse/themes/${encodeURIComponent(agentName)}`);

    if (response.status === 404) {
      // No theme configured for this agent
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch theme: ${response.statusText}`);
    }

    const theme = await response.json();
    return theme;
  } catch (error) {
    console.error(`[ThemeLoader] Error fetching theme for ${agentName}:`, error);
    return null;
  }
}

/**
 * Save or update a theme for an agent
 */
export async function saveAgentTheme(
  agentName: string,
  themeType: 'static' | 'dynamic',
  themeJson: BackgroundSchema
): Promise<AgentTheme | null> {
  try {
    const response = await fetch(`/api/v1/cruse/themes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_name: agentName,
        theme_type: themeType,
        theme_json: themeJson,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to save theme: ${response.statusText}`);
    }

    const savedTheme = await response.json();
    return savedTheme;
  } catch (error) {
    console.error(`[ThemeLoader] Error saving theme for ${agentName}:`, error);
    return null;
  }
}

/**
 * Update an existing theme for an agent
 */
export async function updateAgentTheme(
  agentName: string,
  themeType: 'static' | 'dynamic',
  themeJson: BackgroundSchema
): Promise<AgentTheme | null> {
  try {
    const response = await fetch(`/api/v1/cruse/themes/${encodeURIComponent(agentName)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        theme_type: themeType,
        theme_json: themeJson,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update theme: ${response.statusText}`);
    }

    const updatedTheme = await response.json();
    return updatedTheme;
  } catch (error) {
    console.error(`[ThemeLoader] Error updating theme for ${agentName}:`, error);
    return null;
  }
}
