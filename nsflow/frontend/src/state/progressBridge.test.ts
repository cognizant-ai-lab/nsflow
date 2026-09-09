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

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useEditorNetworkStore } from "./editorNetworkStore";
import { applyFramesToStore, definitionFromFrames, useEditorProgressBridge } from "./progressBridge";

/** What the mocked ChatContext returns; each test sets this before rendering. */
const chatContext: Record<string, unknown> = {};

vi.mock("../context/ChatContext", () => ({
  useChatContext: () => chatContext,
}));

const NET = "coffee_shop";

/** Frames arrive as ChatContext Messages, whose `text` may be a string or object. */
const frame = (payload: unknown) => ({ text: JSON.stringify(payload) });

describe("definitionFromFrames", () => {
  it("normalises the dict dialect the internal progress style emits", () => {
    // AGENT_NETWORK_DESIGNER_PROGRESS_STYLE defaults to "internal", which reports
    // the definition as a dict keyed by agent name rather than a connectivity list.
    const progress = frame({
      agent_network_definition: {
        frontman: { instructions: "Greet", description: "Front", tools: ["barista"] },
      },
      agent_network_name: "coffee_shop",
    });
    expect(definitionFromFrames(progress, undefined, true)).toEqual([
      { origin: "frontman", tools: ["barista"], instructions: "Greet", description: "Front" },
    ]);
  });

  it("accepts down_chains as an alias for tools in the dict dialect", () => {
    const progress = frame({ agent_network_definition: { frontman: { down_chains: ["barista"] } } });
    expect(definitionFromFrames(progress, undefined, true)).toEqual([
      { origin: "frontman", tools: ["barista"] },
    ]);
  });

  it("passes the connectivity list dialect through unchanged", () => {
    const progress = frame({
      connectivity_info: [{ origin: "frontman", tools: ["barista"] }],
      agent_network_name: "coffee_shop",
    });
    expect(definitionFromFrames(progress, undefined, true)).toEqual([
      { origin: "frontman", tools: ["barista"] },
    ]);
  });

  it("prefers whichever stream is fresher", () => {
    const progress = frame({ connectivity_info: [{ origin: "from_progress", tools: [] }] });
    const slyData = frame({ connectivity_info: [{ origin: "from_slydata", tools: [] }] });

    expect(definitionFromFrames(progress, slyData, true)).toEqual([{ origin: "from_progress", tools: [] }]);
    expect(definitionFromFrames(progress, slyData, false)).toEqual([{ origin: "from_slydata", tools: [] }]);
  });

  it("falls back to the other stream when the preferred frame carries no definition", () => {
    const nameOnly = frame({ agent_network_name: "coffee_shop" });
    const withDefinition = frame({ connectivity_info: [{ origin: "frontman", tools: [] }] });
    expect(definitionFromFrames(nameOnly, withDefinition, true)).toEqual([{ origin: "frontman", tools: [] }]);
  });

  it("returns undefined when neither stream carries a definition", () => {
    expect(definitionFromFrames(undefined, undefined, true)).toBeUndefined();
    expect(definitionFromFrames(frame({ agent_network_name: "x" }), undefined, true)).toBeUndefined();
  });
});

describe("applyFramesToStore", () => {
  beforeEach(() => {
    useEditorNetworkStore.getState().reset(NET);
  });

  it("reconciles a definition-carrying frame without creating an undo step", () => {
    useEditorNetworkStore.getState().applyEdit(NET, [{ origin: "frontman", tools: [] }]);
    const before = useEditorNetworkStore.getState().entries[NET].history.length;

    applyFramesToStore(
      NET,
      frame({ connectivity_info: [{ origin: "frontman", tools: ["barista"] }], agent_network_name: "coffee_shop" }),
      undefined,
      true
    );

    const entry = useEditorNetworkStore.getState().entries[NET];
    expect(entry.definition).toEqual([{ origin: "frontman", tools: ["barista"] }]);
    expect(entry.history).toHaveLength(before);
    expect(entry.networkName).toBe("coffee_shop");
  });

  it("does nothing when no definition is present", () => {
    applyFramesToStore(NET, frame({ agent_network_name: "coffee_shop" }), undefined, true);
    expect(useEditorNetworkStore.getState().entries[NET]).toBeUndefined();
  });

  it("does nothing without a networkId, so frames cannot land on the wrong network", () => {
    applyFramesToStore(undefined, frame({ connectivity_info: [{ origin: "frontman", tools: [] }] }), undefined, true);
    expect(useEditorNetworkStore.getState().entries[NET]).toBeUndefined();
  });

  it("a definition-less frame cannot clobber a definition from the other stream", () => {
    // progressHelper ranks definition-carrying payloads above definition-less ones,
    // so a trailing name-only progress frame must not erase a real definition.
    applyFramesToStore(
      NET,
      frame({ agent_network_name: "coffee_shop" }),
      frame({ connectivity_info: [{ origin: "frontman", tools: ["barista"] }] }),
      true
    );
    expect(useEditorNetworkStore.getState().entries[NET].definition).toEqual([
      { origin: "frontman", tools: ["barista"] },
    ]);
  });
});

describe("useEditorProgressBridge", () => {
  beforeEach(() => {
    useEditorNetworkStore.getState().reset(NET);
  });

  it("reads frames under targetNetwork but stores them under the edited network", () => {
    // The regression this guards: in editor mode every progress frame is tagged with
    // ChatContext's targetNetwork (the designer agent), never with the network the
    // editor is showing. Looking frames up under the edited network finds an empty
    // bucket, and the canvas renders nothing at all.
    const DESIGNER = "agent_network_designer";
    const progress = frame({ connectivity_info: [{ origin: "frontman", tools: ["barista"] }] });

    Object.assign(chatContext, {
      targetNetwork: DESIGNER,
      getLastProgressMessage: ({ network }: { network?: string }) =>
        network === DESIGNER ? progress : undefined,
      getLastSlyDataMessage: () => undefined,
      progressTick: 1,
      slyDataTick: 0,
      lastProgressAt: 2,
      lastSlyDataAt: 1,
    });

    renderHook(() => useEditorProgressBridge(NET));

    expect(useEditorNetworkStore.getState().entries[NET]?.definition).toEqual([
      { origin: "frontman", tools: ["barista"] },
    ]);
  });
});
