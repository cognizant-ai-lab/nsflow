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
  CreateThreadRequest,
  CreateMessageRequest,
  ThreadResponse,
  MessageResponse,
  ThreadWithMessages,
} from '../../types/cruse';

// API base path for CRUSE endpoints
const CRUSE_API_BASE = '/api/v1/cruse';

/**
 * Fetch helper with timeout support.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout = 30000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

/**
 * Handles API response errors.
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({
      detail: `HTTP ${response.status}: ${response.statusText}`,
    }));
    throw new Error(error.detail || 'API request failed');
  }
  return response.json();
}

// ==================== Thread API ====================

/**
 * Creates a new thread.
 *
 * @param request - Thread creation request
 * @returns Created thread
 */
export async function createThread(request: CreateThreadRequest): Promise<ThreadResponse> {
  const response = await fetchWithTimeout(`${CRUSE_API_BASE}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handleResponse<ThreadResponse>(response);
}

/**
 * Fetches all threads (ordered by updated_at desc).
 *
 * @returns Array of threads
 */
export async function listThreads(): Promise<ThreadResponse[]> {
  const response = await fetchWithTimeout(`${CRUSE_API_BASE}/threads`);
  return handleResponse<ThreadResponse[]>(response);
}

/**
 * Fetches a specific thread with all messages.
 *
 * @param threadId - Thread ID
 * @returns Thread with messages
 */
export async function getThread(threadId: string): Promise<ThreadWithMessages> {
  const response = await fetchWithTimeout(`${CRUSE_API_BASE}/threads/${threadId}`);
  return handleResponse<ThreadWithMessages>(response);
}

/**
 * Updates a thread's title and/or agent_name.
 *
 * @param threadId - Thread ID
 * @param request - Thread update request (partial)
 * @returns Updated thread
 */
export async function updateThread(
  threadId: string,
  request: Partial<CreateThreadRequest>
): Promise<ThreadResponse> {
  const response = await fetchWithTimeout(`${CRUSE_API_BASE}/threads/${threadId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handleResponse<ThreadResponse>(response);
}

/**
 * Deletes a thread and all its messages.
 *
 * @param threadId - Thread ID
 * @returns Success message
 */
export async function deleteThread(threadId: string): Promise<{ message: string; thread_id: string }> {
  const response = await fetchWithTimeout(`${CRUSE_API_BASE}/threads/${threadId}`, {
    method: 'DELETE',
  });
  return handleResponse<{ message: string; thread_id: string }>(response);
}

/**
 * Deletes all threads for a specific agent.
 *
 * @param agentName - Agent name
 * @returns Success message with deleted count
 */
export async function deleteAllThreadsForAgent(agentName: string): Promise<{ message: string; agent_name: string; deleted_count: number }> {
  const response = await fetchWithTimeout(`${CRUSE_API_BASE}/threads/agent/${encodeURIComponent(agentName)}`, {
    method: 'DELETE',
  });
  return handleResponse<{ message: string; agent_name: string; deleted_count: number }>(response);
}

// ==================== Message API ====================

/**
 * Adds a message to a thread.
 *
 * @param threadId - Thread ID
 * @param request - Message creation request
 * @returns Created message
 */
export async function addMessage(
  threadId: string,
  request: CreateMessageRequest
): Promise<MessageResponse> {
  const response = await fetchWithTimeout(`${CRUSE_API_BASE}/threads/${threadId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handleResponse<MessageResponse>(response);
}

/**
 * Fetches messages for a thread with pagination.
 *
 * @param threadId - Thread ID
 * @param limit - Number of messages to fetch (default 100)
 * @param offset - Number of messages to skip (default 0)
 * @returns Array of messages
 */
export async function getMessages(
  threadId: string,
  limit = 100,
  offset = 0
): Promise<MessageResponse[]> {
  const url = new URL(`${CRUSE_API_BASE}/threads/${threadId}/messages`, window.location.origin);
  url.searchParams.set('limit', limit.toString());
  url.searchParams.set('offset', offset.toString());

  const response = await fetchWithTimeout(url.toString());
  return handleResponse<MessageResponse[]>(response);
}

// ==================== Utility Functions ====================

/**
 * Generates a default thread title from first message.
 *
 * @param text - First message text
 * @returns Thread title
 */
export function generateThreadTitle(text: string): string {
  const maxLength = 50;
  const trimmed = text.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return trimmed.slice(0, maxLength).trim() + '...';
}

/**
 * Retries a function with exponential backoff.
 *
 * @param fn - Function to retry
 * @param maxRetries - Maximum number of retries (default 3)
 * @param initialDelay - Initial delay in ms (default 1000)
 * @returns Result of the function
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 1000
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}
