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
 * The authority for in-progress manual edits to an agent network.
 *
 * This replaces nsflow's server-side editor state (backend/utils/editor:
 * SimpleStateManager for the live model, OperationStore for JSONL inverse-op undo
 * history, draft_states/ for reload survival). Edits apply here first and the
 * canvas renders from here; the round-trip to the agent then canonicalises what
 * the server considers true. Undo/redo is a cursor over local snapshots, with no
 * inverse ops and no server involvement.
 *
 * `applyEdit` is deliberately the single mutation seam. Every editing affordance
 * we add (drag-and-drop to add a node, right-click to delete, the hover pencil to
 * edit instructions) computes a new definition and calls it, so richer editing
 * stays UI work rather than state work.
 *
 * Persisted to IndexedDB with ui-common's storage adapter, which is what makes an
 * in-progress network survive a full page reload.
 */

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { type ConnectivityInfo, indexedDBStorage } from "../uiCommon";

/**
 * How many undo steps to keep. Matches ui-common's MAX_CHAT_HISTORY_ITEMS so the
 * two stores behave consistently.
 *
 * Direct-manipulation editing (dragging especially) can produce edits faster than
 * a user thinks of them as steps. If that makes undo feel too fine-grained, the
 * fix is to coalesce rapid edits inside `applyEdit` rather than to raise this.
 */
export const MAX_HISTORY_SNAPSHOTS = 50;

const STORE_KEY = "nsflow-editor-network";

/**
 * A network's top-level metadata block (sample_queries, dates, description, ...), as
 * the designer reads and writes it under the sly_data key agent_network_metadata.
 */
export type NetworkMetadataBlock = Record<string, unknown>;

/**
 * The value as a metadata block, or undefined when it is not one. Only a plain
 * object is a block: the designer ignores anything else, and so does the store.
 */
export const asMetadataBlock = (value: unknown): NetworkMetadataBlock | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as NetworkMetadataBlock)
    : undefined;

export type ServerNetworkPayload = {
  readonly definition: ConnectivityInfo[];
  readonly networkName?: string;
  readonly hocon?: string;
  /**
   * The network's metadata block: undefined keeps the held block, null drops it, and
   * a block replaces it. Opening a network passes null, so an old block is dropped.
   */
  readonly metadata?: NetworkMetadataBlock | null;
};

export type EditorNetworkEntry = {
  readonly networkName?: string;
  readonly definition: ConnectivityInfo[];
  readonly hocon?: string;
  /**
   * The metadata block every save sends back. Absent means none is held, and the
   * designer keeps the block of the file it saves over. {} is a block too: it wipes
   * the block of a network this one replaced. Not in the undo history, not persisted.
   */
  readonly metadata?: NetworkMetadataBlock;
  readonly slyData: Record<string, unknown>;
  readonly history: ConnectivityInfo[][];
  readonly cursor: number;
};

type EditorNetworkStore = {
  readonly entries: Record<string, EditorNetworkEntry>;
  applyEdit: (networkId: string, definition: ConnectivityInfo[]) => void;
  reconcileFromServer: (networkId: string, payload: ServerNetworkPayload) => void;
  setSlyData: (networkId: string, slyData: Record<string, unknown>) => void;
  undo: (networkId: string) => void;
  redo: (networkId: string) => void;
  reset: (networkId: string) => void;
};

const EMPTY_ENTRY: EditorNetworkEntry = {
  definition: [],
  slyData: {},
  history: [],
  cursor: -1,
};

/**
 * Snapshots are deep-copied on the way in: definitions arriving from the progress
 * stream are live references into React state, and history entries must not change
 * underneath us afterwards.
 */
const snapshot = (definition: ConnectivityInfo[]): ConnectivityInfo[] =>
  JSON.parse(JSON.stringify(definition)) as ConnectivityInfo[];

/**
 * The block an entry holds after a payload, following the three cases on
 * ServerNetworkPayload.metadata. Copied for the same reason snapshot copies.
 */
const nextMetadata = (
  held: NetworkMetadataBlock | undefined,
  incoming: NetworkMetadataBlock | null | undefined
): NetworkMetadataBlock | undefined => {
  if (incoming === undefined) return held;
  const block = asMetadataBlock(incoming);
  return block ? (JSON.parse(JSON.stringify(block)) as NetworkMetadataBlock) : undefined;
};

export const canUndo = (entry: EditorNetworkEntry | undefined): boolean => Boolean(entry) && entry!.cursor > 0;

export const canRedo = (entry: EditorNetworkEntry | undefined): boolean =>
  Boolean(entry) && entry!.cursor < entry!.history.length - 1;

