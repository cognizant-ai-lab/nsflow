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

import { Box, FormLabel, Rating, FormHelperText } from '@mui/material';
import { Star as StarIcon } from '@mui/icons-material';
import { WidgetFieldProps } from '../../../types/cruse';

/**
 * Rating widget for star ratings.
 * Uses JSON Schema maximum for max rating (defaults to 5).
 * Supports precision (0.5, 1) via x-ui.precision.
 */
export function RatingField({
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
  const max = (schema.maximum as number | undefined) ?? 5;

  // Support x-ui extensions
  const xUi = (schema as Record<string, unknown>)['x-ui'] as Record<string, unknown> | undefined;
  const precision = (xUi?.precision as number | undefined) ?? 1;
  const size = (xUi?.size as 'small' | 'medium' | 'large' | undefined) ?? 'medium';

  const ratingValue = typeof value === 'number' ? value : 0;

  const handleChange = (_event: React.SyntheticEvent, newValue: number | null) => {
    onChange(newValue ?? 0);
  };

  return (
    <Box sx={{ mb: 2 }}>
      <FormLabel error={!!error}>
        {label}{required ? ' *' : ''}
      </FormLabel>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
        <Rating
          name={name}
          value={ratingValue}
          onChange={handleChange}
          max={max}
          precision={precision}
          size={size}
          disabled={disabled}
          icon={<StarIcon fontSize="inherit" />}
          emptyIcon={<StarIcon fontSize="inherit" />}
        />
        {ratingValue > 0 && (
          <Box component="span" sx={{ ml: 1, color: 'text.secondary' }}>
            {ratingValue} / {max}
          </Box>
        )}
      </Box>

      {(error || description) && (
        <FormHelperText error={!!error}>
          {error || description}
        </FormHelperText>
      )}
    </Box>
  );
}
