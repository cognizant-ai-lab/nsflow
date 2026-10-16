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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useEditorNetworkStore } from "./editorNetworkStore";
import { parseEchoedPayload, sendEditorUpdate } from "./editorRoundTrip";

const NET = "coffee_shop";
const API = "http://localhost:8005";

/** Frames as a live agent_network_designer actually returns them for an edit. */
const FRAMES = [
  { response: { type: "SYSTEM", text: "" } },
  { response: { type: "AGENT", text: "editing" } },
  {
    response: {
      type: "AGENT_FRAMEWORK",
      sly_data: {
        agent_network_definition: [
          { origin: "coffee_frontman", tools: ["barista"] },
          { origin: "barista", tools: [] },
        ],
      },
    },
  },
];

/** A fetch whose body streams the given lines, like the facade route does. */
const streamingFetch = (lines: object[]) =>
  vi.fn(async (_url: string, _init: RequestInit) => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        // Split across chunks that do not align to line boundaries, so the reader
        // is forced to buffer partial lines the way a real network does.
        const text = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
        const mid = Math.floor(text.length / 2);
        controller.enqueue(encoder.encode(text.slice(0, mid)));
        controller.enqueue(encoder.encode(text.slice(mid)));
        controller.close();
      },
    });
    return new Response(body, { status: 200, headers: { "content-type": "application/json-lines" } });
  });

describe("parseEchoedPayload", () => {
  it("extracts the definition from a frame that carries one", () => {
    const payload = parseEchoedPayload(FRAMES[2]);
    expect(payload?.definition).toEqual([
      { origin: "coffee_frontman", tools: ["barista"] },
      { origin: "barista", tools: [] },
    ]);
  });

  it("ignores frames with no definition, so a name-only frame cannot clobber state", () => {
    expect(parseEchoedPayload(FRAMES[0])).toBeUndefined();
    expect(parseEchoedPayload({ response: { type: "AGENT_FRAMEWORK", sly_data: { agent_network_name: "x" } } }))
      .toBeUndefined();
  });

  it("reads the network name and hocon when the frame carries them", () => {
    const payload = parseEchoedPayload({
      response: {
        type: "AGENT_FRAMEWORK",
        sly_data: {
          agent_network_definition: [{ origin: "a", tools: [] }],
          agent_network_name: "coffee_shop",
          agent_network_hocon_text: 'agent { name = "a" }',
        },
      },
    });
    expect(payload?.networkName).toBe("coffee_shop");
    expect(payload?.hocon).toBe('agent { name = "a" }');
  });
});

describe("sendEditorUpdate", () => {
  beforeEach(() => {
    useEditorNetworkStore.getState().reset(NET);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to nsflow's own streaming_chat route, targeting the designer", async () => {
    const fetchMock = streamingFetch(FRAMES);
    vi.stubGlobal("fetch", fetchMock);

    await sendEditorUpdate({
      apiUrl: API,
      networkId: NET,
      agentName: "barista",
      definition: [{ origin: "coffee_frontman", tools: ["barista"] }],
    });

    const [url, init] = fetchMock.mock.calls[0];
    // nsflow's own origin, never a neuro-san server directly
    expect(url).toBe(`${API}/api/v1/agent_network_designer/streaming_chat`);
    expect(init.method).toBe("POST");

    const body = JSON.parse(String(init.body));
    // Sent as the designer's dict shape, not the list shape the store holds. The
    // designer's list-to-dict converter drops falsy values, so an agent with empty
    // instructions, as AddAgent writes them, would arrive with no instructions key at
    // all and be reclassified as a toolbox tool.
    expect(body.sly_data.agent_network_definition).toEqual({
      coffee_frontman: { tools: ["barista"] },
    });
    // deterministic edit: the designer must not re-reason about the whole network
    expect(body.sly_data.skip_designer).toBe(true);
  });

  it("reconciles the echoed definition into the store", async () => {
    vi.stubGlobal("fetch", streamingFetch(FRAMES));

    await sendEditorUpdate({
      apiUrl: API,
      networkId: NET,
      agentName: "barista",
      definition: [{ origin: "coffee_frontman", tools: [] }],
    });

    expect(useEditorNetworkStore.getState().entries[NET].definition).toEqual([
      { origin: "coffee_frontman", tools: ["barista"] },
      { origin: "barista", tools: [] },
    ]);
  });

  it("reassembles frames split across chunk boundaries", async () => {
    // streamingFetch deliberately splits mid-line; if the reader did not buffer,
    // the definition-bearing frame would fail to parse and never reach the store.
    vi.stubGlobal("fetch", streamingFetch(FRAMES));
    const seen: string[] = [];

    await sendEditorUpdate({
      apiUrl: API,
      networkId: NET,
      agentName: "barista",
      definition: [],
      onFrame: (frame) => seen.push(String(frame.type)),
    });

    expect(seen).toEqual(["SYSTEM", "AGENT", "AGENT_FRAMEWORK"]);
  });

  it("leaves the store untouched when no frame carries a definition", async () => {
    vi.stubGlobal("fetch", streamingFetch([FRAMES[0], FRAMES[1]]));

    await sendEditorUpdate({ apiUrl: API, networkId: NET, agentName: "barista", definition: [] });

    expect(useEditorNetworkStore.getState().entries[NET]).toBeUndefined();
  });

  it("throws on a non-ok response so callers can surface it", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, _init: RequestInit) => new Response("nope", { status: 502 })));

    await expect(
      sendEditorUpdate({ apiUrl: API, networkId: NET, agentName: "barista", definition: [] })
    ).rejects.toThrow(/502/);
  });
});

