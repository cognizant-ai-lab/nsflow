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

import { useState, useCallback } from 'react';
import { Box } from '@mui/material';
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

  return (
    <Box>
      {Object.entries(schema.properties).map(([propertyName, propertySchema]) => {
        if (typeof propertySchema === 'boolean') {
          return null; // Skip boolean schemas
        }

        const fieldSchema = propertySchema as JSONSchema7;
        const widgetType = getWidgetType(fieldSchema);
        const WidgetComponent = widgetRegistry[widgetType];

        if (!WidgetComponent) {
          console.warn(`No widget found for type: ${widgetType}`);
          return null;
        }

        const label = getFieldLabel(propertyName, fieldSchema);
        const required = isFieldRequired(propertyName, schema);
        const value = formData[propertyName];
        const error = errors[propertyName];

        return (
          <WidgetComponent
            key={propertyName}
            name={propertyName}
            label={label}
            required={required}
            value={value}
            onChange={(newValue: unknown) => handleFieldChange(propertyName, newValue)}
            error={error}
            schema={fieldSchema}
          />
        );
      })}
    </Box>
  );
}
