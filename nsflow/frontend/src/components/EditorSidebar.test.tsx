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
 * Does opening an existing agent network actually reach the canvas?
 *
 * Reported symptom: picking a network, either with the pen icon on the home page or
 * from the Editor's own dropdown, left the canvas empty. The request succeeded and the
 * definition landed in the store, so the missing part was further along: the canvas
 * keys on the network the page thinks is selected, and nothing was telling the page.
 *
 * Both entry points funnel into the same handler, so these cover the handler and then
 * the URL parameter the pen icon uses.
 */

import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import EditorSidebar from "./EditorSidebar";
import { isToolboxTool } from "../state/definitionShape";
import { updateAgent } from "../state/editorOperations";
import { useEditorNetworkStore } from "../state/editorNetworkStore";
import { sendEditorUpdate } from "../state/editorRoundTrip";

const NETWORK_NAME = "generated/coffee_shop";

/** The sly_data of the designer's reply when it loads that network. */
const DEFINITION = {
  agent_network_definition: {
    frontman: { instructions: "You are the front man.", description: "Front desk.", tools: ["helper"] },
    helper: { instructions: "You help.", description: "Helps." },
  },
  agent_network_name: "coffee_shop",
  agent_network_metadata: {},
};

/** The sly_data the designer's load reply carries in the current test. */
let definitionResponse: Record<string, unknown> = DEFINITION;

/** The frames the designer answers a load with in the current test; undefined sends definitionResponse. */
let loadFrames: object[] | undefined;

/** The designer's reply to a load: its text, then the network in the last frame's sly_data. */
const loadReply = (slyData: Record<string, unknown>): object[] => {
  const text = `The network ${String(slyData.agent_network_name)} has been loaded.`;
  return [
    { response: { type: "SYSTEM", text: "You are the agent network designer." } },
    { response: { type: "AI", text } },
    { response: { type: "AGENT_FRAMEWORK", text, sly_data: slyData } },
  ];
};

vi.mock("../context/ApiPortContext", () => ({
  useApiPort: () => ({ apiUrl: "http://localhost:4173", isReady: true }),
}));

vi.mock("../context/NeuroSanContext", () => ({
  useNeuroSan: () => ({ host: "localhost", port: 30015, connectionType: "http", isNsReady: true }),
}));

vi.mock("../hooks/useChatControls", () => ({
  useChatControls: () => ({ stopWebSocket: vi.fn(), clearChat: vi.fn() }),
}));

/** Chat state a test sets over the defaults below; the sidebar reads it on its next render. */
let chatState: Record<string, unknown> = {};

vi.mock("../context/ChatContext", () => ({
  useChatContext: () => ({
    chatMessages: [],
    getLatestNetworkPayload: () => undefined,
    progressTick: 0,
    slyDataTick: 0,
    targetNetwork: "",
    activeNetwork: "",
    addSlyDataMessage: vi.fn(),
    regenerateSessionId: vi.fn(),
    waitingForAgent: false,
    ...chatState,
  }),
}));

/**
 * The dropdown is MUI Autocomplete, imported from the @mui/material barrel. Replacing
 * just that one export exposes its onChange directly, which avoids driving a combo box
 * through keyboard events to test something that has nothing to do with the widget.
 */
let autocompleteOnChange: ((event: unknown, value: unknown) => void) | undefined;

vi.mock("@mui/material", async () => {
  const actual = await vi.importActual<typeof import("@mui/material")>("@mui/material");
  return {
    ...actual,
    Autocomplete: ({ onChange }: { onChange?: (event: unknown, value: unknown) => void }) => {
      autocompleteOnChange = onChange;
      return <div data-testid="network-picker" />;
    },
  };
});

