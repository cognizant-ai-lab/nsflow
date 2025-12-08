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

import { FC } from 'react';
import { JSONSchema7, JSONSchema7TypeName } from 'json-schema';
import { WidgetFieldProps, WidgetFieldType } from '../../types/cruse';

/**
 * Widget registry type
 */
export type WidgetRegistry = Record<WidgetFieldType, FC<WidgetFieldProps>>;

/**
 * Determines the widget type from JSON Schema property.
 *
 * @param schema - JSON Schema property
 * @returns Widget field type
 */
export function getWidgetType(schema: JSONSchema7): WidgetFieldType {
  const type = schema.type as JSONSchema7TypeName | undefined;

  // Check for x-ui widget hint (highest priority)
  const xUi = (schema as Record<string, unknown>)['x-ui'] as Record<string, unknown> | undefined;
  if (xUi?.widget) {
    const widgetHint = xUi.widget as string;
    // Map known widget hints to WidgetFieldType
    if (['text', 'textarea', 'number', 'boolean', 'select', 'radio', 'checkbox', 'multiselect', 'date', 'slider', 'rating', 'file'].includes(widgetHint)) {
      return widgetHint as WidgetFieldType;
    }
  }

  // Handle enum as select (or radio if specified in x-ui)
  if (schema.enum && schema.enum.length > 0) {
    return 'select';
  }

  // Handle format-based widgets
  if (schema.format === 'date' || schema.format === 'date-time') {
    return 'date';
  }

  // Handle type-based widgets
  switch (type) {
    case 'boolean':
      return 'boolean';

    case 'integer':
    case 'number':
      // Check if it's a range/slider
      if (
        schema.minimum !== undefined &&
        schema.maximum !== undefined &&
        schema.multipleOf !== undefined
      ) {
        return 'slider';
      }
      return 'number';

    case 'string':
      // Check for multiselect
      if (schema.items && Array.isArray(schema.items)) {
        return 'multiselect';
      }
      return 'text';

    case 'array':
      // Array of strings with enum = multiselect
      if (
        typeof schema.items === 'object' &&
        !Array.isArray(schema.items) &&
        schema.items.enum
      ) {
        return 'multiselect';
      }
      return 'text'; // Default for complex arrays

    default:
      return 'text';
  }
}

/**
 * Checks if a schema property represents a file upload.
 *
 * @param schema - JSON Schema property
 * @returns true if it's a file upload field
 */
export function isFileUpload(schema: JSONSchema7): boolean {
  return (
    schema.format === 'data-url' ||
    schema.format === 'binary' ||
    schema.contentMediaType !== undefined ||
    (typeof schema.type === 'string' && schema.type === 'string' && schema.format === 'uri')
  );
}

/**
 * Gets the label for a schema property.
 * Uses title if available, otherwise formats the property name.
 *
 * @param propertyName - Property name
 * @param schema - JSON Schema property
 * @returns Formatted label
 */
export function getFieldLabel(propertyName: string, schema: JSONSchema7): string {
  if (schema.title) {
    return schema.title;
  }

  // Convert camelCase or snake_case to Title Case
  return propertyName
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

/**
 * Checks if a field is required.
 *
 * @param propertyName - Property name
 * @param parentSchema - Parent JSON Schema containing required array
 * @returns true if field is required
 */
export function isFieldRequired(propertyName: string, parentSchema: JSONSchema7): boolean {
  return Array.isArray(parentSchema.required) && parentSchema.required.includes(propertyName);
}

/**
 * Gets select options from enum or oneOf.
 *
 * @param schema - JSON Schema property
 * @returns Array of option objects
 */
export function getSelectOptions(
  schema: JSONSchema7
): Array<{ value: string | number; label: string }> {
  // Handle enum
  if (schema.enum) {
    return schema.enum.map((value) => ({
      value: value as string | number,
      label: String(value),
    }));
  }

  // Handle oneOf
  if (schema.oneOf && Array.isArray(schema.oneOf)) {
    return schema.oneOf
      .filter((item): item is JSONSchema7 => typeof item === 'object')
      .map((item, index) => ({
        value: (item.const as string | number) || index,
        label: item.title || String(item.const) || `Option ${index + 1}`,
      }));
  }

  return [];
}

/**
 * Extracts validation constraints from schema.
 *
 * @param schema - JSON Schema property
 * @returns Validation constraints object
 */
export function getValidationConstraints(schema: JSONSchema7): {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  step?: number;
} {
  return {
    min: schema.minimum,
    max: schema.maximum,
    minLength: schema.minLength,
    maxLength: schema.maxLength,
    pattern: schema.pattern,
    step: schema.multipleOf,
  };
}
