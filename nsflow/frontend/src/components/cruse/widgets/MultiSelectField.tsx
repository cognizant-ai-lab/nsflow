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
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
  Chip,
  Box,
  FormHelperText,
  OutlinedInput,
  SelectChangeEvent,
} from '@mui/material';
import { JSONSchema7 } from 'json-schema';
import { WidgetFieldProps } from '../../../types/cruse';
import { getSelectOptions } from '../../../utils/cruse';

/**
 * Multi-select dropdown widget for array fields with enum items.
 * Supports multiple selection with checkboxes and chip display.
 * For schemas with type: "array", items: { enum: [...] }
 */
export function MultiSelectField({
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

  // Extract options from array schema items
  const itemsSchema = (schema as Record<string, unknown>).items as JSONSchema7 | undefined || {};
  const options = getSelectOptions(itemsSchema as JSONSchema7);

  // Ensure value is an array
  const selectedValues = Array.isArray(value) ? value : [];

  const handleChange = (event: SelectChangeEvent<unknown>) => {
    const selectedValue = event.target.value;
    onChange(selectedValue);
  };

  // Find label for a given value
  const getLabel = (val: string | number) => {
    const option = options.find((opt) => opt.value === val);
    return option ? option.label : String(val);
  };

  return (
    <FormControl
      fullWidth
      error={!!error}
      required={required}
      disabled={disabled}
      variant="outlined"
      size="small"
      sx={{ mb: 2 }}
    >
      <InputLabel id={`${name}-label`}>{label}</InputLabel>
      <Select
        labelId={`${name}-label`}
        id={name}
        multiple
        value={selectedValues}
        onChange={handleChange}
        input={<OutlinedInput label={label} />}
        renderValue={(selected) => (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {(selected as Array<string | number>).map((val) => (
              <Chip key={String(val)} label={getLabel(val)} size="small" />
            ))}
          </Box>
        )}
      >
        {options.map((option) => (
          <MenuItem key={String(option.value)} value={option.value}>
            <Checkbox
              checked={selectedValues.indexOf(option.value) > -1}
              size="small"
            />
            <ListItemText primary={option.label} />
          </MenuItem>
        ))}
      </Select>
      {(error || description) && (
        <FormHelperText>{error || description}</FormHelperText>
      )}
    </FormControl>
  );
}