describe("opening an existing agent network", () => {
  beforeEach(() => {
    autocompleteOnChange = undefined;
    definitionResponse = DEFINITION;
    loadFrames = undefined;
    chatState = {};
    useEditorNetworkStore.setState({ entries: {} });
    window.history.replaceState({}, "", "/editor");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/streaming_chat")) {
          const slyData = JSON.parse(String(init?.body)).sly_data as Record<string, unknown>;
          // A load-only turn: a file to load, and no definition to save.
          if (slyData.agent_network_hocon_file && !slyData.agent_network_definition) {
            const frames = loadFrames ?? loadReply(definitionResponse);
            return new Response(frames.map((frame) => `${JSON.stringify(frame)}\n`).join(""), { status: 200 });
          }
          // One frame is all sendEditorUpdate needs to count the save as delivered.
          return new Response('{"response":{"type":"AGENT","text":"saved"}}\n', { status: 200 });
        }
        if (url.includes("/api/v1/list")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ agents: [{ agent_name: NETWORK_NAME }] }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      })
    );
  });

  /** The last save the stub was sent: a designer turn whose sly_data carries a definition. */
  const lastSave = () => {
    const saves = vi.mocked(fetch).mock.calls.filter(
      ([input, init]) =>
        String(input).includes("/streaming_chat") &&
        "agent_network_definition" in JSON.parse(String(init?.body)).sly_data
    );
    return saves[saves.length - 1];
  };

  it("tells the page which network was opened, so the canvas can render it", async () => {
    const onSelectNetwork = vi.fn();
    render(<EditorSidebar onSelectNetwork={onSelectNetwork} />);

    await waitFor(() => expect(autocompleteOnChange).toBeTypeOf("function"));
    await act(async () => {
      autocompleteOnChange!(null, NETWORK_NAME);
    });

    // The definition reaching the store is not enough on its own. EditorAgentFlow
    // keys on `selectedNetwork || draftKey`, and only the page can set
    // `selectedNetwork`, so without this call the canvas reads the empty draft entry
    // and shows nothing.
    await waitFor(() => expect(onSelectNetwork).toHaveBeenCalledWith(NETWORK_NAME));
  });

  it("puts the definition in the store under the name the canvas will look up", async () => {
    const onSelectNetwork = vi.fn();
    render(<EditorSidebar onSelectNetwork={onSelectNetwork} />);

    await waitFor(() => expect(autocompleteOnChange).toBeTypeOf("function"));
    await act(async () => {
      autocompleteOnChange!(null, NETWORK_NAME);
    });

    // The store key and the name handed to the page have to agree, or the canvas looks
    // up an entry that is not there.
    await waitFor(() => {
      const entry = useEditorNetworkStore.getState().entries[NETWORK_NAME];
      expect(entry?.definition.map((agent) => agent.origin).sort()).toEqual(["frontman", "helper"]);
    });
    expect(onSelectNetwork).toHaveBeenCalledWith(NETWORK_NAME);
  });

  it("stores the designer's own name for the entry, which a save then sends as agent_network_name", async () => {
    // A reply name unlike the stem, so the test shows that the entry's name comes from the served path.
    definitionResponse = { ...DEFINITION, agent_network_name: "not_the_stem" };
    const onSelectNetwork = vi.fn();
    render(<EditorSidebar onSelectNetwork={onSelectNetwork} />);

    await waitFor(() => expect(autocompleteOnChange).toBeTypeOf("function"));
    await act(async () => {
      autocompleteOnChange!(null, NETWORK_NAME);
    });

    // Two names, two jobs. The store key and the page's selection stay the served
    // path, which is what /api/v1/list returns and what the canvas looks up. The name
    // inside the entry is what every save sends as agent_network_name, and the
    // designer adds the subdirectory itself when it writes: handed the served path it
    // wrote a second file, generated/generated/coffee_shop.hocon, and left the opened
    // one untouched (#304).
    await waitFor(() =>
      expect(useEditorNetworkStore.getState().entries[NETWORK_NAME]?.networkName).toBe("coffee_shop")
    );
    expect(onSelectNetwork).toHaveBeenCalledWith(NETWORK_NAME);

    // The name really is what goes out: a save with no explicit name falls back to
    // the entry's, and the designer must see the raw one.
    await sendEditorUpdate({
      apiUrl: "http://localhost:8005",
      networkId: NETWORK_NAME,
      agentName: "helper",
      definition: useEditorNetworkStore.getState().entries[NETWORK_NAME]!.definition,
    });
    const saveCall = lastSave();
    expect(saveCall).toBeTruthy();
    const body = JSON.parse(String((saveCall![1] as RequestInit).body));
    expect(body.sly_data.agent_network_name).toBe("coffee_shop");
  });

  it("opens the network named in the loadNetwork URL parameter", async () => {
    // What the pen icon on the home page opens: /editor?loadNetwork=<name>
    window.history.replaceState({}, "", `/editor?loadNetwork=${encodeURIComponent(NETWORK_NAME)}`);
    const onSelectNetwork = vi.fn();

    render(<EditorSidebar onSelectNetwork={onSelectNetwork} />);

    await waitFor(() => expect(onSelectNetwork).toHaveBeenCalledWith(NETWORK_NAME));
    expect(useEditorNetworkStore.getState().entries[NETWORK_NAME]).toBeTruthy();
  });

  it("keeps every agent's description through the next save", async () => {
    render(<EditorSidebar onSelectNetwork={vi.fn()} />);

    await waitFor(() => expect(autocompleteOnChange).toBeTypeOf("function"));
    await act(async () => {
      autocompleteOnChange!(null, NETWORK_NAME);
    });
    await waitFor(() => expect(useEditorNetworkStore.getState().entries[NETWORK_NAME]).toBeTruthy());

    const loaded = useEditorNetworkStore.getState().entries[NETWORK_NAME].definition;
    expect(loaded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ origin: "frontman", description: "Front desk." }),
        expect.objectContaining({ origin: "helper", description: "Helps." }),
      ])
    );

    // Then save an edit the way the agent panel's Save button does: patch one agent in
    // the stored definition and send the whole definition. The designer writes the
    // network from what is sent and nothing else, so the agent nobody touched has to
    // keep its description too, or that save writes it back blank.
    await sendEditorUpdate({
      apiUrl: "http://localhost:4173",
      networkId: NETWORK_NAME,
      agentName: "helper",
      definition: updateAgent(loaded, "helper", { instructions: "You help more." }),
    });

    const save = lastSave();
    expect(save).toBeDefined();
    const body = JSON.parse(String((save![1] as RequestInit).body));
    expect(body.sly_data.agent_network_definition).toEqual({
      frontman: { instructions: "You are the front man.", description: "Front desk.", tools: ["helper"] },
      helper: { instructions: "You help more.", description: "Helps." },
    });
  });

  /** Open `name` through the dropdown and save it once, as the agent panel's Save does. */
  const openAndSave = async (name: string) => {
    render(<EditorSidebar onSelectNetwork={vi.fn()} />);
    await waitFor(() => expect(autocompleteOnChange).toBeTypeOf("function"));
    await act(async () => {
      autocompleteOnChange!(null, name);
    });
    await waitFor(() => expect(useEditorNetworkStore.getState().entries[name]?.definition.length).toBe(2));

    await sendEditorUpdate({
      apiUrl: "http://localhost:4173",
      networkId: name,
      agentName: "helper",
      definition: useEditorNetworkStore.getState().entries[name].definition,
    });
    const save = lastSave();
    expect(save).toBeDefined();
    return JSON.parse(String((save![1] as RequestInit).body)).sly_data as Record<string, unknown>;
  };

  it("sends the opened file's metadata block on the next save", async () => {
    // A network outside the designer's folder saves as a new file inside it, so the
    // designer has no file of that name to keep the block of. Without the block the
    // copy would start with no sample queries.
    const block = {
      description: "Talks music.",
      sample_queries: ["Who sang Imagine?"],
      date_created: "2026-01-01T00:00:00+00:00",
    };
    definitionResponse = { ...DEFINITION, agent_network_name: "music_nerd", agent_network_metadata: block };

    const slyData = await openAndSave("basic/music_nerd");

    expect(slyData.agent_network_name).toBe("music_nerd");
    expect(slyData.agent_network_metadata).toEqual(block);
  });

  it("drops a block held from an earlier visit when the file has none, and sends no key", async () => {
    // The store survives a reload, so the entry can hold a block the file no longer
    // has. Sending it would write it back; sending {} would wipe the file's block.
    useEditorNetworkStore.getState().reconcileFromServer(NETWORK_NAME, {
      definition: [{ origin: "frontman", tools: [] }],
      metadata: { sample_queries: ["Stale query."] },
    });

    const slyData = await openAndSave(NETWORK_NAME);

    expect(useEditorNetworkStore.getState().entries[NETWORK_NAME].metadata).toBeUndefined();
    expect(slyData).not.toHaveProperty("agent_network_metadata");
  });

  /** Render the sidebar and pick NETWORK_NAME in its dropdown. */
  const pick = async (onSelectNetwork: (network: string) => void = vi.fn()) => {
    render(<EditorSidebar onSelectNetwork={onSelectNetwork} />);
    await waitFor(() => expect(autocompleteOnChange).toBeTypeOf("function"));
    await act(async () => {
      autocompleteOnChange!(null, NETWORK_NAME);
    });
  };

  it("asks the designer to load the file", async () => {
    await pick();
    await waitFor(() => expect(useEditorNetworkStore.getState().entries[NETWORK_NAME]).toBeTruthy());

    const calls = vi.mocked(fetch).mock.calls;
    const loadCall = calls.find(([input]) => String(input).endsWith("/api/v1/agent_network_designer/streaming_chat"));
    expect(loadCall).toBeDefined();
    // The file and the boolean true, and nothing else: sent with a definition, the
    // designer saves that instead of loading the file.
    expect(JSON.parse(String((loadCall![1] as RequestInit).body)).sly_data).toEqual({
      agent_network_hocon_file: "generated/coffee_shop.hocon",
      skip_designer: true,
    });
    expect(calls.filter(([input]) => String(input).includes("network_definition"))).toEqual([]);
  });

  it("shows the designer's error and opens nothing", async () => {
    const error = {
      error: "Error: Failed to parse agent network config file 'generated/coffee_shop.hocon'.",
      tool: "agent_network_designer",
    };
    loadFrames = [
      { response: { type: "AI", text: `\`\`\`json\n${JSON.stringify(error)}\n\`\`\`` } },
      { response: { type: "AGENT_FRAMEWORK", text: "", structure: error } },
    ];
    const onSelectNetwork = vi.fn();

    await pick(onSelectNetwork);

    expect(
      await screen.findByText(
        `Could not open "${NETWORK_NAME}": Failed to parse agent network config file 'generated/coffee_shop.hocon'.`
      )
    ).toBeTruthy();
    expect(onSelectNetwork).not.toHaveBeenCalled();
    expect(useEditorNetworkStore.getState().entries[NETWORK_NAME]).toBeUndefined();
  });

  it("refuses a reply that saved instead of loading", async () => {
    // Older studio saves on this request, and its reply carries the HOCON text it wrote.
    definitionResponse = { ...DEFINITION, agent_network_hocon_text: "# coffee_shop" };
    const onSelectNetwork = vi.fn();

    await pick(onSelectNetwork);

    expect(
      await screen.findByText(
        /^Could not open "generated\/coffee_shop": neuro-san-studio saved this network instead of opening it\./
      )
    ).toBeTruthy();
    expect(onSelectNetwork).not.toHaveBeenCalled();
    expect(useEditorNetworkStore.getState().entries[NETWORK_NAME]).toBeUndefined();
  });

  it("posts nothing to the chat", async () => {
    // The chat's cache turns a reply's name into generated/<name>, which would move the page.
    const addSlyDataMessage = vi.fn();
    chatState = { addSlyDataMessage };

    await pick();

    await waitFor(() => expect(useEditorNetworkStore.getState().entries[NETWORK_NAME]?.definition).toHaveLength(2));
    expect(addSlyDataMessage).not.toHaveBeenCalled();
  });

  it("keeps a coded tool a tool", async () => {
    definitionResponse = {
      ...DEFINITION,
      agent_network_definition: {
        frontman: { instructions: "You are the front man.", description: "Front desk.", tools: ["Calc"] },
        // How the designer sends a coded tool: its description alone.
        Calc: { description: "Adds two numbers." },
      },
    };

    await pick();

    await waitFor(() => expect(useEditorNetworkStore.getState().entries[NETWORK_NAME]).toBeTruthy());
    const { definition } = useEditorNetworkStore.getState().entries[NETWORK_NAME];
    expect(isToolboxTool(definition.find((agent) => agent.origin === "Calc"))).toBe(true);
  });
});

