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
 * Number input widget for number and integer fields.
 * Supports minimum, maximum, and multipleOf validation.
 */
export function NumberField({
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
  const minimum = schema.minimum;
  const maximum = schema.maximum;
  const multipleOf = schema.multipleOf;
  const isInteger = schema.type === 'integer';

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = event.target.value;

    if (inputValue === '') {
      onChange(null);
      return;
    }

    const numValue = isInteger ? parseInt(inputValue, 10) : parseFloat(inputValue);

    if (!isNaN(numValue)) {
      onChange(numValue);
    }
  };

  return (
    <MuiTextField
      fullWidth
      type="number"
      name={name}
      label={label}
      required={required}
      disabled={disabled}
      value={value ?? ''}
      onChange={handleChange}
      error={!!error}
      helperText={error || description}
      inputProps={{
        min: minimum,
        max: maximum,
        step: multipleOf || (isInteger ? 1 : 'any'),
      }}
      variant="outlined"
      size="small"
      sx={{ mb: 2 }}
    />
  );
}
