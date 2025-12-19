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

import { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import 'css-doodle';
import type { CssDoodleBackgroundSchema } from './types';

/**
 * CssDoodleBackground Component
 *
 * Renders dynamic generative CSS patterns using css-doodle Web Component.
 * Lightweight alternative to WebGL-based backgrounds for CRUSE dynamic themes.
 *
 * css-doodle uses a CSS-like DSL with special functions:
 * - @grid: Define grid layout
 * - @rand(): Random values
 * - @p(): Pick from list
 * - @shape: Built-in shapes (circle, triangle, pentagon, hexagon, etc.)
 * - @size, @place: Sizing and positioning
 *
 * Docs: https://css-doodle.com/
 */
export function CssDoodleBackground({ schema }: { schema: CssDoodleBackgroundSchema }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) {
      console.warn('[CssDoodleBackground] containerRef is null');
      return;
    }

    try {
      console.log('[CssDoodleBackground] Creating css-doodle element with schema:', {
        grid: schema.grid,
        seed: schema.seed,
        rulesLength: schema.rules?.length,
        varsKeys: schema.vars ? Object.keys(schema.vars) : [],
      });

      // css-doodle custom element is already registered by import
      const doodleElement = document.createElement('css-doodle') as HTMLElement;

      // Set attributes
      if (schema.grid) {
        doodleElement.setAttribute('grid', schema.grid);
      }
      if (schema.seed) {
        doodleElement.setAttribute('seed', schema.seed);
      }

      // Set CSS custom properties (vars)
      if (schema.vars) {
        Object.entries(schema.vars).forEach(([key, value]) => {
          doodleElement.style.setProperty(key, value);
        });
      }

      // Set the rules as text content
      doodleElement.textContent = schema.rules;

      // Apply sizing to fill container
      doodleElement.style.width = '100%';
      doodleElement.style.height = '100%';
      doodleElement.style.display = 'block';

      // Clear and append
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(doodleElement);

      console.log('[CssDoodleBackground] css-doodle element appended to container');
    } catch (error) {
      console.error('[CssDoodleBackground] Failed to create css-doodle element:', error);
    }

    return () => {
      // Cleanup on unmount or schema change
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [schema.grid, schema.seed, schema.rules, schema.vars]);

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
}