describe("network name handling", () => {
  beforeEach(() => {
    useEditorNetworkStore.getState().reset(NET);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults the network name to what the store already learned", async () => {
    // Verified against a live designer: an edit without agent_network_name is
    // canonicalised but never persisted, so forgetting it fails silently.
    useEditorNetworkStore.getState().reconcileFromServer(NET, {
      definition: [{ origin: "coffee_frontman", tools: [] }],
      networkName: "coffee_shop_canonical",
    });

    const fetchMock = streamingFetch(FRAMES);
    vi.stubGlobal("fetch", fetchMock);

    await sendEditorUpdate({ apiUrl: API, networkId: NET, agentName: "barista", definition: [] });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.sly_data.agent_network_name).toBe("coffee_shop_canonical");
  });

  it("lets an explicit name override the stored one, for renames", async () => {
    useEditorNetworkStore.getState().reconcileFromServer(NET, {
      definition: [{ origin: "a", tools: [] }],
      networkName: "old_name",
    });

    const fetchMock = streamingFetch(FRAMES);
    vi.stubGlobal("fetch", fetchMock);

    await sendEditorUpdate({
      apiUrl: API, networkId: NET, agentName: "a", definition: [], networkName: "new_name",
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body)).sly_data.agent_network_name).toBe("new_name");
  });

  it("throws on an empty stream, which is how a mid-stream failure shows up", async () => {
    // A streaming response commits its 200 before the first chunk, so the backend
    // cannot report a later failure except by ending the stream. Treating that as
    // success would leave the optimistic apply looking saved when nothing was.
    vi.stubGlobal("fetch", streamingFetch([]));

    await expect(
      sendEditorUpdate({ apiUrl: API, networkId: NET, agentName: "a", definition: [] })
    ).rejects.toThrow(/empty stream/);
  });

  it("says what the edit was, so the transcript is not all agent updates", async () => {
    // Naming a network is not an agent edit, and the message is what shows up in the
    // chat panel and the designer's logs.
    const fetchMock = streamingFetch(FRAMES);
    vi.stubGlobal("fetch", fetchMock);

    await sendEditorUpdate({
      apiUrl: API, networkId: NET, agentName: "a", definition: [], message: 'Name this agent network "x"',
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.user_message.text).toBe('Name this agent network "x"');
  });
});

