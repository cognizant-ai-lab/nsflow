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

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const CRUSE_GLASS_OPACITY_KEY = 'cruse_glass_opacity';
const CRUSE_GLASS_BLUR_KEY = 'cruse_glass_blur';

interface GlassEffectContextType {
  opacity: number;
  blur: number;
  setOpacity: (value: number) => void;
  setBlur: (value: number) => void;
  /**
   * Helper function to generate glass effect styles for MUI sx prop
   * @param isDark - Whether the theme is dark mode (optional, defaults to true)
   * @returns Object with bgcolor and backdropFilter ready for MUI sx
   */
  getGlassStyles: (isDark?: boolean) => {
    bgcolor: string;
    backdropFilter: string;
  };
}

const GlassEffectContext = createContext<GlassEffectContextType | null>(null);

export function GlassEffectProvider({ children }: { children: ReactNode }) {
  const [opacity, setOpacityState] = useState(() => {
    const stored = localStorage.getItem(CRUSE_GLASS_OPACITY_KEY);
    return stored ? parseFloat(stored) : 5; // Default 5% opacity
  });

  const [blur, setBlurState] = useState(() => {
    const stored = localStorage.getItem(CRUSE_GLASS_BLUR_KEY);
    return stored ? parseFloat(stored) : 2; // Default 2px blur
  });

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(CRUSE_GLASS_OPACITY_KEY, String(opacity));
  }, [opacity]);

  useEffect(() => {
    localStorage.setItem(CRUSE_GLASS_BLUR_KEY, String(blur));
  }, [blur]);

  const setOpacity = (value: number) => {
    setOpacityState(value);
  };

  const setBlur = (value: number) => {
    setBlurState(value);
  };

  const getGlassStyles = (isDark = true) => {
    const opacityDecimal = opacity / 100;
    return {
      bgcolor: isDark
        ? `rgba(0, 0, 0, ${opacityDecimal})`
        : `rgba(255, 255, 255, ${opacityDecimal})`,
      backdropFilter: `blur(${blur}px)`,
    };
  };

  return (
    <GlassEffectContext.Provider value={{ opacity, blur, setOpacity, setBlur, getGlassStyles }}>
      {children}
    </GlassEffectContext.Provider>
  );
}

export function useGlassEffect() {
  const context = useContext(GlassEffectContext);
  if (!context) {
    // Return safe defaults when used outside provider (e.g., in non-Cruse pages)
    return {
      opacity: 5,
      blur: 2,
      setOpacity: () => {},
      setBlur: () => {},
      getGlassStyles: () => ({
        bgcolor: 'rgba(0, 0, 0, 0.05)',
        backdropFilter: 'blur(2px)',
      }),
    };
  }
  return context;
}