describe("following the network a chat turn names", () => {
  beforeEach(() => {
    chatState = {};
    useEditorNetworkStore.setState({ entries: {} });
    window.history.replaceState({}, "", "/editor");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ agents: [] }) }) as Response)
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** The latest payload ChatContext reports for a frame naming `name`. */
  const payloadFor = (name: string) => ({
    agent_network_definition: { [`${name}_agent`]: { instructions: name, tools: [] } },
    agent_network_name: name,
  });

  it("does not move back to the earlier network when the refresh after a message runs", async () => {
    // Each render gets its own getter, as ChatContext's do, so a call kept from an
    // earlier render reads that render's frames.
    const coffee = payloadFor("coffee");
    const beta = payloadFor("beta");
    const onSelectNetwork = vi.fn();
    chatState = { getLatestNetworkPayload: () => coffee, progressTick: 1 };
    const { rerender } = render(<EditorSidebar onSelectNetwork={onSelectNetwork} />);
    await act(async () => {});
    expect(onSelectNetwork).toHaveBeenLastCalledWith("generated/coffee");

    // The user's message arms the refresh while coffee's frame is still the latest.
    chatState = { ...chatState, chatMessages: [{ sender: "system" }, { sender: "user" }] };
    rerender(<EditorSidebar onSelectNetwork={onSelectNetwork} />);
    await act(async () => {});

    // Before it runs, the turn's first frame names a new network.
    chatState = { ...chatState, getLatestNetworkPayload: () => beta, progressTick: 2 };
    rerender(<EditorSidebar onSelectNetwork={onSelectNetwork} />);
    await act(async () => {});
    expect(onSelectNetwork).toHaveBeenLastCalledWith("generated/beta");

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(onSelectNetwork).toHaveBeenLastCalledWith("generated/beta");
  });
});
