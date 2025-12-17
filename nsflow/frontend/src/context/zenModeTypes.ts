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

import { createContext } from 'react';
import { ZenModeConfig } from '../config/zenModeConfig';

export interface ZenModeContextType {
  // Core state
  isZenMode: boolean;
  isTransitioning: boolean;
  zoomLevel: number;
  
  // Configuration
  config: ZenModeConfig;
  currentPreset: string;
  availablePresets: string[];
  
  // Actions
  enterZenMode: () => void;
  exitZenMode: () => void;
  toggleZenMode: () => void;
  
  // Zoom controls
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setZoom: (level: number) => void;
  
  // Config management
  setPreset: (presetName: string) => void;
  updateConfig: (updates: Partial<ZenModeConfig>) => void;
  resetConfig: () => void;
}

export const ZenModeContext = createContext<ZenModeContextType | undefined>(undefined);