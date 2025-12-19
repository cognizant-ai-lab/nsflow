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
 * Formats message timestamp for display in local timezone.
 * Format: "08:34 AM 12-Dec-2025"
 *
 * @param timestamp - Date or date string (UTC from DB)
 * @returns Formatted time string in local timezone
 */
export function formatMessageTime(timestamp: Date | string): string {
  // Parse UTC timestamp from DB
  // If it's a string without timezone info, assume UTC
  let date: Date;
  if (typeof timestamp === 'string') {
    // If the string doesn't end with 'Z' or have timezone info, append 'Z' to indicate UTC
    const utcString = timestamp.endsWith('Z') || timestamp.includes('+') || timestamp.includes('T') && timestamp.split('T')[1].includes('-')
      ? timestamp
      : timestamp.replace(' ', 'T') + 'Z';
    date = new Date(utcString);
  } else {
    date = timestamp;
  }

  // Format: "08:34 AM" - toLocaleTimeString automatically converts to local timezone
  const time = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  // Format: "12-Dec-2025" - date methods automatically use local timezone
  const day = date.getDate().toString().padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = date.getFullYear();

  return `${time} ${day}-${month}-${year}`;
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
