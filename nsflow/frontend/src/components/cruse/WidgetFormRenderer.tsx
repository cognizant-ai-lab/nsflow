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

import { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Tooltip } from '@mui/material';
import { InfoOutlined as InfoIcon } from '@mui/icons-material';
import { JSONSchema7 } from 'json-schema';
import { widgetRegistry } from './widgets';
import {
  getWidgetType,
  getFieldLabel,
  isFieldRequired,
  validateField,
  getDefaultValues,
} from '../../utils/cruse';

export interface WidgetFormRendererProps {
  /** JSON Schema definition for the form */
  schema: JSONSchema7;
  /** Callback when form data changes */
  onChange: (data: Record<string, unknown>) => void;
  /** Initial form data */
  initialData?: Record<string, unknown>;
}

/**
 * WidgetFormRenderer
 *
 * Dynamically renders form fields based on JSON Schema.
 * Uses the widget registry to map schema types to React components.
 */
export function WidgetFormRenderer({
  schema,
  onChange,
  initialData,
}: WidgetFormRendererProps) {
  // Initialize form data with defaults or provided initial data
  const [formData, setFormData] = useState<Record<string, unknown>>(() => {
    const defaults = getDefaultValues(schema);
    return { ...defaults, ...initialData };
  });

  // Push initial defaults to parent on mount
  const didPushInitial = useRef(false);
  useEffect(() => {
    if (!didPushInitial.current) {
      didPushInitial.current = true;
      onChange(formData);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Track validation errors per field
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Handle field value change
  const handleFieldChange = useCallback(
    (fieldName: string, value: unknown) => {
      const newFormData = { ...formData, [fieldName]: value };
      setFormData(newFormData);

      // Validate field
      const validation = validateField(schema, fieldName, value);
      if (validation.valid) {
        // Clear error for this field
        const newErrors = { ...errors };
        delete newErrors[fieldName];
        setErrors(newErrors);
      } else {
        // Set error for this field
        setErrors({
          ...errors,
          [fieldName]: validation.errorMessage || 'Invalid value',
        });
      }

      // Notify parent of change
      onChange(newFormData);
    },
    [formData, errors, schema, onChange]
  );

  // Render form fields from schema properties
  if (!schema.properties) {
    return null;
  }

  // Determine if a field is compact enough to share a row (half-width)
  const isCompactField = (fieldSchema: JSONSchema7, widgetType: string): boolean => {
    // Text/textarea/string fields are always half-width
    if (widgetType === 'text' || widgetType === 'textarea') return true;

    // Select/multiselect: check the longest single option label
    if ((widgetType === 'select' || widgetType === 'multiselect') && fieldSchema.enum) {
      const maxOptLen = Math.max(...fieldSchema.enum.map(opt => String(opt).length));
      if (maxOptLen > 30) return false;
    }

    // Label length check — very long labels need full width
    const title = fieldSchema.title || '';
    if (title.length > 30) return false;

    return true;
  };

  // Build field entries with their metadata
  const fieldEntries = Object.entries(schema.properties)
    .filter(([, ps]) => typeof ps !== 'boolean')
    .map(([propertyName, propertySchema]) => {
      const fieldSchema = propertySchema as JSONSchema7;
      const widgetType = getWidgetType(fieldSchema);
      return { propertyName, fieldSchema, widgetType, compact: isCompactField(fieldSchema, widgetType) };
    });

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, columnGap: 1, mb: -1 }}>
      {fieldEntries.map(({ propertyName, fieldSchema, widgetType, compact }) => {
        const WidgetComponent = widgetRegistry[widgetType];

        if (!WidgetComponent) {
          console.warn(`No widget found for type: ${widgetType}`);
          return null;
        }

        const label = getFieldLabel(propertyName, fieldSchema);
        const required = isFieldRequired(propertyName, schema);
        const value = formData[propertyName];
        const error = errors[propertyName];
        const description = fieldSchema.description;

        return (
          <Box
            key={propertyName}
            sx={{
              gridColumn: compact ? 'span 1' : 'span 2',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 0.5,
            }}
          >
            <Box sx={{ flex: 1 }}>
              <WidgetComponent
                name={propertyName}
                label={label}
                required={required}
                value={value}
                onChange={(newValue: unknown) => handleFieldChange(propertyName, newValue)}
                error={error}
                schema={fieldSchema}
              />
            </Box>
            {description && (
              <Tooltip title={description} placement="right" arrow>
                <InfoIcon sx={{ fontSize: 16, opacity: 0.4, cursor: 'help', mt: 1.25, flexShrink: 0, '&:hover': { opacity: 0.8 } }} />
              </Tooltip>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
