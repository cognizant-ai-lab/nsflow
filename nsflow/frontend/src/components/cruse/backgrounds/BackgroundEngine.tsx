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

import { useState, useEffect } from 'react';
import { Box } from '@mui/material';
import { CssDoodleBackground } from './CssDoodleBackground';
import { TrianglifyBackground } from './TrianglifyBackground';
import { GradientBackground } from './GradientBackground';
import type { BackgroundSchema } from './types';
import { isCssDoodleSchema, isTrianglifySchema, isGradientSchema } from './types';

export interface BackgroundEngineProps {
  /** Background schema from agent theme */
  schema: BackgroundSchema | null;
  /** Enable transition animation when schema changes */
  enableTransition?: boolean;
}

/**
 * BackgroundEngine Component
 *
 * Main orchestrator for CRUSE dynamic/static backgrounds.
 * Interprets agent theme schemas and dispatches to the appropriate
 * background component (CssDoodle, Trianglify, or Gradient).
 *
 * Features:
 * - Schema-driven rendering
 * - Smooth transitions between backgrounds
 * - Fallback to simple gradient on errors
 * - Respects prefers-reduced-motion (converts dynamic to gradient)
 */
export function BackgroundEngine({
  schema,
  enableTransition = true,
}: BackgroundEngineProps) {
  const [currentSchema, setCurrentSchema] = useState<BackgroundSchema | null>(schema);

  // Check for prefers-reduced-motion
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (!schema) {
      setCurrentSchema(null);
      return;
    }

    // If prefers-reduced-motion, convert dynamic css-doodle to simple gradient
    if (prefersReducedMotion && isCssDoodleSchema(schema)) {
      // Extract colors from vars if available, otherwise use defaults
      const bg = schema.vars?.['--bg'] || '#0f172a';
      const accent = schema.vars?.['--accent'] || '#1e40af';

      setCurrentSchema({
        type: 'gradient',
        mode: 'linear',
        angle: '135deg',
        colors: [
          { color: bg, stop: '0%' },
          { color: accent, stop: '100%' },
        ],
      });
      return;
    }

    // Update schema immediately (no transition for now)
    setCurrentSchema(schema);
  }, [schema, prefersReducedMotion, enableTransition]);

  if (!currentSchema) {
    return null;
  }

  return (
    <Box
      sx={{
        position: 'relative', // expects relative positioning
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        pointerEvents: 'none',
        opacity: 1,
      }}
    >
      {renderBackground(currentSchema)}
    </Box>
  );
}

/**
 * Renders the appropriate background component based on schema type
 */
function renderBackground(schema: BackgroundSchema): JSX.Element | null {
  try {
    if (isCssDoodleSchema(schema)) {
      return <CssDoodleBackground schema={schema} />;
    }

    if (isTrianglifySchema(schema)) {
      return <TrianglifyBackground schema={schema} />;
    }

    if (isGradientSchema(schema)) {
      return <GradientBackground schema={schema} />;
    }

    return null;
  } catch (error) {
    console.error('[BackgroundEngine] Failed to render background:', error);

    // Fallback to simple gradient on error
    return (
      <GradientBackground
        schema={{
          type: 'gradient',
          mode: 'linear',
          angle: '135deg',
          colors: [
            { color: '#0f172a', stop: '0%' },
            { color: '#1e293b', stop: '100%' },
          ],
        }}
      />
    );
  }
}
