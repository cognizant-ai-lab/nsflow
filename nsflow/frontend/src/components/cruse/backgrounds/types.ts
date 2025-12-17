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
 * Background schema types for CRUSE dynamic/static backgrounds
 */

import type React from 'react';

// TypeScript declarations for css-doodle Web Component
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'css-doodle': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        /** Grid size: "10" (10x10), "12x8" (12 cols x 8 rows), "20 / 100vmax" (20x20 with size) */
        grid?: string;
        /** Seed for deterministic random patterns: "agent:my_agent" */
        seed?: string;
        /** Reference to CSS custom property containing rules: "var(--my-rules)" */
        use?: string;
        /** Click to update pattern */
        'click-to-update'?: boolean;
      };
    }
  }
}

// Base schema with common properties
export interface BaseBackgroundSchema {
  type: string;
  theme?: 'light' | 'dark';
  intensity?: 'subtle' | 'normal' | 'strong';
}

// css-doodle dynamic background schema
// Uses css-doodle Web Component for generative CSS patterns
// Docs: https://css-doodle.com/
export interface CssDoodleBackgroundSchema extends BaseBackgroundSchema {
  type: 'css-doodle';
  /** Grid size: "10" (10x10), "12x8" (12 cols x 8 rows), "20 / 100vmax" (20x20 with size) */
  grid?: string;
  /** Seed for deterministic patterns: "agent:my_agent" */
  seed?: string;
  /** CSS-like DSL with special functions: @grid, @rand(), @p(), @shape, @size, @place */
  rules: string;
  /** CSS custom properties for theme colors: { "--bg": "#0f172a", "--accent": "#3b82f6" } */
  vars?: Record<string, string>;
}

// Trianglify static background schema
export interface TrianglifyBackgroundSchema extends BaseBackgroundSchema {
  type: 'trianglify';
  width?: number;
  height?: number;
  cellSize?: number;
  variance?: number;
  seed?: string | null;
  xColors?: string[] | string;
  yColors?: string[] | string;
  fill?: boolean;
  strokeWidth?: number;
  colorSpace?: 'lab' | 'rgb' | 'hsv';
}

// CSS Gradient background schema
export interface GradientBackgroundSchema extends BaseBackgroundSchema {
  type: 'gradient';
  mode: 'linear' | 'radial' | 'conic';
  angle?: string; // For linear gradients (e.g., "135deg")
  shape?: 'circle' | 'ellipse'; // For radial gradients
  colors: Array<{
    color: string;
    stop: string; // e.g., "0%", "50%", "100%"
  }>;
}

// Union type for all background schemas
export type BackgroundSchema =
  | CssDoodleBackgroundSchema
  | TrianglifyBackgroundSchema
  | GradientBackgroundSchema;

// Type guard functions
export function isCssDoodleSchema(schema: BackgroundSchema): schema is CssDoodleBackgroundSchema {
  return schema.type === 'css-doodle';
}

export function isTrianglifySchema(schema: BackgroundSchema): schema is TrianglifyBackgroundSchema {
  return schema.type === 'trianglify';
}

export function isGradientSchema(schema: BackgroundSchema): schema is GradientBackgroundSchema {
  return schema.type === 'gradient';
}
