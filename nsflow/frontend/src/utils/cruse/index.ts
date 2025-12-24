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

// Icon utilities
export {
  resolveIcon,
  hasIcon,
  COMMON_WIDGET_ICONS,
} from './iconResolver';

// Message parsing utilities
export {
  parseMessageOrigin,
  parseWidgetJson,
  hasWidget,
  getToolName,
  formatMessageTime,
  getLastNMessages,
  prepareMessagesForAgent,
  parseMultimediaFromText,
} from './messageParser';

// Re-export multimedia types for convenience
export type {
  MultimediaItem,
} from './messageParser';

// Schema validation utilities
export {
  validateSchema,
  formatValidationErrors,
  validateField,
  getDefaultValues,
  clearValidatorCache,
} from './schemaValidator';

// Widget registry utilities
export {
  getWidgetType,
  isFileUpload,
  getFieldLabel,
  isFieldRequired,
  getSelectOptions,
  getValidationConstraints,
} from './widgetRegistry';

// API persistence utilities
export {
  createThread,
  listThreads,
  getThread,
  deleteThread,
  addMessage,
  getMessages,
  generateThreadTitle,
  retryWithBackoff,
} from './persistence';

// Re-export types for convenience
export type {
  ValidationResult,
} from './schemaValidator';

export type {
  WidgetRegistry,
} from './widgetRegistry';
