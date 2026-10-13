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
import { draftKeyFor } from "./editorSession";
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

  it("holds the block a chat turn saved, so the next manual save sends it", () => {
    // A designer turn generates sample queries and echoes the saved block in its
    // sly_data. Holding on to the older block would make the next manual save
    // send that one and lose the new queries.
    useEditorNetworkStore.getState().reconcileFromServer(NET, {
      definition: [{ origin: "frontman", tools: [] }],
      metadata: { sample_queries: ["Old query."] },
    });

    applyFramesToStore(
      NET,
      undefined,
      frame({
        agent_network_definition: { frontman: { instructions: "Greet", tools: [] } },
        agent_network_name: "coffee_shop",
        agent_network_metadata: { sample_queries: ["Generated query."] },
      }),
      false
    );

    expect(useEditorNetworkStore.getState().entries[NET].metadata).toEqual({ sample_queries: ["Generated query."] });
  });

  it("holds the block from a fenced sly_data frame whose instructions contain a code fence", () => {
    // The sly_data socket records the whole blob inside a ```json fence. A ``` in the
    // instructions must not end that fence, or the frame is unreadable and the old block stays.
    useEditorNetworkStore.getState().reconcileFromServer(NET, {
      definition: [{ origin: "frontman", tools: [] }],
      metadata: { sample_queries: ["Old query."] },
    });
    const definition = { frontman: { instructions: "Reply in a ```python``` block.", tools: [] } };
    const slyData = {
      agent_network_definition: definition,
      agent_network_name: "coffee_shop",
      agent_network_metadata: { sample_queries: ["Generated query."] },
    };

    applyFramesToStore(
      NET,
      frame({ agent_network_definition: definition, agent_network_name: "coffee_shop" }),
      { text: `\`\`\`json\n${JSON.stringify(slyData, null, 2)}\n\`\`\`` },
      false
    );

    expect(useEditorNetworkStore.getState().entries[NET].metadata).toEqual({ sample_queries: ["Generated query."] });
  });

  it("keeps the held block when the frame carries none", () => {
    // Progress frames never carry the block.
    useEditorNetworkStore.getState().reconcileFromServer(NET, {
      definition: [{ origin: "frontman", tools: [] }],
      metadata: { sample_queries: ["Held query."] },
    });

    applyFramesToStore(NET, frame({ connectivity_info: [{ origin: "frontman", tools: ["barista"] }] }), undefined, true);

    expect(useEditorNetworkStore.getState().entries[NET].metadata).toEqual({ sample_queries: ["Held query."] });
  });
});

