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

import { useState } from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  Button,
  Collapse,
  IconButton,
  alpha,
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { WidgetCardDefinition } from '../../types/cruse';
import { WidgetFormRenderer } from './WidgetFormRenderer';
import { resolveIcon } from '../../utils/cruse';
import { validateSchema } from '../../utils/cruse';

export interface DynamicWidgetCardProps {
  /** Widget definition from agent */
  widget: WidgetCardDefinition;
  /** Callback when form is submitted */
  onSubmit: (data: Record<string, unknown>) => void;
  /** Optional submit button text */
  submitText?: string;
  /** Whether the card is initially expanded */
  defaultExpanded?: boolean;
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
}: DynamicWidgetCardProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { title, description, icon, color = '#9c27b0', schema } = widget;
  const IconComponent = resolveIcon(icon);

  const handleSubmit = async () => {
    // Validate before submitting
    const validation = validateSchema(schema, formData);

    if (!validation.valid) {
      console.error('Validation failed:', validation.errorMessage);
      alert(`Please fix the following errors:\n${validation.errorMessage}`);
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
        maxWidth: 500,
        borderRadius: 2,
        borderTop: `4px solid ${color}`,
        boxShadow: 3,
        transition: 'all 0.3s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 6,
        },
        mb: 2,
      }}
    >
      <CardContent>
        {/* Header */}
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          mb={expanded ? 2 : 0}
          sx={{ cursor: 'pointer' }}
          onClick={() => setExpanded(!expanded)}
        >
          <Box display="flex" alignItems="center" gap={1}>
            {IconComponent && (
              <IconComponent sx={{ color, fontSize: 28 }} />
            )}
            <Typography variant="h6" fontWeight="bold">
              {title}
            </Typography>
          </Box>
          <IconButton
            size="small"
            sx={{
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.3s',
            }}
          >
            <ExpandMoreIcon />
          </IconButton>
        </Box>

        {description && expanded && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 2 }}
          >
            {description}
          </Typography>
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
              disabled={isSubmitting}
              sx={{
                mt: 2,
                backgroundColor: color,
                '&:hover': {
                  backgroundColor: alpha(color, 0.8),
                },
              }}
            >
              {isSubmitting ? 'Submitting...' : submitText}
            </Button>
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
}
