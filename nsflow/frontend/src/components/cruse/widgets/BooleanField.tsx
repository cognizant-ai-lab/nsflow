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

import { FormControlLabel, Switch, FormHelperText, Box } from '@mui/material';
import { WidgetFieldProps } from '../../../types/cruse';

/**
 * Boolean input widget using a switch control.
 * Displays a toggle switch for true/false values.
 */
export function BooleanField({
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

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.checked);
  };

  return (
    <Box sx={{ mb: 2 }}>
      <FormControlLabel
        control={
          <Switch
            name={name}
            checked={!!value}
            onChange={handleChange}
            disabled={disabled}
            color="primary"
          />
        }
        label={`${label}${required ? ' *' : ''}`}
      />
      {(error || description) && (
        <FormHelperText error={!!error}>
          {error || description}
        </FormHelperText>
      )}
    </Box>
  );
}
