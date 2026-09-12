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
 * A running account of what manual editing did.
 *
 * Vibe editing narrates itself: the designer's turns land in the chat, so there is
 * always a record of what was asked and what came back. Manual editing had none. A
 * change appeared on the canvas and that was the whole story, which makes it hard to
 * tell what you have done, and harder to tell what happened while you were not
 * looking (a progress frame arriving, an import replacing the canvas).
 *
 * A store rather than props because the two ends are far apart: edits happen in the
 * canvas and the agent panel, and the logs panel is mounted by the page. Threading a
 * callback through both would couple three components to say one line.
 *
 * Not persisted. This is a record of the current session's actions, not of the
 * network, and reading yesterday's actions back on load would imply otherwise.
 */

import { create } from "zustand";

/** One thing that happened, with the time it happened. */
export interface EditorActivityEntry {
  readonly at: number;
  readonly text: string;
}

/**
 * How many lines to keep.
 *
 * A long editing session can produce hundreds; the recent ones are the useful ones,
 * and an unbounded list is a slow leak in a panel that stays mounted.
 */
const MAX_ENTRIES = 200;

interface EditorActivityStore {
  readonly entries: EditorActivityEntry[];
  /** Record one line. Newest last, matching how a log reads. */
  readonly record: (text: string) => void;
  readonly clear: () => void;
}

export const useEditorActivityStore = create<EditorActivityStore>((set) => ({
  entries: [],
  record: (text) =>
    set((state) => {
      const trimmed = text.trim();
      if (!trimmed) return state;
      // Collapse an immediate repeat. Superseded edits re-report the same action as
      // the user drags a slider or clicks twice, and a wall of identical lines hides
      // the one thing that actually changed.
      const last = state.entries[state.entries.length - 1];
      if (last?.text === trimmed) return state;
      return { entries: [...state.entries, { at: Date.now(), text: trimmed }].slice(-MAX_ENTRIES) };
    }),
  clear: () => set({ entries: [] }),
}));

/** Record one line without subscribing to the store, for use inside callbacks. */
export const recordEditorActivity = (text: string): void =>
  useEditorActivityStore.getState().record(text);

/**
 * Phrase one edit for the log.
 *
 * Naming the network as well as the agent, because the same agent name can exist in
 * more than one network and the log outlives the selection that produced it.
 */
export const describeEdit = (action: string, networkName?: string): string =>
  networkName ? `${action} in agent network "${networkName}"` : action;
