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

import { TextField as MuiTextField, MenuItem } from '@mui/material';
import { WidgetFieldProps } from '../../../types/cruse';
import { getSelectOptions } from '../../../utils/cruse';

/**
 * Select/dropdown widget for enum fields.
 * Supports enum and oneOf schema definitions.
 */
export function SelectField({
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

  const validValue = options.some((opt) => opt.value === value) ? value : '';

  return (
    <MuiTextField
      fullWidth
      select
      name={name}
      label={label}
      required={required}
      disabled={disabled}
      value={validValue}
      onChange={handleChange}
      error={!!error}
      helperText={error || description}
      variant="outlined"
      size="small"
      sx={{ mb: 2 }}
    >
      {options.map((option) => (
        <MenuItem key={String(option.value)} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </MuiTextField>
  );
}
