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

import { beforeEach, describe, expect, it } from "vitest";

import type { ConnectivityInfo } from "../uiCommon";
import {
  canRedo,
  canUndo,
  MAX_HISTORY_SNAPSHOTS,
  useEditorNetworkStore,
} from "./editorNetworkStore";

const NET = "coffee_shop";

const def = (...origins: string[]): ConnectivityInfo[] => origins.map((origin) => ({ origin, tools: [] }));

const entry = () => useEditorNetworkStore.getState().entries[NET];

describe("editorNetworkStore", () => {
  beforeEach(() => {
    useEditorNetworkStore.getState().reset(NET);
    useEditorNetworkStore.getState().reset("book_shop");
  });

  it("seeds an entry on first edit, with one snapshot at cursor 0", () => {
    useEditorNetworkStore.getState().applyEdit(NET, def("frontman"));
    expect(entry().definition).toEqual(def("frontman"));
    expect(entry().history).toHaveLength(1);
    expect(entry().cursor).toBe(0);
    expect(canUndo(entry())).toBe(false);
    expect(canRedo(entry())).toBe(false);
  });

  it("pushes a snapshot per edit and advances the cursor", () => {
    const store = useEditorNetworkStore.getState();
    store.applyEdit(NET, def("frontman"));
    store.applyEdit(NET, def("frontman", "barista"));
    expect(entry().history).toHaveLength(2);
    expect(entry().cursor).toBe(1);
    expect(canUndo(entry())).toBe(true);
  });

  it("undo and redo move the cursor and restore the definition", () => {
    const store = useEditorNetworkStore.getState();
    store.applyEdit(NET, def("frontman"));
    store.applyEdit(NET, def("frontman", "barista"));

    store.undo(NET);
    expect(entry().definition).toEqual(def("frontman"));
    expect(entry().cursor).toBe(0);
    expect(canRedo(entry())).toBe(true);

    store.redo(NET);
    expect(entry().definition).toEqual(def("frontman", "barista"));
    expect(entry().cursor).toBe(1);
  });

  it("editing after an undo discards the redo tail", () => {
    const store = useEditorNetworkStore.getState();
    store.applyEdit(NET, def("a"));
    store.applyEdit(NET, def("a", "b"));
    store.undo(NET);
    store.applyEdit(NET, def("a", "c"));

    expect(entry().history).toHaveLength(2);
    expect(entry().cursor).toBe(1);
    expect(canRedo(entry())).toBe(false);
    expect(entry().definition).toEqual(def("a", "c"));
  });

  it("undo at the start and redo at the end are no-ops", () => {
    const store = useEditorNetworkStore.getState();
    store.applyEdit(NET, def("a"));
    store.undo(NET);
    store.undo(NET);
    expect(entry().cursor).toBe(0);
    store.redo(NET);
    expect(entry().cursor).toBe(0);
  });

  it("caps history and keeps the cursor on the newest snapshot", () => {
    const store = useEditorNetworkStore.getState();
    for (let i = 0; i < MAX_HISTORY_SNAPSHOTS + 10; i++) {
      store.applyEdit(NET, def(`agent_${i}`));
    }
    expect(entry().history).toHaveLength(MAX_HISTORY_SNAPSHOTS);
    expect(entry().cursor).toBe(MAX_HISTORY_SNAPSHOTS - 1);
    expect(entry().definition).toEqual(def(`agent_${MAX_HISTORY_SNAPSHOTS + 9}`));
  });

  it("reconcileFromServer canonicalises in place without adding history", () => {
    const store = useEditorNetworkStore.getState();
    store.applyEdit(NET, def("frontman"));
    const before = entry().history.length;

    store.reconcileFromServer(NET, {
      definition: [{ origin: "frontman", tools: ["barista"] }],
      networkName: "coffee_shop_v2",
      hocon: 'agent { name = "frontman" }',
    });

    // Server echoes and progress frames arrive continuously; one undo step per
    // frame would bury the user's own edits.
    expect(entry().history).toHaveLength(before);
    expect(entry().cursor).toBe(0);
    expect(entry().definition).toEqual([{ origin: "frontman", tools: ["barista"] }]);
    expect(entry().history[0]).toEqual([{ origin: "frontman", tools: ["barista"] }]);
    expect(entry().networkName).toBe("coffee_shop_v2");
    expect(entry().hocon).toBe('agent { name = "frontman" }');
  });

  it("reconcileFromServer seeds an entry when the server speaks first", () => {
    useEditorNetworkStore.getState().reconcileFromServer(NET, { definition: def("frontman") });
    expect(entry().definition).toEqual(def("frontman"));
    expect(entry().history).toHaveLength(1);
    expect(entry().cursor).toBe(0);
  });

  it("keeps networks isolated from one another", () => {
    const store = useEditorNetworkStore.getState();
    store.applyEdit(NET, def("a"));
    store.applyEdit("book_shop", def("z"));
    expect(entry().definition).toEqual(def("a"));
    expect(useEditorNetworkStore.getState().entries.book_shop.definition).toEqual(def("z"));
  });

  it("does not mutate the caller's definition array", () => {
    const mine = def("a");
    useEditorNetworkStore.getState().applyEdit(NET, mine);
    useEditorNetworkStore.getState().applyEdit(NET, def("a", "b"));
    expect(mine).toEqual(def("a"));
  });

  it("persists entries to IndexedDB so a reload can restore them", async () => {
    useEditorNetworkStore.getState().applyEdit("persisted_net", def("frontman", "barista"));

    // zustand's persist middleware writes asynchronously; let the microtask and the
    // fake-indexeddb transaction settle before reading it back.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const { indexedDBStorage } = await import("../uiCommon");
    const stored = (await indexedDBStorage.getItem("nsflow-editor-network")) as {
      state: { entries: Record<string, { definition: ConnectivityInfo[]; cursor: number }> };
    } | null;

    expect(stored?.state.entries.persisted_net.definition).toEqual(def("frontman", "barista"));
    expect(stored?.state.entries.persisted_net.cursor).toBe(0);

    useEditorNetworkStore.getState().reset("persisted_net");
  });
});

describe("reconcile churn", () => {
  beforeEach(() => {
    useEditorNetworkStore.getState().reset(NET);
  });

  it("keeps the entry reference stable when the server repeats a definition", () => {
    // The designer streams many progress frames per turn, most carrying a
    // definition we already hold. A new object each time would rebuild the canvas
    // on every frame.
    const payload = { definition: def("frontman", "barista"), networkName: "coffee_shop" };
    useEditorNetworkStore.getState().reconcileFromServer(NET, payload);
    const first = entry();

    useEditorNetworkStore.getState().reconcileFromServer(NET, {
      definition: def("frontman", "barista"),
      networkName: "coffee_shop",
    });

    expect(entry()).toBe(first);
  });

  it("still updates when the definition actually changes", () => {
    useEditorNetworkStore.getState().reconcileFromServer(NET, { definition: def("frontman") });
    const first = entry();

    useEditorNetworkStore.getState().reconcileFromServer(NET, { definition: def("frontman", "barista") });

    expect(entry()).not.toBe(first);
    expect(entry().definition).toEqual(def("frontman", "barista"));
  });
});
