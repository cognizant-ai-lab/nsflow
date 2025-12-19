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

import { Box, FormLabel, Slider, FormHelperText, Typography } from '@mui/material';
import { WidgetFieldProps } from '../../../types/cruse';

/**
 * Slider widget for numeric range input.
 * Uses JSON Schema minimum, maximum, and multipleOf (step).
 * Displays current value and allows drag-based selection.
 */
export function SliderField({
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
  const minimum = schema.minimum ?? 0;
  const maximum = schema.maximum ?? 100;
  const step = schema.multipleOf ?? 1;

  // Support x-ui extensions for marks and value label display
  const xUi = (schema as Record<string, unknown>)['x-ui'] as Record<string, unknown> | undefined;
  const showMarks = (xUi?.showMarks as boolean | undefined) ?? false;
  const valueLabelDisplay = (xUi?.valueLabelDisplay as 'auto' | 'on' | 'off' | undefined) ?? 'auto';

  const numericValue = typeof value === 'number' ? value : minimum;

  const handleChange = (_event: Event, newValue: number | number[]) => {
    const val = Array.isArray(newValue) ? newValue[0] : newValue;
    onChange(val);
  };

  return (
    <Box sx={{ mb: 2, px: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <FormLabel error={!!error}>
          {label}{required ? ' *' : ''}
        </FormLabel>
        <Typography variant="body2" color="primary" fontWeight="bold">
          {numericValue}
        </Typography>
      </Box>

      <Slider
        name={name}
        value={numericValue}
        onChange={handleChange}
        min={minimum}
        max={maximum}
        step={step}
        marks={showMarks}
        valueLabelDisplay={valueLabelDisplay}
        disabled={disabled}
        color={error ? 'error' : 'primary'}
        sx={{ mt: 1 }}
      />

      {(error || description) && (
        <FormHelperText error={!!error}>
          {error || description}
        </FormHelperText>
      )}
    </Box>
  );
}
