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

import { isToolboxTool } from "./definitionShape";
import { designerLoadFile, loadNetworkThroughDesigner } from "./designerLoad";
import { useEditorNetworkStore } from "./editorNetworkStore";

const API = "http://api";
const SERVED = "basic/music_nerd";

/** The request neuro-san echoes as `request` on every line it streams over HTTP. */
const REQUEST = {
  user_message: { text: `Load agent network "${SERVED}"` },
  chat_filter: { chat_filter_type: "MAXIMAL" },
  sly_data: { agent_network_hocon_file: `${SERVED}.hocon`, skip_designer: true },
};

/** A network in the designer's dict shape, as a load returns it. */
const MUSIC_NERD = {
  MusicNerd: { instructions: "You answer questions about music.", description: "Talks music.", tools: ["Accountant"] },
  Accountant: { instructions: "You keep a running cost.", description: "Counts the cost." },
};

/** MUSIC_NERD in the list shape the store holds. */
const MUSIC_NERD_LIST = [
  {
    origin: "MusicNerd",
    tools: ["Accountant"],
    instructions: "You answer questions about music.",
    description: "Talks music.",
  },
  { origin: "Accountant", tools: [], instructions: "You keep a running cost.", description: "Counts the cost." },
];

/** A file's metadata block. */
const BLOCK = { description: "Talks music.", sample_queries: ["Who sang Imagine?"] };

/** The token accounting frame the designer sends twice before its last frame. */
const ACCOUNTING = { type: "AGENT", text: "", structure: { total_tokens: 0, time_taken_in_seconds: 0.01 } };

/** The first two frames of every reply: the designer's system prompt, then the request text. */
const SYSTEM_FRAME = { type: "SYSTEM", text: "You are the agent network designer." };
const HUMAN_FRAME = { type: "HUMAN", text: `Load agent network "${SERVED}"` };

/**
 * A successful load, in the order studio sends it: its system prompt, the request text,
 * the reply, two accounting frames, then the network in the last frame's sly_data.
 */
const loadedReply = (slyData: Record<string, unknown>): object[] => [
  SYSTEM_FRAME,
  HUMAN_FRAME,
  { type: "AI", text: "The network music_nerd has been loaded." },
  ACCOUNTING,
  ACCOUNTING,
  { type: "AGENT_FRAMEWORK", text: "The network music_nerd has been loaded.", sly_data: slyData, chat_context: {} },
];

/** The body nsflow streams: one line per message, each next to the echoed request. */
const streamOf = (messages: object[]): string =>
  messages.map((response) => `${JSON.stringify({ request: REQUEST, response })}\n`).join("");

/** Stub fetch to answer every request with `body`, and return the mock. */
const answer = (body: string, init: ResponseInit = { status: 200 }) => {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(body, init));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

/** Load SERVED through the stubbed fetch. */
const load = (signal?: AbortSignal) => loadNetworkThroughDesigner({ apiUrl: API, servedName: SERVED, signal });

/** What a load rejected with, or undefined when it resolved. */
const failureOf = (loading: Promise<unknown>): Promise<Error | undefined> =>
  loading.then(
    () => undefined,
    (error: unknown) => error as Error
  );

describe("designerLoadFile", () => {
  it("adds the suffix that a served name leaves off", () => {
    expect(designerLoadFile("basic/music_nerd")).toBe("basic/music_nerd.hocon");
  });
});

