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

import { CruseMessage, MessageOrigin, WidgetCardDefinition } from '../../types/cruse';

/**
 * Parses the origin field from backend (JSON string) to MessageOrigin array.
 *
 * @param origin - JSON string or array from backend
 * @returns Parsed MessageOrigin array
 */
export function parseMessageOrigin(origin: string | MessageOrigin[]): MessageOrigin[] {
  if (Array.isArray(origin)) {
    return origin;
  }

  try {
    const parsed = JSON.parse(origin);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    console.error('Failed to parse message origin:', error);
    return [];
  }
}

/**
 * Parses widget JSON from backend response.
 *
 * @param widgetJson - JSON string or object from backend
 * @returns Parsed WidgetCardDefinition or undefined
 */
export function parseWidgetJson(
  widgetJson?: string | Record<string, unknown> | null
): WidgetCardDefinition | undefined {
  if (!widgetJson) {
    return undefined;
  }

  try {
    const widget = typeof widgetJson === 'string' ? JSON.parse(widgetJson) : widgetJson;

    // Validate required fields
    if (!widget.schema) {
      console.warn('Widget missing required schema field');
      return undefined;
    }

    return widget as WidgetCardDefinition;
  } catch (error) {
    console.error('Failed to parse widget JSON:', error);
    return undefined;
  }
}

/**
 * Checks if a message has a displayable widget.
 *
 * @param message - CRUSE message
 * @returns true if message has a valid widget
 */
export function hasWidget(message: CruseMessage): boolean {
  return !!message.widget && !!message.widget.schema;
}

/**
 * Extracts the tool name from message origin.
 *
 * @param origin - MessageOrigin array
 * @returns Tool name or 'Unknown'
 */
export function getToolName(origin: MessageOrigin[]): string {
  if (!origin || origin.length === 0) {
    return 'Unknown';
  }
  return origin[0]?.tool || 'Unknown';
}

/**
 * Formats message timestamp for display.
 *
 * @param timestamp - Date or date string
 * @returns Formatted time string (e.g., "2:30 PM" or "Yesterday")
 */
export function formatMessageTime(timestamp: Date | string): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

/**
 * Gets the last N messages from a conversation.
 * Used for sending context to widget/theme agents.
 *
 * @param messages - Array of messages
 * @param count - Number of messages to retrieve
 * @returns Last N messages
 */
export function getLastNMessages(messages: CruseMessage[], count: number): CruseMessage[] {
  return messages.slice(-count);
}

/**
 * Prepares messages for sending to widget/theme agents.
 * Strips widget data to avoid circular dependencies.
 *
 * @param messages - Array of messages
 * @returns Simplified messages for agent consumption
 */
export function prepareMessagesForAgent(messages: CruseMessage[]): Array<{
  sender: string;
  text: string;
  origin: MessageOrigin[];
}> {
  return messages.map((msg) => ({
    sender: msg.sender,
    text: msg.text,
    origin: msg.origin,
  }));
}
