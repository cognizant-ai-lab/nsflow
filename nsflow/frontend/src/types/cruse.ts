
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

import { JSONSchema7 } from 'json-schema';

// Message origin tracking
export interface MessageOrigin {
  tool: string;
  instantiation_index: number;
}

// Message types matching backend
export type MessageSender = 'HUMAN' | 'AI' | 'SYSTEM';

// Widget definition for dynamic forms
export interface WidgetCardDefinition {
  title: string;
  description?: string;
  icon?: string;
  color?: string;
  bgImage?: string;
  schema: JSONSchema7;
}

// CRUSE message structure
export interface CruseMessage {
  id: string;
  thread_id: string;
  sender: MessageSender;
  origin: MessageOrigin[];
  text: string;
  widget?: WidgetCardDefinition;
  created_at: Date | string;
}

// Thread structure
export interface CruseThread {
  id: string;
  title: string;
  agent_name?: string;
  created_at: Date | string;
  updated_at: Date | string;
  messages?: CruseMessage[];
}

// API Request types
export interface CreateThreadRequest {
  title: string;
  agent_name?: string;
}

export interface CreateMessageRequest {
  sender: MessageSender;
  origin: MessageOrigin[];
  text: string;
  widget?: WidgetCardDefinition;
}

// API Response types
export interface ThreadResponse {
  id: string;
  title: string;
  agent_name?: string;
  created_at: string;
  updated_at: string;
}

export interface MessageResponse {
  id: string;
  thread_id: string;
  sender: MessageSender;
  origin: string; // JSON string from backend
  text: string;
  widget?: Record<string, unknown>; // JSON object from backend
  created_at: string;
}

export interface ThreadWithMessages extends ThreadResponse {
  messages: MessageResponse[];
}

// Widget agent response
export interface WidgetAgentResponse {
  display?: boolean;
  widget?: WidgetCardDefinition;
}

// Theme agent response
export interface ThemeConfig {
  backgroundColor?: string;
  primaryColor?: string;
  secondaryColor?: string;
  backgroundImage?: string;
  fontFamily?: string;
  [key: string]: string | undefined; // Allow additional theme properties
}

export interface ThemeAgentResponse {
  theme?: ThemeConfig;
}

// Widget field types for form rendering
export type WidgetFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'checkbox'
  | 'select'
  | 'radio'
  | 'multiselect'
  | 'date'
  | 'slider'
  | 'rating'
  | 'file';

export interface WidgetFieldProps {
  name: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  value?: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  schema: JSONSchema7;
}

// Widget registry type
export type WidgetRegistry = Record<
  WidgetFieldType,
  React.FC<WidgetFieldProps>
>;
