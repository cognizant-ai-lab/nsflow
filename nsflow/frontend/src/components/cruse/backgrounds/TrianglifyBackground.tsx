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
import trianglify from 'trianglify';
import type { TrianglifyBackgroundSchema } from './types';

/**
 * TrianglifyBackground Component
 *
 * Renders static low-poly triangle mesh patterns using Trianglify.
 * Generates colorful geometric backgrounds based on agent-specific schemas.
 *
 * Uses SVG rendering for sharp, scalable patterns.
 */
export function TrianglifyBackground({ schema }: { schema: TrianglifyBackgroundSchema }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) {
      console.warn('[TrianglifyBackground] containerRef is null');
      return;
    }

    try {
      // Get container dimensions for responsive sizing
      const rect = containerRef.current.getBoundingClientRect();
      console.log('[TrianglifyBackground] Container dimensions:', {
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
      });

      // Generate trianglify pattern with schema options
      const pattern = trianglify({
        width: schema.width ?? rect.width,
        height: schema.height ?? rect.height,
        cellSize: schema.cellSize ?? 75,
        variance: schema.variance ?? 0.75,
        seed: schema.seed ?? null,
        xColors: schema.xColors ?? 'random',
        yColors: schema.yColors ?? 'match',
        fill: schema.fill ?? true,
        strokeWidth: schema.strokeWidth ?? 0,
        colorSpace: schema.colorSpace ?? 'lab',
      });

      // Trianglify 4.x returns an object with toCanvas() and toSVG() methods
      // Convert to canvas and then to data URL
      const canvas = pattern.toCanvas();
      const dataUrl = canvas.toDataURL();
      console.log('[TrianglifyBackground] Generated dataURL length:', dataUrl.length);

      containerRef.current.style.backgroundImage = `url(${dataUrl})`;
      containerRef.current.style.backgroundSize = 'cover';
      containerRef.current.style.backgroundPosition = 'center';
      containerRef.current.style.backgroundRepeat = 'no-repeat';

      console.log('[TrianglifyBackground] Background image applied to container');
      console.log('[TrianglifyBackground] Container computed style:', {
        backgroundImage: containerRef.current.style.backgroundImage.substring(0, 50) + '...',
        width: getComputedStyle(containerRef.current).width,
        height: getComputedStyle(containerRef.current).height,
        position: getComputedStyle(containerRef.current).position,
        zIndex: getComputedStyle(containerRef.current).zIndex,
      });

      console.log('[TrianglifyBackground] Generated pattern with seed:', schema.seed);
    } catch (error) {
      console.error('[TrianglifyBackground] Failed to generate pattern:', error);
    }
  }, [
    schema.width,
    schema.height,
    schema.cellSize,
    schema.variance,
    schema.seed,
    schema.xColors,
    schema.yColors,
    schema.fill,
    schema.strokeWidth,
    schema.colorSpace,
  ]);

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
