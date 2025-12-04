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

import { SvgIconComponent } from '@mui/icons-material';
import * as MuiIcons from '@mui/icons-material';

/**
 * Resolves a MUI icon name to its component.
 *
 * @param iconName - Name of the MUI icon (e.g., "Psychology", "Settings")
 * @returns The icon component or undefined if not found
 *
 * @example
 * const IconComponent = resolveIcon("Psychology");
 * if (IconComponent) {
 *   return <IconComponent sx={{ color: 'primary.main' }} />;
 * }
 */
export function resolveIcon(iconName?: string): SvgIconComponent | undefined {
  if (!iconName) {
    return undefined;
  }

  // Try direct match first
  const icon = (MuiIcons as Record<string, unknown>)[iconName];
  if (icon && typeof icon === 'function') {
    return icon as SvgIconComponent;
  }

  // Try with "Outlined" suffix
  const outlinedIcon = (MuiIcons as Record<string, unknown>)[`${iconName}Outlined`];
  if (outlinedIcon && typeof outlinedIcon === 'function') {
    return outlinedIcon as SvgIconComponent;
  }

  // Default icon if not found
  return MuiIcons.HelpOutline;
}

/**
 * Checks if an icon name exists in MUI icons.
 *
 * @param iconName - Name of the MUI icon
 * @returns true if the icon exists
 */
export function hasIcon(iconName: string): boolean {
  return iconName in MuiIcons;
}

/**
 * Gets a list of commonly used icons for widgets.
 * Useful for documentation or UI builders.
 */
export const COMMON_WIDGET_ICONS = [
  'Psychology', // AI/Analysis
  'Search', // Search/Query
  'Settings', // Configuration
  'DataObject', // Data/JSON
  'Analytics', // Analytics
  'Assessment', // Reports
  'BarChart', // Charts
  'Dashboard', // Dashboard
  'Storage', // Database
  'CloudUpload', // Upload
  'Download', // Download
  'FilterAlt', // Filters
  'Sort', // Sorting
  'Calculate', // Calculations
  'Transform', // Transformations
] as const;
