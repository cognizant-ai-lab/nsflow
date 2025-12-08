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

import { TextField } from './TextField';
import { NumberField } from './NumberField';
import { BooleanField } from './BooleanField';
import { SelectField } from './SelectField';
import { TextareaField } from './TextareaField';
import { RadioGroupField } from './RadioGroupField';
import { CheckboxField } from './CheckboxField';
import { MultiSelectField } from './MultiSelectField';
import { DateField } from './DateField';
import { SliderField } from './SliderField';
import { RatingField } from './RatingField';
import { WidgetRegistry } from '../../../types/cruse';

/**
 * Widget Registry
 *
 * Maps widget types to their corresponding React components.
 * Used by WidgetFormRenderer to dynamically render form fields.
 */
export const widgetRegistry: WidgetRegistry = {
  // Phase 2 - Basic Widgets
  text: TextField,
  number: NumberField,
  boolean: BooleanField,
  select: SelectField,

  // Phase 2B - Essential Extensions
  textarea: TextareaField,
  radio: RadioGroupField,
  checkbox: CheckboxField,
  multiselect: MultiSelectField,

  // Phase 2C - Advanced Input Widgets
  date: DateField,
  slider: SliderField,
  rating: RatingField,

  // Placeholders for future phases
  file: TextField, // TODO: Implement FileUploadField in later phase
};

// Export individual widgets
export { TextField } from './TextField';
export { NumberField } from './NumberField';
export { BooleanField } from './BooleanField';
export { SelectField } from './SelectField';
export { TextareaField } from './TextareaField';
export { RadioGroupField } from './RadioGroupField';
export { CheckboxField } from './CheckboxField';
export { MultiSelectField } from './MultiSelectField';
export { DateField } from './DateField';
export { SliderField } from './SliderField';
export { RatingField } from './RatingField';
