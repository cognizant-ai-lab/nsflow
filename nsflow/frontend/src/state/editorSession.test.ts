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

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useEditorNetworkStore } from "./editorNetworkStore";
import { draftKeyFor, isDraftKey, useEditorDraftSession } from "./editorSession";

const SESSION_KEY = "nsflow.editorDraftSession";

describe("useEditorDraftSession", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("continues the session across a reload", () => {
    // A reload remounts the hook with sessionStorage intact, which is the only
    // reliable signal a browser gives: the same draft has to come back.
    const first = renderHook(() => useEditorDraftSession());
    const key = first.result.current.draftKey;
    // Simulate the page going away rather than a route change.
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    first.unmount();

    const second = renderHook(() => useEditorDraftSession());
    expect(second.result.current.draftKey).toBe(key);
  });

  it("starts a new session when the Editor is left and re-entered", () => {
    // Unmounting without the page unloading is a route change, so the next visit to
    // the Editor must be a clean canvas rather than reopening the old draft.
    const first = renderHook(() => useEditorDraftSession());
    const key = first.result.current.draftKey;
    first.unmount();

    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    const second = renderHook(() => useEditorDraftSession());
    expect(second.result.current.draftKey).not.toBe(key);
  });

  it("hands out a fresh draft on request", () => {
    const { result } = renderHook(() => useEditorDraftSession());
    const before = result.current.draftKey;

    act(() => result.current.startNewSession());

    expect(result.current.draftKey).not.toBe(before);
    expect(isDraftKey(result.current.draftKey)).toBe(true);
  });

  it("forgets drafts from other sessions, so IndexedDB does not grow forever", () => {
    const stale = draftKeyFor("stale_session");
    useEditorNetworkStore.getState().applyEdit(stale, [{ origin: "frontman", tools: [] }]);
    useEditorNetworkStore.getState().applyEdit("coffee_shop", [{ origin: "frontman", tools: [] }]);

    renderHook(() => useEditorDraftSession());

    const entries = useEditorNetworkStore.getState().entries;
    expect(entries[stale]).toBeUndefined();
    // A real network is not a draft and must survive.
    expect(entries.coffee_shop).toBeDefined();
  });
});
