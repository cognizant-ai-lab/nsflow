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

import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  Button,
  Collapse,
  IconButton,
  alpha,
  useTheme,
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { WidgetCardDefinition } from '../../types/cruse';
import { WidgetFormRenderer } from './WidgetFormRenderer';
import { resolveIcon } from '../../utils/cruse';
import { validateSchema } from '../../utils/cruse';
import { useSnackbar } from '../../context/SnackbarContext';

export interface DynamicWidgetCardProps {
  /** Widget definition from agent */
  widget: WidgetCardDefinition;
  /** Callback when form is submitted */
  onSubmit: (data: Record<string, unknown>) => void;
  /** Optional submit button text */
  submitText?: string;
  /** Whether the card is initially expanded */
  defaultExpanded?: boolean;
  /** Whether the submit button should be disabled (for old widgets) */
  disabled?: boolean;
  /** Optional callback when form data changes (for parent to track current state) */
  onFormDataChange?: (data: Record<string, unknown>) => void;
}

/**
 * DynamicWidgetCard
 *
 * Beautiful MUI card wrapper for dynamic forms.
 * Includes icon, title, collapsible content, and submit button.
 */
export function DynamicWidgetCard({
  widget,
  onSubmit,
  submitText = 'Submit',
  defaultExpanded = true,
  disabled = false,
  onFormDataChange,
}: DynamicWidgetCardProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const theme = useTheme();
  const { showSnackbar } = useSnackbar();

  const { title, description, icon, color = '#9c27b0', schema } = widget;
  const IconComponent = resolveIcon(icon);

  // Call onFormDataChange whenever formData changes
  React.useEffect(() => {
    if (onFormDataChange) {
      onFormDataChange(formData);
    }
  }, [formData, onFormDataChange]);

  // Create theme-aware gradient background
  const isDarkMode = theme.palette.mode === 'dark';
  const gradientStart = alpha(color, isDarkMode ? 0.2 : 0.15);
  const gradientEnd = isDarkMode
    ? alpha(theme.palette.background.paper, 0.6)
    : alpha('#ffffff', 0.8);

  const handleSubmit = async () => {
    // Don't submit if widget is disabled
    if (disabled) {
      return;
    }

    // Check if form is completely empty
    const hasAnyData = Object.keys(formData).length > 0 &&
      Object.values(formData).some(value => {
        if (value === null || value === undefined || value === '') return false;
        if (Array.isArray(value) && value.length === 0) return false;
        return true;
      });

    if (!hasAnyData) {
      showSnackbar({
        message: 'Please fill out at least one field before submitting',
        severity: 'warning',
      });
      return;
    }

    // Validate before submitting
    const validation = validateSchema(schema, formData);

    if (!validation.valid) {
      console.error('Validation failed:', validation.errorMessage);
      showSnackbar({
        message: `Validation failed: ${validation.errorMessage}`,
        severity: 'error',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card
      sx={{
        maxWidth: 600,
        borderRadius: 3,
        borderLeft: `6px solid ${color}`,
        boxShadow: isDarkMode
          ? '0 4px 12px rgba(0, 0, 0, 0.4)'
          : '0 4px 12px rgba(0, 0, 0, 0.1)',
        transition: 'all 0.3s ease',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: isDarkMode
            ? '0 8px 24px rgba(0, 0, 0, 0.6)'
            : '0 8px 24px rgba(0, 0, 0, 0.15)',
        },
        mb: 2,
        background: `linear-gradient(135deg, ${gradientStart} 0%, ${gradientEnd} 100%)`,
      }}
    >
      <CardContent sx={{ p: 3 }}>
        {/* Header */}
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          mb={expanded ? 2 : 0}
          sx={{ cursor: 'pointer' }}
          onClick={() => setExpanded(!expanded)}
        >
          <Box display="flex" alignItems="center" gap={1.5}>
            {IconComponent && (
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: alpha(color, 0.4),
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    backgroundColor: alpha(color, 0.2),
                    transform: 'scale(1.05)',
                  },
                }}
              >
                <IconComponent sx={{ color, fontSize: 28 }} />
              </Box>
            )}
            <Box>
              <Typography variant="h6" fontWeight="bold" sx={{ lineHeight: 1.2, color: 'text.secondary' }}>
                {title}
              </Typography>
              {description && !expanded && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  Click to expand
                </Typography>
              )}
            </Box>
          </Box>
          <IconButton
            size="small"
            sx={{
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.3s',
              backgroundColor: alpha(color, 0.2),
              '&:hover': {
                backgroundColor: alpha(color, 0.15),
              },
            }}
          >
            <ExpandMoreIcon />
          </IconButton>
        </Box>

        {description && expanded && (
          <Box
            sx={{
              backgroundColor: alpha(color, 0.05),
              borderRadius: 1.5,
              p: 1.5,
              mb: 2,
              borderLeft: `3px solid ${color}`,
            }}
          >
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontStyle: 'italic' }}
            >
              {description}
            </Typography>
          </Box>
        )}

        {/* Form Content */}
        <Collapse in={expanded}>
          <Box>
            <WidgetFormRenderer
              schema={schema}
              onChange={setFormData}
            />

            <Button
              variant="contained"
              fullWidth
              onClick={handleSubmit}
              disabled={isSubmitting || disabled}
              sx={{
                mt: 3,
                py: 1.5,
                borderRadius: 2,
                backgroundColor: color,
                fontSize: '1rem',
                fontWeight: 600,
                textTransform: 'none',
                boxShadow: `0 4px 12px ${alpha(color, 0.3)}`,
                transition: 'all 0.3s ease',
                '&:hover': {
                  backgroundColor: alpha(color, 0.9),
                  boxShadow: `0 6px 16px ${alpha(color, 0.4)}`,
                  transform: 'translateY(-2px)',
                },
                '&:disabled': {
                  backgroundColor: alpha(color, 0.3),
                  color: alpha(theme.palette.getContrastText(color), 0.5),
                  cursor: 'not-allowed',
                },
              }}
            >
              {isSubmitting ? 'Submitting...' : disabled ? 'Submit' : submitText}
            </Button>
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
}
