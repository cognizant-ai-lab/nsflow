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

import { TextField as MuiTextField } from '@mui/material';
import { WidgetFieldProps } from '../../../types/cruse';

/**
 * Multi-line text input widget for string fields.
 * Supports minLength, maxLength, and pattern validation.
 * Configurable rows via x-ui.rows (defaults to 4).
 */
export function TextareaField({
  name,
  label,
  required = false,
  disabled = false,
  value,
  onChange,
  error,
  schema,
}: WidgetFieldProps) {
  const description = schema.description;
  const placeholder =
    schema.examples && Array.isArray(schema.examples)
      ? (schema.examples[0] as string | undefined)
      : undefined;
  const minLength = schema.minLength;
  const maxLength = schema.maxLength;
  const pattern = schema.pattern;

  // Support x-ui extensions for rows configuration
  const xUi = (schema as Record<string, unknown>)['x-ui'] as Record<string, unknown> | undefined;
  const rows = (xUi?.rows as number | undefined) || 4;
  const minRows = (xUi?.minRows as number | undefined) || rows;
  const maxRows = xUi?.maxRows as number | undefined;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
  };

  return (
    <MuiTextField
      fullWidth
      multiline
      name={name}
      label={label}
      required={required}
      disabled={disabled}
      value={value || ''}
      onChange={handleChange}
      error={!!error}
      helperText={error || description}
      placeholder={placeholder}
      rows={rows}
      minRows={minRows}
      maxRows={maxRows}
      inputProps={{
        minLength,
        maxLength,
        pattern,
      }}
      variant="outlined"
      size="small"
      sx={{ mb: 2 }}
    />
  );
}
