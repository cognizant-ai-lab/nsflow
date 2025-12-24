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

/**
 * Type definition for multimedia items found in messages.
 */
export interface MultimediaItem {
  url: string;
  type: 'image' | 'video' | 'audio';
  /** Whether this is an embedded video (iframe) vs direct file */
  isEmbed?: boolean;
  /** Original URL before conversion to embed URL */
  originalUrl?: string;
}

/**
 * Supported multimedia file extensions by type.
 */
const MULTIMEDIA_EXTENSIONS = {
  image: ['jpeg', 'jpg', 'png', 'svg'] as string[],
  video: ['mp4', 'webm', 'avi', 'mov', 'mpg', 'mpeg', 'gif'] as string[],
  audio: ['mp3', 'aac', 'm4a', 'wav', 'ogg'] as string[],
};

/**
 * Video platform patterns and their embed URL converters
 */
const VIDEO_PLATFORMS = [
  {
    name: 'YouTube',
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ],
    getEmbedUrl: (videoId: string) => `https://www.youtube.com/embed/${videoId}`,
  },
  {
    name: 'Vimeo',
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)/,
      /(?:https?:\/\/)?player\.vimeo\.com\/video\/(\d+)/,
    ],
    getEmbedUrl: (videoId: string) => `https://player.vimeo.com/video/${videoId}`,
  },
  {
    name: 'Dailymotion',
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?dailymotion\.com\/video\/([a-zA-Z0-9]+)/,
    ],
    getEmbedUrl: (videoId: string) => `https://www.dailymotion.com/embed/video/${videoId}`,
  },
  {
    name: 'Twitch',
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?twitch\.tv\/videos\/(\d+)/,
    ],
    getEmbedUrl: (videoId: string) => `https://player.twitch.tv/?video=${videoId}&parent=${window.location.hostname}`,
  },
];

/**
 * Extracts multimedia URLs from message text.
 * Looks for URLs ending with supported image, video, or audio file extensions,
 * as well as embedded video platform URLs (YouTube, Vimeo, etc.).
 *
 * @param text - Message text to parse
 * @returns Array of multimedia items with URL and type
 */
export function parseMultimediaFromText(text: string): MultimediaItem[] {
  if (!text) return [];

  const multimedia: MultimediaItem[] = [];

  // Regex to match URLs (http/https/file protocols and relative paths)
  // Updated to include parentheses and other URL-safe characters
  const urlRegex = /(?:https?:\/\/|file:\/\/|\.\.?\/)[^\s<>"{}|\\^`\[\]]+/g;
  const matches = text.match(urlRegex);

  if (!matches) return [];

  for (let url of matches) {
    // Trim trailing punctuation that's likely not part of the URL (including markdown closing parens/brackets)
    url = url.replace(/[\.,;:!?\)\]]+$/, '');

    let matched = false;

    // First, check if it's a video platform URL (YouTube, Vimeo, etc.)
    for (const platform of VIDEO_PLATFORMS) {
      for (const pattern of platform.patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
          const videoId = match[1];
          const embedUrl = platform.getEmbedUrl(videoId);
          multimedia.push({
            url: embedUrl,
            type: 'video',
            isEmbed: true,
            originalUrl: url,
          });
          matched = true;
          break;
        }
      }
      if (matched) break;
    }

    if (matched) continue;

    // Extract the file extension (case-insensitive)
    // Remove query parameters and fragments before checking extension
    const urlWithoutQuery = url.split('?')[0].split('#')[0];
    const extension = urlWithoutQuery.split('.').pop()?.toLowerCase();

    // If there's an extension, check if it matches known types
    if (extension && urlWithoutQuery.includes('.')) {
      // Check if it's an image
      if (MULTIMEDIA_EXTENSIONS.image.includes(extension)) {
        multimedia.push({ url, type: 'image' });
        continue;
      }

      // Check if it's a video
      if (MULTIMEDIA_EXTENSIONS.video.includes(extension)) {
        multimedia.push({ url, type: 'video' });
        continue;
      }

      // Check if it's audio
      if (MULTIMEDIA_EXTENSIONS.audio.includes(extension)) {
        multimedia.push({ url, type: 'audio' });
        continue;
      }
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      // For URLs without clear extensions, optimistically treat as images
      // The MultiMediaCard component will handle load failures gracefully
      multimedia.push({ url, type: 'image' });
      continue;
    }
  }

  return multimedia;
}
