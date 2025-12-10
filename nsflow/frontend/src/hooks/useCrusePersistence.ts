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

import { useState, useCallback, useEffect } from 'react';
import {
  createThread,
  listThreads,
  getThread,
  updateThread as updateThreadAPI,
  deleteThread as deleteThreadAPI,
  addMessage,
  getMessages,
} from '../utils/cruse/persistence';
import { parseMessageOrigin, parseWidgetJson } from '../utils/cruse/messageParser';
import type {
  CruseThread,
  CruseMessage,
  CreateMessageRequest,
  MessageResponse,
} from '../types/cruse';

/**
 * Converts a MessageResponse from the API to a CruseMessage for the UI.
 * Handles parsing of JSON string fields (origin, widget).
 */
function convertMessageResponseToCruseMessage(msg: MessageResponse): CruseMessage {
  return {
    ...msg,
    origin: parseMessageOrigin(msg.origin),
    widget: msg.widget ? parseWidgetJson(msg.widget) : undefined,
    created_at: msg.created_at,
  };
}

/**
 * Custom hook for CRUSE thread and message persistence operations.
 *
 * Provides state management and CRUD operations for threads and messages,
 * with loading/error states and automatic refetching.
 *
 * @returns Object with threads, messages, loading states, and CRUD functions
 */
export function useCrusePersistence() {
  const [threads, setThreads] = useState<CruseThread[]>([]);
  const [currentThread, setCurrentThread] = useState<CruseThread | null>(null);
  const [messages, setMessages] = useState<CruseMessage[]>([]);
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all threads
  const fetchThreads = useCallback(async () => {
    setIsLoadingThreads(true);
    setError(null);

    try {
      const fetchedThreads = await listThreads();
      setThreads(fetchedThreads);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load threads';
      setError(message);
      console.error('Error fetching threads:', err);
    } finally {
      setIsLoadingThreads(false);
    }
  }, []);

  // Fetch messages for a specific thread
  const fetchMessages = useCallback(async (threadId: string) => {
    setIsLoadingMessages(true);
    setError(null);

    try {
      const fetchedMessages = await getMessages(threadId);
      // Convert MessageResponse[] to CruseMessage[]
      const convertedMessages = fetchedMessages.map(convertMessageResponseToCruseMessage);
      setMessages(convertedMessages);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load messages';
      setError(message);
      console.error('Error fetching messages:', err);
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  // Load a thread with its messages
  const loadThread = useCallback(
    async (threadId: string) => {
      setIsLoadingMessages(true);
      setError(null);

      try {
        const thread = await getThread(threadId);

        // Convert ThreadWithMessages to CruseThread
        const cruseThread: CruseThread = {
          id: thread.id,
          title: thread.title,
          agent_name: thread.agent_name,
          created_at: thread.created_at,
          updated_at: thread.updated_at,
        };

        setCurrentThread(cruseThread);

        // Extract messages from thread or fetch separately
        if (thread.messages && thread.messages.length > 0) {
          const convertedMessages = thread.messages.map(convertMessageResponseToCruseMessage);
          setMessages(convertedMessages);
        } else {
          await fetchMessages(threadId);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load thread';
        setError(message);
        console.error('Error loading thread:', err);
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [fetchMessages]
  );

  // Create a new thread
  const createNewThread = useCallback(
    async (title: string, agentName?: string) => {
      setError(null);

      try {
        const newThread = await createThread({ title, agent_name: agentName });
        await fetchThreads(); // Refresh thread list
        return newThread;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create thread';
        setError(message);
        console.error('Error creating thread:', err);
        throw err;
      }
    },
    [fetchThreads]
  );

  // Update thread title
  const updateThreadTitle = useCallback(
    async (threadId: string, newTitle: string) => {
      setError(null);

      try {
        const updatedThread = await updateThreadAPI(threadId, { title: newTitle });

        // Update local state
        if (currentThread?.id === threadId) {
          setCurrentThread({ ...currentThread, title: newTitle });
        }

        await fetchThreads(); // Refresh thread list to update sidebar

        return updatedThread;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update thread title';
        setError(message);
        console.error('Error updating thread title:', err);
        throw err;
      }
    },
    [currentThread, fetchThreads]
  );

  // Delete a thread
  const deleteThread = useCallback(
    async (threadId: string) => {
      setError(null);

      try {
        await deleteThreadAPI(threadId);
        await fetchThreads(); // Refresh thread list

        // Clear current thread if it was deleted
        if (currentThread?.id === threadId) {
          setCurrentThread(null);
          setMessages([]);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete thread';
        setError(message);
        console.error('Error deleting thread:', err);
        throw err;
      }
    },
    [fetchThreads, currentThread]
  );

  // Add a message to the current thread
  const addMessageToThread = useCallback(
    async (threadId: string, messageRequest: CreateMessageRequest) => {
      setError(null);

      try {
        const newMessage = await addMessage(threadId, messageRequest);

        // Convert MessageResponse to CruseMessage
        const convertedMessage = convertMessageResponseToCruseMessage(newMessage);

        // Optimistically update messages
        setMessages((prev) => [...prev, convertedMessage]);

        return convertedMessage;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to add message';
        setError(message);
        console.error('Error adding message:', err);
        throw err;
      }
    },
    []
  );

  // Load threads on mount
  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  return {
    // State
    threads,
    currentThread,
    messages,
    isLoadingThreads,
    isLoadingMessages,
    error,

    // Actions
    fetchThreads,
    fetchMessages,
    loadThread,
    createNewThread,
    updateThreadTitle,
    deleteThread,
    addMessageToThread,
    setMessages, // Allow manual message updates for optimistic updates
  };
}
