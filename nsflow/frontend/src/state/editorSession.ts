/*
Copyright © 2026 Cognizant Technology Solutions Corp, www.cognizant.com.

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

/**
 * Scopes an unnamed draft network to one editing session.
 *
 * The editor store is persisted to IndexedDB so that work survives a reload. Without
 * a session boundary that persistence is indefinite, and every later visit to the
 * Editor reopens the agents from whenever the user last drew something, which is not
 * what "open the Editor" is expected to mean.
 *
 * What a session is, and why:
 *
 *   - Reloading the Editor CONTINUES the session. The id lives in `sessionStorage`,
 *     which survives a reload and dies with the tab.
 *   - Navigating away from the Editor and back STARTS a new one. Leaving is treated
 *     as ending the session, so arriving is always a clean canvas.
 *   - A new tab starts a new one, since `sessionStorage` is per tab.
 *
 * A hard reload is deliberately NOT distinguished from an ordinary one: browsers
 * report both as navigation type "reload" and expose nothing else to tell them
 * apart, so any rule claiming to separate them would be guessing. `startNewSession`
 * is the explicit way to get a clean canvas without leaving the page.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useEditorNetworkStore } from "./editorNetworkStore";

/** Where the current session's id is kept. Per tab, cleared when the tab closes. */
const SESSION_STORAGE_KEY = "nsflow.editorDraftSession";

/**
 * Prefix for a draft's store key.
 *
 * The leading underscores keep it clear of a real network name, which comes from a
 * registry and never starts with one.
 */
export const DRAFT_KEY_PREFIX = "__draft_";

export const draftKeyFor = (sessionId: string): string => `${DRAFT_KEY_PREFIX}${sessionId}__`;

export const isDraftKey = (networkId: string): boolean => networkId.startsWith(DRAFT_KEY_PREFIX);

const newSessionId = (): string =>
  `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

/**
 * Forget drafts from earlier sessions.
 *
 * Each session gets its own store key, so without this every visit would leave
 * another abandoned draft in IndexedDB forever. A draft that was named is already
 * saved server-side and shows up in the sidebar, so nothing is lost by dropping it
 * from the local store.
 */
const dropOtherDrafts = (keepKey: string): void => {
  const store = useEditorNetworkStore.getState();
  for (const key of Object.keys(store.entries)) {
    if (isDraftKey(key) && key !== keepKey) store.reset(key);
  }
};

/**
 * The store key for this session's unnamed draft, plus a way to start over.
 *
 * @return the draft key, and `startNewSession` which abandons the current draft and
 *         returns a clean one.
 */
export const useEditorDraftSession = (): { draftKey: string; startNewSession: () => void } => {
  const [sessionId, setSessionId] = useState<string>(() => {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const created = newSessionId();
    sessionStorage.setItem(SESSION_STORAGE_KEY, created);
    return created;
  });

  // Distinguishes the page going away from a route change inside the app. On unload
  // the session must be kept so a reload continues it; on a route change it must be
  // dropped so coming back is a new session.
  const isUnloadingRef = useRef(false);

  useEffect(() => {
    const markUnloading = () => {
      isUnloadingRef.current = true;
    };
    // pagehide rather than beforeunload: it also fires when a page enters the back/
    // forward cache, which beforeunload does not reliably do.
    window.addEventListener("pagehide", markUnloading);
    return () => {
      window.removeEventListener("pagehide", markUnloading);
      if (!isUnloadingRef.current) sessionStorage.removeItem(SESSION_STORAGE_KEY);
    };
  }, []);

  const draftKey = draftKeyFor(sessionId);

  // Runs on mount and whenever the session changes, so an abandoned draft never
  // outlives the session that made it.
  useEffect(() => {
    dropOtherDrafts(draftKey);
  }, [draftKey]);

  const startNewSession = useCallback(() => {
    const created = newSessionId();
    sessionStorage.setItem(SESSION_STORAGE_KEY, created);
    setSessionId(created);
  }, []);

  return { draftKey, startNewSession };
};
