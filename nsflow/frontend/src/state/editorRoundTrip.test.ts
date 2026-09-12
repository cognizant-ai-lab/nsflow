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
    // designer's list-to-dict converter drops falsy values, so an agent whose
    // instructions the user cleared would arrive with no instructions key at all and
    // be reclassified as a toolbox tool.
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