export const selectEntry = (
  state: EditorNetworkStore,
  networkId: string | undefined
): EditorNetworkEntry | undefined => (networkId ? state.entries[networkId] : undefined);

/** Only `entries` is persisted; the actions are recreated on load. */
type PersistedEditorState = Pick<EditorNetworkStore, "entries">;

/**
 * The entries without their metadata blocks, for persisting. A block restored after a
 * reload may be older than the file; with none held, the designer reads the file.
 */
const withoutMetadata = (entries: Record<string, EditorNetworkEntry>): Record<string, EditorNetworkEntry> => {
  const persisted: Record<string, EditorNetworkEntry> = {};
  for (const [networkId, entry] of Object.entries(entries)) {
    const { metadata: _metadata, ...rest } = entry;
    persisted[networkId] = rest;
  }
  return persisted;
};

const editorStorage: PersistStorage<PersistedEditorState> = {
  getItem: async (name) => (await indexedDBStorage.getItem(name)) as StorageValue<PersistedEditorState> | null,
  setItem: async (name, value) => {
    await indexedDBStorage.setItem(name, value);
  },
  removeItem: async (name) => {
    await indexedDBStorage.removeItem(name);
  },
};

export const useEditorNetworkStore = create<EditorNetworkStore>()(
  persist(
    (set) => ({
      entries: {},

      applyEdit: (networkId, definition) =>
        set((state) => {
          const existing = state.entries[networkId] ?? EMPTY_ENTRY;
          // Truncate the redo tail: editing after an undo abandons that future.
          const kept = existing.history.slice(0, existing.cursor + 1);
          const capped = [...kept, snapshot(definition)].slice(-MAX_HISTORY_SNAPSHOTS);
          return {
            entries: {
              ...state.entries,
              [networkId]: {
                ...existing,
                definition: snapshot(definition),
                history: capped,
                cursor: capped.length - 1,
              },
            },
          };
        }),

      // Canonicalises the current snapshot rather than pushing a new one: server
      // echoes and progress frames stream continuously, and one undo step per frame
      // would bury the user's own edits.
      reconcileFromServer: (networkId, payload) =>
        set((state) => {
          const existing = state.entries[networkId] ?? EMPTY_ENTRY;
          const metadata = nextMetadata(existing.metadata, payload.metadata);

          // The designer emits progress frames continuously during generation, and
          // most repeat a definition we already hold. Returning the identical state
          // object keeps the entry reference stable so the canvas does not rebuild
          // itself on every frame.
          if (
            state.entries[networkId] &&
            payload.networkName === existing.networkName &&
            payload.hocon === existing.hocon &&
            JSON.stringify(payload.definition) === JSON.stringify(existing.definition) &&
            // A save can change only the block (date_modified), and that has to land.
            JSON.stringify(metadata) === JSON.stringify(existing.metadata)
          ) {
            return state;
          }

          const next = snapshot(payload.definition);
          const history = existing.history.length === 0 ? [next] : [...existing.history];
          const cursor = existing.cursor < 0 ? 0 : existing.cursor;
          history[cursor] = next;
          return {
            entries: {
              ...state.entries,
              [networkId]: {
                ...existing,
                definition: next,
                history,
                cursor,
                // The definition/name pair must stay atomic: the backend persists
                // the definition under agent_network_name, so pairing a fresh
                // definition with a stale name can overwrite another network.
                networkName: payload.networkName ?? existing.networkName,
                hocon: payload.hocon ?? existing.hocon,
                metadata,
              },
            },
          };
        }),

      setSlyData: (networkId, slyData) =>
        set((state) => {
          const existing = state.entries[networkId] ?? EMPTY_ENTRY;
          return { entries: { ...state.entries, [networkId]: { ...existing, slyData } } };
        }),

      undo: (networkId) =>
        set((state) => {
          const existing = state.entries[networkId];
          if (!canUndo(existing)) return state;
          const cursor = existing!.cursor - 1;
          return {
            entries: {
              ...state.entries,
              [networkId]: { ...existing!, cursor, definition: snapshot(existing!.history[cursor]) },
            },
          };
        }),

      redo: (networkId) =>
        set((state) => {
          const existing = state.entries[networkId];
          if (!canRedo(existing)) return state;
          const cursor = existing!.cursor + 1;
          return {
            entries: {
              ...state.entries,
              [networkId]: { ...existing!, cursor, definition: snapshot(existing!.history[cursor]) },
            },
          };
        }),

      reset: (networkId) =>
        set((state) => {
          const { [networkId]: _dropped, ...rest } = state.entries;
          return { entries: rest };
        }),
    }),
    {
      name: STORE_KEY,
      storage: editorStorage,
      partialize: (state): PersistedEditorState => ({ entries: withoutMetadata(state.entries) }),
    }
  )
);
