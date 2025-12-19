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

import { useState, useEffect, useMemo } from 'react';
import { Box, Typography, CircularProgress, alpha, useTheme } from '@mui/material';

interface ThinkingIndicatorProps {
  /** When true, the indicator is shown */
  isVisible: boolean;
}

// Random verbs for variety (similar to Claude Code)
const THINKING_VERBS = [
  'Thinking',
  'Analyzing',
  'Processing',
  'Generating',
  'Contemplating',
  'Formulating',
  'Composing',
  'Reasoning',
  'Evaluating',
  'Synthesizing',
];

/**
 * ThinkingIndicator Component
 *
 * Displays an animated message with:
 * - Random verb (like Claude Code)
 * - Cycling dots (1 to 3 dots)
 * - Elapsed time counter in seconds on a separate line
 */
export function ThinkingIndicator({ isVisible }: ThinkingIndicatorProps) {
  const theme = useTheme();
  const [dotCount, setDotCount] = useState(1);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Pick a random verb when the indicator becomes visible
  const verb = useMemo(() => {
    return THINKING_VERBS[Math.floor(Math.random() * THINKING_VERBS.length)];
  }, [isVisible]); // Re-randomize when visibility changes

  // Animate dots: cycle from 1 to 3 dots
  useEffect(() => {
    if (!isVisible) {
      setDotCount(1);
      return;
    }

    const interval = setInterval(() => {
      setDotCount(prev => {
        if (prev >= 3) return 0; // Go from 3 dots to no dots
        return prev + 1;
      });
    }, 400); // Change dots every 400ms

    return () => clearInterval(interval);
  }, [isVisible]);

  // Timer: count elapsed time in tenths of a second
  useEffect(() => {
    if (!isVisible) {
      setElapsedTime(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 0.1);
    }, 100); // Update every 100ms for .x precision

    return () => clearInterval(interval);
  }, [isVisible]);

  if (!isVisible) return null;

  const dots = '.'.repeat(dotCount);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        py: 2,
        px: 3,
        mb: 2,
        bgcolor: alpha(theme.palette.primary.main, 0.05),
        borderRadius: 2,
        border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
      }}
    >
      <CircularProgress
        size={20}
        thickness={5}
        sx={{ color: theme.palette.primary.main }}
      />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        <Typography
          variant="body2"
          sx={{
            color: theme.palette.text.secondary,
            fontStyle: 'italic',
            minWidth: '100px', // Prevent layout shift as dots change
          }}
        >
          {verb}{dots}
        </Typography>
        {elapsedTime > 0 && (
          <Typography
            variant="caption"
            sx={{
              color: theme.palette.text.disabled,
              fontSize: '0.7rem',
            }}
          >
            {elapsedTime.toFixed(1)}s
          </Typography>
        )}
      </Box>
    </Box>
  );
}
