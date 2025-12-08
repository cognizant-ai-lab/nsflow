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

import {
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormHelperText,
} from '@mui/material';
import { WidgetFieldProps } from '../../../types/cruse';
import { getSelectOptions } from '../../../utils/cruse';

/**
 * Radio button group widget for enum fields.
 * Supports enum and oneOf schema definitions.
 * Direction can be configured via x-ui.direction ('row' or 'column').
 */
export function RadioGroupField({
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
  const options = getSelectOptions(schema);

  // Support x-ui extensions for direction configuration
  const xUi = (schema as Record<string, unknown>)['x-ui'] as Record<string, unknown> | undefined;
  const direction = (xUi?.direction as 'row' | 'column' | undefined) || 'column';

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedValue = event.target.value;

    // Try to parse as number if all options are numbers
    const allNumbers = options.every((opt) => typeof opt.value === 'number');
    if (allNumbers && !isNaN(Number(selectedValue))) {
      onChange(Number(selectedValue));
    } else {
      onChange(selectedValue);
    }
  };

  return (
    <FormControl
      component="fieldset"
      error={!!error}
      required={required}
      disabled={disabled}
      fullWidth
      sx={{ mb: 2 }}
    >
      <FormLabel component="legend">{label}</FormLabel>
      <RadioGroup
        name={name}
        value={value ?? ''}
        onChange={handleChange}
        row={direction === 'row'}
      >
        {options.map((option) => (
          <FormControlLabel
            key={String(option.value)}
            value={option.value}
            control={<Radio />}
            label={option.label}
          />
        ))}
      </RadioGroup>
      {(error || description) && (
        <FormHelperText>{error || description}</FormHelperText>
      )}
    </FormControl>
  );
}