describe("useEditorProgressBridge", () => {
  const DESIGNER = "agent_network_designer";

  beforeEach(() => {
    useEditorNetworkStore.getState().reset(NET);
  });

  /** Point the mocked ChatContext at one progress frame and one sly_data frame. */
  const recordFrames = (progress: unknown, slyData: unknown, lastProgressAt: number, lastSlyDataAt: number) => {
    Object.assign(chatContext, {
      targetNetwork: DESIGNER,
      getLastProgressMessage: ({ network }: { network?: string }) => (network === DESIGNER ? progress : undefined),
      getLastSlyDataMessage: ({ network }: { network?: string }) => (network === DESIGNER ? slyData : undefined),
      progressTick: lastProgressAt,
      slyDataTick: lastSlyDataAt,
      lastProgressAtByNetwork: { [DESIGNER]: lastProgressAt },
      lastSlyDataAtByNetwork: { [DESIGNER]: lastSlyDataAt },
    });
  };

  it("reads frames under targetNetwork but stores them under the edited network", () => {
    // The regression this guards: in editor mode every progress frame is tagged with
    // ChatContext's targetNetwork (the designer agent), never with the network the
    // editor is showing. Looking frames up under the edited network finds an empty
    // bucket, and the canvas renders nothing at all.
    const progress = frame({ connectivity_info: [{ origin: "frontman", tools: ["barista"] }] });

    Object.assign(chatContext, {
      targetNetwork: DESIGNER,
      getLastProgressMessage: ({ network }: { network?: string }) =>
        network === DESIGNER ? progress : undefined,
      getLastSlyDataMessage: () => undefined,
      progressTick: 1,
      slyDataTick: 0,
      lastProgressAtByNetwork: { [DESIGNER]: 2 },
      lastSlyDataAtByNetwork: { [DESIGNER]: 1 },
    });

    renderHook(() => useEditorProgressBridge(NET));

    expect(useEditorNetworkStore.getState().entries[NET]?.definition).toEqual([
      { origin: "frontman", tools: ["barista"] },
    ]);
  });

  describe("the metadata block", () => {
    const GREET = { frontman: { instructions: "Greet", tools: [] } };
    const GREET_WARMLY = { frontman: { instructions: "Greet warmly", tools: [] } };

    /** Hold a block for an entry, the way an earlier frame or save echo leaves one. */
    const hold = (networkId: string, networkName: string, metadata: Record<string, unknown>) =>
      useEditorNetworkStore.getState().reconcileFromServer(networkId, {
        definition: [{ origin: "frontman", tools: [] }],
        networkName,
        metadata,
      });

    it("takes the block of a sly_data frame recorded in the same millisecond as the last progress frame", () => {
      // The sly_data frame ends the turn and carries the block it saved. Losing the
      // tie keeps the older block, and the next manual save would send that one.
      hold(NET, NET, { sample_queries: ["Old query."] });
      recordFrames(
        frame({ agent_network_definition: GREET, agent_network_name: NET }),
        frame({
          agent_network_definition: GREET,
          agent_network_name: NET,
          agent_network_metadata: { sample_queries: ["Generated query."] },
        }),
        1000,
        1000
      );

      renderHook(() => useEditorProgressBridge(NET));

      const entry = useEditorNetworkStore.getState().entries[NET];
      expect(entry.metadata).toEqual({ sample_queries: ["Generated query."] });
      expect(entry.networkName).toBe(NET);
      expect(entry.definition).toEqual([{ origin: "frontman", tools: [], instructions: "Greet" }]);
    });

    it("decides on this stream's own times, not on the global ones", () => {
      // The global times also move for frames that never reach this stream, so here
      // they say progress is newer while the stream's own times say sly_data is.
      hold(NET, NET, { sample_queries: ["Old query."] });
      recordFrames(
        frame({ agent_network_definition: GREET, agent_network_name: NET }),
        frame({
          agent_network_definition: GREET,
          agent_network_name: NET,
          agent_network_metadata: { sample_queries: ["Generated query."] },
        }),
        1,
        2
      );
      Object.assign(chatContext, { lastProgressAt: 5, lastSlyDataAt: 2 });

      renderHook(() => useEditorProgressBridge(NET));

      expect(useEditorNetworkStore.getState().entries[NET].metadata).toEqual({ sample_queries: ["Generated query."] });
    });

    it("keeps the block a sly_data frame gave when a newer progress frame arrives", () => {
      // Progress frames never carry the block, so a newer one changes the definition
      // and leaves the saved block alone.
      hold(NET, NET, { sample_queries: ["Old query."] });
      const slyData = frame({
        agent_network_definition: GREET,
        agent_network_name: NET,
        agent_network_metadata: { sample_queries: ["Generated query."] },
      });
      recordFrames(undefined, slyData, 1, 2);
      const { rerender } = renderHook(() => useEditorProgressBridge(NET));

      recordFrames(frame({ agent_network_definition: GREET_WARMLY, agent_network_name: NET }), slyData, 3, 2);
      rerender();

      const entry = useEditorNetworkStore.getState().entries[NET];
      expect(entry.definition).toEqual([{ origin: "frontman", tools: [], instructions: "Greet warmly" }]);
      expect(entry.metadata).toEqual({ sample_queries: ["Generated query."] });
    });

    it("does not bring back an older block from the last sly_data frame when progress is newer", () => {
      // A rename or an agent-panel save takes the echoed block straight into the
      // store, and its echo never reaches the sly_data stream. That stream's last
      // frame is then older than the held block.
      hold(NET, NET, { sample_queries: ["q"], date_modified: "T2" });
      recordFrames(
        frame({ agent_network_definition: GREET_WARMLY, agent_network_name: NET }),
        frame({
          agent_network_definition: GREET,
          agent_network_name: NET,
          agent_network_metadata: { sample_queries: ["q"], date_modified: "T1" },
        }),
        3,
        2
      );

      renderHook(() => useEditorProgressBridge(NET));

      expect(useEditorNetworkStore.getState().entries[NET].metadata).toEqual({
        sample_queries: ["q"],
        date_modified: "T2",
      });
    });

    it("does not give a network the block of the network the last sly_data frame names", () => {
      // Frames are kept per Editor visit, not per network. After the canvas moves to
      // network B, the last sly_data frame can still be network A's.
      const A = "generated/network_a";
      const B = "generated/network_b";
      useEditorNetworkStore.getState().reset(A);
      useEditorNetworkStore.getState().reset(B);
      recordFrames(
        frame({ agent_network_definition: GREET_WARMLY, agent_network_name: "network_b" }),
        frame({
          agent_network_definition: GREET,
          agent_network_name: "network_a",
          agent_network_metadata: { sample_queries: ["A query."], date_created: "A0" },
        }),
        3,
        2
      );
      const { rerender } = renderHook(({ networkId }) => useEditorProgressBridge(networkId), {
        initialProps: { networkId: A },
      });

      rerender({ networkId: B });

      const entry = useEditorNetworkStore.getState().entries[B];
      expect(entry.networkName).toBe("network_b");
      expect(entry.definition).toEqual([{ origin: "frontman", tools: [], instructions: "Greet warmly" }]);
      expect(entry.metadata).toBeUndefined();
      // The winning frame names B, so A never took it while A was on the canvas.
      expect(useEditorNetworkStore.getState().entries[A]).toBeUndefined();
    });
  });

  describe("frames named for another network", () => {
    const ALPHA = "generated/alpha";
    const BETA = "generated/beta";
    const COFFEE = "generated/coffee";
    const ALPHA_DEFINITION = { alpha_front: { instructions: "Alpha", tools: [] } };
    const BETA_DEFINITION = { beta_front: { instructions: "Beta", tools: [] } };
    const COFFEE_DEFINITION = { coffee_front: { instructions: "Coffee", tools: [] } };

    /** Open a network the way Load Existing does: straight into the store, block and all. */
    const open = (networkId: string, networkName: string, metadata: Record<string, unknown>) =>
      useEditorNetworkStore.getState().reconcileFromServer(networkId, {
        definition: [{ origin: `${networkName}_front`, tools: ["as_opened"] }],
        networkName,
        metadata,
      });

    /** The parts of an entry a frame can change. */
    const held = (networkId: string) => {
      const entry = useEditorNetworkStore.getState().entries[networkId];
      return entry && { networkName: entry.networkName, definition: entry.definition, metadata: entry.metadata };
    };

    const renderBridge = (networkId: string) =>
      renderHook(({ networkId: id }) => useEditorProgressBridge(id), { initialProps: { networkId } });

    beforeEach(() => {
      for (const networkId of [ALPHA, BETA, COFFEE]) useEditorNetworkStore.getState().reset(networkId);
    });

    it("does not give an opened network the frames of the network open before it", () => {
      // A save still in flight when the network is opened publishes its echo after the
      // open, so the newest frame can be the earlier network's, with its block.
      open(BETA, "beta", { description: "Beta file block" });
      const opened = held(BETA);
      recordFrames(
        frame({ agent_network_definition: ALPHA_DEFINITION, agent_network_name: "alpha" }),
        frame({
          agent_network_definition: ALPHA_DEFINITION,
          agent_network_name: "alpha",
          agent_network_metadata: { description: "Alpha block" },
        }),
        1,
        2
      );

      renderBridge(BETA);

      expect(held(BETA)).toEqual(opened);
    });

    it("keeps a chat turn's frame for a new network off the network still on the canvas", () => {
      // The sidebar moves the canvas to the network a frame names, but in that same
      // commit the bridge sees the frame under the network still on the canvas.
      open(ALPHA, "alpha", { sample_queries: ["Alpha query."] });
      const opened = held(ALPHA);
      recordFrames(frame({ agent_network_definition: BETA_DEFINITION, agent_network_name: "beta" }), undefined, 1, 0);

      renderBridge(ALPHA);

      expect(held(ALPHA)).toEqual(opened);
    });

    it("keeps the frames off the earlier network when the canvas moves back to it", () => {
      // The sidebar's delayed refresh can select the earlier network again while the
      // newest frame, here the turn's sly_data with its block, names the new one.
      open(ALPHA, "alpha", { sample_queries: ["Alpha query."] });
      const opened = held(ALPHA);
      const progress = frame({ agent_network_definition: BETA_DEFINITION, agent_network_name: "beta" });
      recordFrames(progress, undefined, 1, 0);
      const { rerender } = renderBridge(BETA);
      recordFrames(
        progress,
        frame({
          agent_network_definition: BETA_DEFINITION,
          agent_network_name: "beta",
          agent_network_metadata: { sample_queries: ["Beta query."] },
        }),
        1,
        2
      );
      rerender({ networkId: BETA });

      rerender({ networkId: ALPHA });

      expect(held(ALPHA)).toEqual(opened);
      expect(held(BETA)?.metadata).toEqual({ sample_queries: ["Beta query."] });
    });

    it("hands a chat turn's frames to the network they name once the canvas moves there", () => {
      open(ALPHA, "alpha", { sample_queries: ["Alpha query."] });
      const progress = frame({ agent_network_definition: BETA_DEFINITION, agent_network_name: "beta" });
      recordFrames(progress, undefined, 1, 0);
      const { rerender } = renderBridge(ALPHA);

      rerender({ networkId: BETA });

      expect(held(BETA)).toEqual({
        networkName: "beta",
        definition: [{ origin: "beta_front", tools: [], instructions: "Beta" }],
        metadata: undefined,
      });

      // The turn ends with its sly_data frame, which carries the block it saved.
      recordFrames(
        progress,
        frame({
          agent_network_definition: BETA_DEFINITION,
          agent_network_name: "beta",
          agent_network_metadata: { sample_queries: ["Beta query."] },
        }),
        1,
        2
      );
      rerender({ networkId: BETA });

      expect(held(BETA)?.metadata).toEqual({ sample_queries: ["Beta query."] });
    });

    it("keeps a frame naming a network off a new draft, which has no name to match", () => {
      // A draft key is never a network's name, so a named frame always belongs to
      // another entry, such as the network a chat turn has just named.
      const draft = draftKeyFor("bridge_test");
      useEditorNetworkStore.getState().reset(draft);
      useEditorNetworkStore.getState().applyEdit(draft, [{ origin: "frontman", tools: [] }]);
      const drawn = held(draft);
      recordFrames(
        undefined,
        frame({
          agent_network_definition: ALPHA_DEFINITION,
          agent_network_name: "alpha",
          agent_network_metadata: { sample_queries: ["Alpha query."] },
        }),
        0,
        1
      );

      renderBridge(draft);

      expect(held(draft)).toEqual(drawn);
      expect(held(draft)?.networkName).toBeUndefined();
    });

    it("fills the network a draft's first chat turn names", () => {
      // The draft's own entry stays as drawn: the turn lives under its new name.
      const draft = draftKeyFor("bridge_test");
      useEditorNetworkStore.getState().reset(draft);
      recordFrames(
        frame({ agent_network_definition: COFFEE_DEFINITION, agent_network_name: "coffee" }),
        frame({
          agent_network_definition: COFFEE_DEFINITION,
          agent_network_name: "coffee",
          agent_network_metadata: { sample_queries: ["Coffee query."] },
        }),
        1,
        2
      );
      const { rerender } = renderBridge(draft);

      rerender({ networkId: COFFEE });

      expect(held(COFFEE)).toEqual({
        networkName: "coffee",
        definition: [{ origin: "coffee_front", tools: [], instructions: "Coffee" }],
        metadata: { sample_queries: ["Coffee query."] },
      });
      expect(held(draft)).toBeUndefined();
    });

    it("lands a frame on a network opened from another folder", () => {
      // The designer names a network by its file's stem, whatever folder it was opened from.
      const HELLO = "basic/hello_world";
      useEditorNetworkStore.getState().reset(HELLO);
      open(HELLO, "hello_world", { description: "Hello block" });
      recordFrames(
        frame({
          agent_network_definition: { hello_world_front: { instructions: "Say hello", tools: [] } },
          agent_network_name: "hello_world",
        }),
        undefined,
        1,
        0
      );

      renderBridge(HELLO);

      expect(held(HELLO)?.definition).toEqual([{ origin: "hello_world_front", tools: [], instructions: "Say hello" }]);
    });

    it("lands a frame whose name has a folder on the network the sidebar opens for it", () => {
      // The designer can choose a nested name, and the sidebar then selects
      // "generated/<that name>". Both sides compare by stem.
      const NESTED = "generated/team/coffee";
      useEditorNetworkStore.getState().reset(NESTED);
      recordFrames(frame({ agent_network_definition: COFFEE_DEFINITION, agent_network_name: "team/coffee" }), undefined, 1, 0);

      renderBridge(NESTED);

      expect(held(NESTED)).toEqual({
        networkName: "team/coffee",
        definition: [{ origin: "coffee_front", tools: [], instructions: "Coffee" }],
        metadata: undefined,
      });
    });

    it("applies a run of progress frames, with or without a name", () => {
      // The designer reports a single agent change without the network's name.
      const front = { coffee_front: { instructions: "Coffee", tools: ["barista"] } };
      const barista = { barista: { instructions: "Brew", tools: [] } };
      const till = { till: { instructions: "Charge", tools: [] } };
      recordFrames(frame({ agent_network_definition: COFFEE_DEFINITION, agent_network_name: "coffee" }), undefined, 1, 0);
      const { rerender } = renderBridge(COFFEE);

      recordFrames(frame({ agent_network_definition: { ...front, ...barista } }), undefined, 2, 0);
      rerender({ networkId: COFFEE });
      recordFrames(frame({ agent_network_definition: { ...front, ...barista, ...till } }), undefined, 3, 0);
      rerender({ networkId: COFFEE });

      const entry = held(COFFEE);
      expect(entry?.networkName).toBe("coffee");
      expect(entry?.definition.map((agent) => agent.origin)).toEqual(["coffee_front", "barista", "till"]);
    });

    it("takes a chat turn's frames after a local rename, and the block they carry", () => {
      // The chat sends the name of its own last frame, not the renamed one, so the
      // designer saves the turn under that name and the entry follows it.
      open(COFFEE, "coffee", { sample_queries: ["Q1"] });
      useEditorNetworkStore.getState().reconcileFromServer(COFFEE, {
        definition: held(COFFEE)!.definition,
        networkName: "latte",
      });
      recordFrames(
        frame({ agent_network_definition: COFFEE_DEFINITION, agent_network_name: "coffee" }),
        frame({
          agent_network_definition: COFFEE_DEFINITION,
          agent_network_name: "coffee",
          agent_network_metadata: { sample_queries: ["Q2"] },
        }),
        1,
        2
      );

      renderBridge(COFFEE);

      expect(held(COFFEE)).toEqual({
        networkName: "coffee",
        definition: [{ origin: "coffee_front", tools: [], instructions: "Coffee" }],
        metadata: { sample_queries: ["Q2"] },
      });
    });
  });
});
