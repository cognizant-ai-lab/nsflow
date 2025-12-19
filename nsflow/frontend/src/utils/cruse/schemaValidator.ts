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

import Ajv, { ErrorObject, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { JSONSchema7 } from 'json-schema';

// Create singleton Ajv instance
const ajv = new Ajv({
  allErrors: true,
  verbose: true,
  strict: false,
  $data: true,
});

// Add standard formats (email, uri, date, etc.)
addFormats(ajv);

// Cache for compiled validators
const validatorCache = new Map<string, ValidateFunction>();

/**
 * Validation result type
 */
export interface ValidationResult {
  valid: boolean;
  errors?: ErrorObject[];
  errorMessage?: string;
}

/**
 * Preprocesses date fields to convert ISO datetime strings to YYYY-MM-DD format.
 * AJV's "date" format expects YYYY-MM-DD, but DatePicker provides full ISO strings.
 *
 * @param schema - JSON Schema
 * @param data - Data to preprocess
 * @returns Processed data with date fields converted
 */
function preprocessDateFields(schema: JSONSchema7, data: unknown): unknown {
  if (!data || typeof data !== 'object' || !schema.properties) {
    return data;
  }

  const processed = { ...data } as Record<string, unknown>;

  Object.entries(schema.properties).forEach(([key, propSchema]) => {
    if (typeof propSchema === 'object' && propSchema.format === 'date') {
      const value = processed[key];
      if (typeof value === 'string' && value) {
        try {
          // Convert ISO datetime string to YYYY-MM-DD
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            processed[key] = date.toISOString().split('T')[0];
          }
        } catch {
          // Keep original value if conversion fails
        }
      }
    }
  });

  return processed;
}

/**
 * Validates data against a JSON Schema.
 *
 * @param schema - JSON Schema to validate against
 * @param data - Data to validate
 * @returns Validation result with errors if any
 *
 * @example
 * const result = validateSchema(widgetSchema, formData);
 * if (!result.valid) {
 *   console.error('Validation failed:', result.errorMessage);
 * }
 */
export function validateSchema(schema: JSONSchema7, data: unknown): ValidationResult {
  try {
    // Preprocess data to convert date-time ISO strings to date format for AJV
    const processedData = preprocessDateFields(schema, data);

    // Get or create validator
    const schemaKey = JSON.stringify(schema);
    let validate = validatorCache.get(schemaKey);

    if (!validate) {
      validate = ajv.compile(schema);
      validatorCache.set(schemaKey, validate);
    }

    const valid = validate(processedData);

    if (!valid && validate.errors) {
      return {
        valid: false,
        errors: validate.errors,
        errorMessage: formatValidationErrors(validate.errors),
      };
    }

    return { valid: true };
  } catch (error) {
    console.error('Schema validation error:', error);
    return {
      valid: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown validation error',
    };
  }
}

/**
 * Formats Ajv validation errors into a human-readable message.
 *
 * @param errors - Array of Ajv error objects
 * @returns Formatted error message
 */
export function formatValidationErrors(errors: ErrorObject[]): string {
  return errors
    .map((error) => {
      const field = error.instancePath.replace(/^\//, '').replace(/\//g, '.');
      const fieldName = field || 'root';

      switch (error.keyword) {
        case 'required':
          return `${error.params.missingProperty} is required`;
        case 'type':
          return `${fieldName} must be of type ${error.params.type}`;
        case 'minimum':
          return `${fieldName} must be at least ${error.params.limit}`;
        case 'maximum':
          return `${fieldName} must be at most ${error.params.limit}`;
        case 'minLength':
          return `${fieldName} must be at least ${error.params.limit} characters`;
        case 'maxLength':
          return `${fieldName} must be at most ${error.params.limit} characters`;
        case 'pattern':
          return `${fieldName} must match the pattern`;
        case 'enum':
          return `${fieldName} must be one of: ${error.params.allowedValues.join(', ')}`;
        case 'format':
          return `${fieldName} must be a valid ${error.params.format}`;
        default:
          return error.message || 'Validation error';
      }
    })
    .join('; ');
}

/**
 * Validates a specific field against its schema property.
 *
 * @param schema - JSON Schema
 * @param fieldName - Name of the field to validate
 * @param value - Field value
 * @returns Validation result
 */
export function validateField(
  schema: JSONSchema7,
  fieldName: string,
  value: unknown
): ValidationResult {
  if (!schema.properties || !schema.properties[fieldName]) {
    return { valid: true }; // No schema for field, assume valid
  }

  const fieldSchema = schema.properties[fieldName];
  if (typeof fieldSchema === 'boolean') {
    return { valid: true };
  }

  // Check if required
  const isRequired = Array.isArray(schema.required) && schema.required.includes(fieldName);

  if (isRequired && (value === null || value === undefined || value === '')) {
    return {
      valid: false,
      errorMessage: `${fieldName} is required`,
    };
  }

  // Skip validation for empty non-required fields
  if (!isRequired && (value === null || value === undefined || value === '')) {
    return { valid: true };
  }

  // Special handling for date/date-time fields to avoid format validation issues during input
  if (fieldSchema.format === 'date' || fieldSchema.format === 'date-time') {
    // Allow valid ISO strings or Date objects
    if (typeof value === 'string') {
      try {
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          return {
            valid: false,
            errorMessage: `${fieldName} must be a valid date`,
          };
        }
        return { valid: true };
      } catch {
        return {
          valid: false,
          errorMessage: `${fieldName} must be a valid date`,
        };
      }
    }
    // Value is being processed, skip validation
    return { valid: true };
  }

  // Validate against field schema
  return validateSchema(fieldSchema as JSONSchema7, value);
}

/**
 * Extracts default values from JSON Schema.
 * Useful for initializing form state.
 *
 * @param schema - JSON Schema
 * @returns Object with default values for each property
 */
export function getDefaultValues(schema: JSONSchema7): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};

  if (!schema.properties) {
    return defaults;
  }

  Object.entries(schema.properties).forEach(([key, propSchema]) => {
    if (typeof propSchema === 'object' && 'default' in propSchema) {
      defaults[key] = propSchema.default;
    } else if (typeof propSchema === 'object') {
      // Set type-based defaults
      const type = propSchema.type;
      if (type === 'string') {
        defaults[key] = '';
      } else if (type === 'number' || type === 'integer') {
        defaults[key] = 0;
      } else if (type === 'boolean') {
        defaults[key] = false;
      } else if (type === 'array') {
        defaults[key] = [];
      } else if (type === 'object') {
        defaults[key] = {};
      }
    }
  });

  return defaults;
}

/**
 * Clears the validator cache.
 * Useful for testing or if schemas are updated dynamically.
 */
export function clearValidatorCache(): void {
  validatorCache.clear();
}
