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

import { FormControl, FormHelperText } from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { WidgetFieldProps } from '../../../types/cruse';

/**
 * Date picker widget for date fields.
 * Supports format: "date" or "date-time" in JSON Schema.
 * Value is stored as ISO 8601 string.
 */
export function DateField({
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

  // Extract min/max from schema
  const xUi = (schema as Record<string, unknown>)['x-ui'] as Record<string, unknown> | undefined;
  const minDate = xUi?.minDate ? new Date(xUi.minDate as string) : undefined;
  const maxDate = xUi?.maxDate ? new Date(xUi.maxDate as string) : undefined;

  // Parse current value
  const dateValue = value ? new Date(value as string) : null;

  const handleChange = (newDate: Date | null) => {
    if (newDate) {
      // Store as ISO 8601 string
      onChange(newDate.toISOString());
    } else {
      onChange(null);
    }
  };

  return (
    <FormControl fullWidth error={!!error} sx={{ mb: 2 }}>
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <DatePicker
          label={label}
          value={dateValue}
          onChange={handleChange}
          disabled={disabled}
          minDate={minDate}
          maxDate={maxDate}
          slotProps={{
            textField: {
              name,
              required,
              error: !!error,
              helperText: error || description,
              variant: 'outlined',
              size: 'small',
            },
          }}
        />
      </LocalizationProvider>
      {!error && description && (
        <FormHelperText>{description}</FormHelperText>
      )}
    </FormControl>
  );
}