describe("loadNetworkThroughDesigner", () => {
  beforeEach(() => {
    useEditorNetworkStore.setState({ entries: {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks the designer to load the file, and sends nothing else", async () => {
    const fetchMock = answer(streamOf(loadedReply({ agent_network_definition: MUSIC_NERD })));
    const controller = new AbortController();

    await load(controller.signal);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api/api/v1/agent_network_designer/streaming_chat");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "Content-Type": "application/json" });
    expect(init?.signal).toBe(controller.signal);
    // A file, and skip_designer as the boolean true, with no definition: the designer
    // loads the file and saves nothing. Sent with a definition, it saves that instead.
    expect(JSON.parse(String(init?.body))).toEqual({
      user_message: { text: 'Load agent network "basic/music_nerd"' },
      chat_filter: { chat_filter_type: "MAXIMAL" },
      sly_data: { agent_network_hocon_file: "basic/music_nerd.hocon", skip_designer: true },
    });
  });

  it("reads the network from the last frame of a reply in studio's frame order", async () => {
    const reply = loadedReply({
      agent_network_definition: MUSIC_NERD,
      agent_network_name: "music_nerd",
      agent_network_metadata: BLOCK,
    });
    // An earlier frame with a network of its own, so taking the first one would show.
    reply.splice(3, 0, { type: "AGENT", text: "", sly_data: { agent_network_definition: { Stale: {} } } });
    answer(streamOf(reply));

    expect(await load()).toEqual({ definition: MUSIC_NERD_LIST, metadata: BLOCK });
    // The caller decides where the network goes.
    expect(useEditorNetworkStore.getState().entries).toEqual({});
  });

  it.each([
    ["the block when the file has one", { agent_network_metadata: BLOCK }, BLOCK],
    // {} is a block to the designer: sent back on the next save, it wipes the block of
    // the file that save goes over.
    ["null when the designer sends an empty block", { agent_network_metadata: {} }, null],
    ["null when the designer sends no block", {}, null],
  ])("returns %s", async (_case, metadata, expected) => {
    answer(streamOf(loadedReply({ agent_network_definition: MUSIC_NERD, agent_network_name: "music_nerd", ...metadata })));

    expect((await load()).metadata).toEqual(expected);
  });

  it("keeps a coded tool a tool, and an entry with instructions an agent", async () => {
    answer(
      streamOf(
        loadedReply({
          agent_network_definition: {
            front: {
              instructions: "Route the request.",
              description: "Front desk.",
              tools: ["blank", "Calc", "unwritten", "/basic/music_nerd"],
            },
            blank: { instructions: "", description: "" },
            Calc: { description: "Adds two numbers." },
            // What the designer sends for an agent whose file has blank instructions.
            unwritten: { description: "" },
          },
        })
      )
    );

    const { definition } = await load();

    // A tool in nsflow has neither text field. An instructions key keeps an entry an
    // agent, even when it is blank.
    expect(definition).toStrictEqual([
      {
        origin: "front",
        tools: ["blank", "Calc", "unwritten", "/basic/music_nerd"],
        instructions: "Route the request.",
        description: "Front desk.",
      },
      { origin: "blank", tools: [], instructions: "", description: "" },
      { origin: "Calc", tools: [] },
      { origin: "unwritten", tools: [] },
    ]);
    expect(isToolboxTool(definition[1])).toBe(false);
    expect(isToolboxTool(definition[2])).toBe(true);
    expect(isToolboxTool(definition[3])).toBe(true);
  });

  it("leaves the entry of an external reference as it came", async () => {
    answer(
      streamOf(
        loadedReply({
          agent_network_definition: {
            front: { instructions: "Route the request.", description: "Front desk.", tools: ["/basic/music_nerd"] },
            "/basic/music_nerd": { description: "Talks music." },
          },
        })
      )
    );

    const { definition } = await load();

    expect(definition[1]).toStrictEqual({ origin: "/basic/music_nerd", tools: [], description: "Talks music." });
  });

  it("rejects with the designer's error from the last frame, without its prefix", async () => {
    const error = {
      error: "Error: Failed to parse agent network config file 'basic/music_nerd.hocon'.",
      tool: "agent_network_designer",
    };
    answer(
      streamOf([
        SYSTEM_FRAME,
        HUMAN_FRAME,
        // The designer formats its errors as JSON, so the reply text is a json block.
        { type: "AI", text: `\`\`\`json\n${JSON.stringify(error)}\n\`\`\`` },
        ACCOUNTING,
        ACCOUNTING,
        { type: "AGENT_FRAMEWORK", text: "", structure: error },
      ])
    );

    expect((await failureOf(load()))?.message).toBe(
      "Failed to parse agent network config file 'basic/music_nerd.hocon'."
    );
  });

  it("rejects a reply that carries an error, even with a definition", async () => {
    // What older studio sends when it hands this request to the model and the model fails.
    answer(
      streamOf([
        SYSTEM_FRAME,
        HUMAN_FRAME,
        {
          type: "AGENT_FRAMEWORK",
          text: "",
          structure: { error: "Agent stopped due to exception: no API key", tool: "agent_network_designer" },
          sly_data: { agent_network_definition: MUSIC_NERD, agent_network_name: "music_nerd" },
        },
      ])
    );

    expect((await failureOf(load()))?.message).toBe("Agent stopped due to exception: no API key");
    expect(useEditorNetworkStore.getState().entries).toEqual({});
  });

  it("counts a blank error as none", async () => {
    const blank = { type: "AGENT_FRAMEWORK", text: "", structure: { error: "  " } };

    answer(streamOf([{ type: "AGENT_FRAMEWORK", text: "", structure: { error: "Error: real problem" } }, blank]));
    expect((await failureOf(load()))?.message).toBe("real problem");

    answer(streamOf([...loadedReply({ agent_network_definition: MUSIC_NERD }), blank]));
    expect((await load()).definition).toEqual(MUSIC_NERD_LIST);
  });

  it.each([
    // The designer's prompt and nsflow's own request text are never shown as the reason.
    ["stops before the designer answers", [SYSTEM_FRAME, HUMAN_FRAME]],
    [
      "has no network and no error",
      [SYSTEM_FRAME, HUMAN_FRAME, { type: "AI", text: "Some words." }, ACCOUNTING, { type: "AGENT_FRAMEWORK", text: "" }],
    ],
  ])("rejects with its own message when the reply %s", async (_case, frames) => {
    answer(streamOf(frames));

    expect((await failureOf(load()))?.message).toBe("the designer did not return the network");
  });

  it("rejects an empty stream", async () => {
    answer("\n \n");

    expect((await failureOf(load()))?.message).toBe(
      "the designer sent no reply. Check that the neuro-san server is running and serves agent_network_designer."
    );
  });

  it("rejects a network with no agents", async () => {
    // The list form of the designer's {} is [], which is not a missing definition.
    answer(streamOf(loadedReply({ agent_network_definition: {}, agent_network_name: "music_nerd" })));

    expect((await failureOf(load()))?.message).toBe("the designer returned no agents");
    expect(useEditorNetworkStore.getState().entries).toEqual({});
  });

  it.each([
    ["on the frame with the definition", 1],
    ["on an earlier frame", 0],
  ])("rejects a reply that saved the network, with the HOCON text %s", async (_case, hoconFrame) => {
    // What older studio does with this request. Only a save sends the HOCON text back.
    const frames: Record<string, unknown>[] = [
      { type: "AI", text: "The network music_nerd has been modified by the user." },
      {
        type: "AGENT_FRAMEWORK",
        text: "The network music_nerd has been modified by the user.",
        sly_data: { agent_network_definition: MUSIC_NERD, agent_network_name: "music_nerd" },
      },
    ];
    frames[hoconFrame] = {
      ...frames[hoconFrame],
      sly_data: { ...(frames[hoconFrame].sly_data as object), agent_network_hocon_text: "# music_nerd" },
    };
    answer(streamOf(frames));

    expect((await failureOf(load()))?.message).toBe(
      "neuro-san-studio saved this network instead of opening it. Load Existing needs neuro-san-studio 0.4.3 or later."
    );
  });

  it("rejects a failed request with the server's detail, or else its status", async () => {
    answer(JSON.stringify({ detail: "Request body must be valid JSON" }), {
      status: 422,
      statusText: "Unprocessable Entity",
    });
    expect((await failureOf(load()))?.message).toBe("Request body must be valid JSON");

    // A detail that is not text, such as FastAPI's list of field errors, is left out.
    answer(JSON.stringify({ detail: [{ loc: ["body"], msg: "bad" }] }), {
      status: 422,
      statusText: "Unprocessable Entity",
    });
    expect((await failureOf(load()))?.message).toBe("422 Unprocessable Entity");

    answer("<html>Bad Gateway</html>", { status: 502, statusText: "Bad Gateway" });
    expect((await failureOf(load()))?.message).toBe("502 Bad Gateway");
  });

  it("rejects with an AbortError, not the failed status, when the signal aborted before the request", async () => {
    // The stub ignores the signal, like a response that was already on its way.
    answer("", { status: 502, statusText: "Bad Gateway" });
    const controller = new AbortController();
    controller.abort();

    expect((await failureOf(load(controller.signal)))?.name).toBe("AbortError");
  });

  it("rejects with an AbortError when the signal aborts while the body is read", async () => {
    const controller = new AbortController();
    const body = streamOf(loadedReply({ agent_network_definition: MUSIC_NERD }));
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            text: async () => {
              controller.abort();
              return body;
            },
          }) as Response
      )
    );

    expect((await failureOf(load(controller.signal)))?.name).toBe("AbortError");
  });

  it("rejects with an AbortError when the signal aborts while an error body is read", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 502,
            statusText: "Bad Gateway",
            json: async (): Promise<unknown> => {
              controller.abort();
              throw new DOMException("The operation was aborted.", "AbortError");
            },
          }) as Response
      )
    );

    expect((await failureOf(load(controller.signal)))?.name).toBe("AbortError");
  });

  it("skips a malformed line", async () => {
    answer(`{"response": {"type": "AI", "te\n${streamOf(loadedReply({ agent_network_definition: MUSIC_NERD }))}`);

    expect((await load()).definition).toEqual(MUSIC_NERD_LIST);
  });
});