describe("the metadata block", () => {
  // The designer's contract for agent_network_metadata: no key means "keep the block of
  // the file this save goes over", and any value, {} included, is written as sent.
  const HELD = { sample_queries: ["Book me a trip to Paris."], date_created: "2026-01-01T00:00:00+00:00" };
  const ECHOED = { ...HELD, sample_queries: ["Generated query."], date_modified: "2026-02-02T00:00:00+00:00" };

  /** The sly_data of the nth save the mocked fetch received. */
  const sentSlyData = (fetchMock: ReturnType<typeof streamingFetch>, n = 0) =>
    JSON.parse(String(fetchMock.mock.calls[n][1].body)).sly_data;

  beforeEach(() => {
    useEditorNetworkStore.getState().reset(NET);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the block a frame echoes", () => {
    const payload = parseEchoedPayload({
      response: {
        type: "AGENT_FRAMEWORK",
        sly_data: { agent_network_definition: [{ origin: "a", tools: [] }], agent_network_metadata: ECHOED },
      },
    });
    expect(payload?.metadata).toEqual(ECHOED);
  });

  it("reads nothing about the block from a frame without one, or with one that is not a block", () => {
    // undefined is "nothing said", so the store keeps the block it holds.
    for (const echoed of [undefined, null, "not a block", ["q"]]) {
      const payload = parseEchoedPayload({
        response: {
          type: "AGENT_FRAMEWORK",
          sly_data: { agent_network_definition: [{ origin: "a", tools: [] }], agent_network_metadata: echoed },
        },
      });
      expect(payload?.metadata).toBeUndefined();
    }
  });

  it("sends the block the store holds for the network", async () => {
    useEditorNetworkStore.getState().reconcileFromServer(NET, {
      definition: [{ origin: "a", tools: [] }],
      networkName: "coffee_shop",
      metadata: HELD,
    });
    const fetchMock = streamingFetch(FRAMES);
    vi.stubGlobal("fetch", fetchMock);

    await sendEditorUpdate({ apiUrl: API, networkId: NET, agentName: "a", definition: [] });

    expect(sentSlyData(fetchMock).agent_network_metadata).toEqual(HELD);
  });

  it("sends no key, never {}, for a network the store holds no block for", async () => {
    // A draft built by hand, before its first save. {} would tell the designer to
    // wipe the block of the file the save goes over.
    useEditorNetworkStore.getState().applyEdit(NET, [{ origin: "a", tools: [] }]);
    const fetchMock = streamingFetch(FRAMES);
    vi.stubGlobal("fetch", fetchMock);

    await sendEditorUpdate({ apiUrl: API, networkId: NET, agentName: "a", definition: [] });

    expect(sentSlyData(fetchMock)).not.toHaveProperty("agent_network_metadata");
  });

  it("sends an explicit block over the held one, {} included", async () => {
    useEditorNetworkStore.getState().reconcileFromServer(NET, { definition: [], metadata: HELD });
    const fetchMock = streamingFetch(FRAMES);
    vi.stubGlobal("fetch", fetchMock);

    await sendEditorUpdate({ apiUrl: API, networkId: NET, agentName: "a", definition: [], metadata: {} });

    expect(sentSlyData(fetchMock).agent_network_metadata).toEqual({});
  });

  it("sends the block a save echoed on the next save", async () => {
    // The echo carries this save's dates and any queries the designer generated, and
    // the next save has to send those, not the block held before.
    useEditorNetworkStore.getState().reconcileFromServer(NET, {
      definition: [{ origin: "a", tools: [] }],
      networkName: "coffee_shop",
      metadata: HELD,
    });
    const echo = {
      response: {
        type: "AGENT_FRAMEWORK",
        sly_data: { agent_network_definition: [{ origin: "a", tools: [] }], agent_network_metadata: ECHOED },
      },
    };
    const fetchMock = streamingFetch([FRAMES[0], echo]);
    vi.stubGlobal("fetch", fetchMock);

    await sendEditorUpdate({ apiUrl: API, networkId: NET, agentName: "a", definition: [] });
    await sendEditorUpdate({ apiUrl: API, networkId: NET, agentName: "a", definition: [] });

    expect(sentSlyData(fetchMock, 0).agent_network_metadata).toEqual(HELD);
    expect(sentSlyData(fetchMock, 1).agent_network_metadata).toEqual(ECHOED);
    expect(useEditorNetworkStore.getState().entries[NET].metadata).toEqual(ECHOED);
  });
});

describe("a save whose signal aborts", () => {
  /** A frame echoing a one-agent definition, named by its text so each can be told apart. */
  const echoLine = (text: string) =>
    new TextEncoder().encode(
      `${JSON.stringify({
        response: { type: "AGENT_FRAMEWORK", text, sly_data: { agent_network_definition: [{ origin: text, tools: [] }] } },
      })}\n`
    );

  /**
   * A stream the test feeds by hand. It is not tied to the signal, like a chunk the
   * browser had already read when the abort came.
   */
  const handFedFetch = () => {
    let feed: ReadableStreamDefaultController<Uint8Array> | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        feed = controller;
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));
    return () => feed as ReadableStreamDefaultController<Uint8Array>;
  };

  /** How a save ended: the error's name, or "resolved". */
  const endedHow = (error?: unknown) => (error as Error | undefined)?.name ?? "resolved";

  /** The agents the store holds for the network. */
  const storedAgents = () => useEditorNetworkStore.getState().entries[NET]?.definition.map((agent) => agent.origin);

  beforeEach(() => {
    useEditorNetworkStore.getState().reset(NET);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes on and reconciles nothing that arrives after the abort", async () => {
    const feed = handFedFetch();
    const controller = new AbortController();
    const seen: unknown[] = [];
    let firstSeen: () => void = () => {};
    const first = new Promise<void>((resolve) => {
      firstSeen = resolve;
    });

    const saving = sendEditorUpdate({
      apiUrl: API,
      networkId: NET,
      agentName: "a",
      definition: [],
      signal: controller.signal,
      onFrame: (frame) => {
        seen.push(frame.text);
        firstSeen();
      },
    });
    feed().enqueue(echoLine("first"));
    await first;
    controller.abort();
    feed().enqueue(echoLine("second"));
    feed().close();

    const ending = await saving.then(endedHow, endedHow);

    expect(seen).toEqual(["first"]);
    expect(storedAgents()).toEqual(["first"]);
    expect(ending).toBe("AbortError");
  });

  it("stops between two frames of one chunk", async () => {
    const feed = handFedFetch();
    const controller = new AbortController();
    const seen: unknown[] = [];

    const saving = sendEditorUpdate({
      apiUrl: API,
      networkId: NET,
      agentName: "a",
      definition: [],
      signal: controller.signal,
      onFrame: (frame) => {
        seen.push(frame.text);
        controller.abort();
      },
    });
    const first = echoLine("first");
    const second = echoLine("second");
    const chunk = new Uint8Array(first.length + second.length);
    chunk.set(first);
    chunk.set(second, first.length);
    feed().enqueue(chunk);
    feed().close();

    const ending = await saving.then(endedHow, endedHow);

    expect(seen).toEqual(["first"]);
    expect(storedAgents()).toEqual(["first"]);
    expect(ending).toBe("AbortError");
  });

  it("reports the abort, not an empty stream, when it aborts before any frame", async () => {
    // The caller treats an abort as a newer save taking over, and an empty stream as a failure.
    const feed = handFedFetch();
    const controller = new AbortController();

    const saving = sendEditorUpdate({ apiUrl: API, networkId: NET, agentName: "a", definition: [], signal: controller.signal });
    controller.abort();
    feed().close();

    expect(await saving.then(endedHow, endedHow)).toBe("AbortError");
  });
});

describe("a save that stops being current", () => {
  /** A frame echoing a one-agent definition, named by its text so each can be told apart. */
  const echo = (text: string) =>
    JSON.stringify({
      response: { type: "AGENT_FRAMEWORK", text, sly_data: { agent_network_definition: [{ origin: text, tools: [] }] } },
    });

  /** A stream the test feeds by hand, and whether it was cancelled. */
  const handFedFetch = () => {
    let feed: ReadableStreamDefaultController<Uint8Array> | undefined;
    const state = { cancelled: false };
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        feed = controller;
      },
      cancel() {
        state.cancelled = true;
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));
    return { feed: () => feed as ReadableStreamDefaultController<Uint8Array>, state };
  };

  /** The agents the store holds for the network. */
  const storedAgents = () => useEditorNetworkStore.getState().entries[NET]?.definition.map((agent) => agent.origin);

  beforeEach(() => {
    useEditorNetworkStore.getState().reset(NET);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes on and reconciles nothing after that, but reads the stream to its end", async () => {
    // The server finishes a save only while its stream is read.
    const { feed, state } = handFedFetch();
    let current = true;
    const seen: unknown[] = [];
    let ended = false;

    const saving = sendEditorUpdate({
      apiUrl: API,
      networkId: NET,
      agentName: "a",
      definition: [],
      isCurrent: () => current,
      onFrame: (frame) => {
        seen.push(frame.text);
        current = false;
      },
    }).then(() => {
      ended = true;
    });
    feed().enqueue(new TextEncoder().encode(`${echo("first")}\n${echo("second")}\n`));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ended).toBe(false);
    feed().enqueue(new TextEncoder().encode(echo("last")));
    feed().close();
    await saving;

    expect(seen).toEqual(["first"]);
    expect(storedAgents()).toEqual(["first"]);
    expect(ended).toBe(true);
    expect(state.cancelled).toBe(false);
  });

  it("still resolves when it was never current, because its frames are still counted", async () => {
    const { feed } = handFedFetch();
    const seen: unknown[] = [];

    const saving = sendEditorUpdate({
      apiUrl: API,
      networkId: NET,
      agentName: "a",
      definition: [],
      isCurrent: () => false,
      onFrame: (frame) => seen.push(frame.text),
    });
    feed().enqueue(new TextEncoder().encode(echo("only")));
    feed().close();

    await expect(saving).resolves.toBeUndefined();
    expect(seen).toEqual([]);
    expect(storedAgents()).toBeUndefined();
  });
});
