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
 * Does New network leave the network that is open, and does a save's echo land only
 * on the network it was saved for?
 *
 * The page owns the selected network, the sidebar keeps its own selection, and the
 * chat keeps a cache of the designer's frames. All three decide what the canvas
 * shows and what a save writes, so these tests mount the real Editor page against a
 * stubbed server and look at what was saved and what the store holds.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The canvas's handler for edges deleted with the Delete key, so a test can delete one. */
let deleteEdges: ((edges: { source: string; target: string }[]) => void) | undefined;

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<typeof import("@xyflow/react")>("@xyflow/react");
  return {
    ...actual,
    ReactFlow: ({
      nodes,
      children,
      onNodeClick,
      onNodeDoubleClick,
      onEdgesDelete,
    }: {
      nodes: { id: string }[];
      children?: React.ReactNode;
      onNodeClick?: (event: unknown, node: unknown) => void;
      onNodeDoubleClick?: (event: unknown, node: unknown) => void;
      onEdgesDelete?: (edges: { source: string; target: string }[]) => void;
    }) => {
      deleteEdges = onEdgesDelete;
      return (
        <div data-testid="rf">
          {nodes.map((node) => (
            <div
              key={node.id}
              data-testid={`node-${node.id}`}
              onClick={(event) => onNodeClick?.(event, node)}
              onDoubleClick={(event) => onNodeDoubleClick?.(event, node)}
            />
          ))}
          {children}
        </div>
      );
    },
    Background: () => null,
    Controls: () => null,
  };
});

// jsdom has no layout, so the resizable panels are plain containers here.
vi.mock("react-resizable-panels", () => ({
  PanelGroup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Panel: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  PanelResizeHandle: () => null,
}));

vi.mock("../../context/ApiPortContext", () => ({
  ApiPortProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useApiPort: () => ({ apiUrl: "http://api", isReady: true }),
}));

vi.mock("../../context/NeuroSanContext", () => ({
  NeuroSanProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useNeuroSan: () => ({ host: "localhost", port: 30015, connectionType: "http", isNsReady: true }),
}));

vi.mock("../../utils/theme", () => ({ getInitialTheme: () => "dark" }));
vi.mock("../../components/Header", () => ({ default: () => null }));
vi.mock("../../components/EditorLogsPanel", () => ({ default: () => null }));

/** The chat context as the chat panel sees it, so a test can play designer frames into it. */
let chat: ReturnType<typeof useChatContext> | undefined;

// The chat panel opens websockets, which are not under test. In its place, a stand-in
// that hands the test the same chat context.
vi.mock("../../components/TabbedChatPanel", () => ({
  default: function ChatPanelStandIn() {
    chat = useChatContext();
    return null;
  },
}));

/** The agent the agent panel was last given, or undefined before it renders. */
let panelAgentName: string | null | undefined;
/** How the page told the agent panel to save an edit. */
let panelSaveEdit: ((edit: AgentPanelSave) => Promise<AgentPanelSaveResult>) | undefined;
/** The page's other callbacks for the agent panel, to check they keep their identity. */
let panelOnAgentRenamed: ((newName: string) => void) | undefined;
let panelOnClose: (() => void) | undefined;

vi.mock("../../components/NetworkAgentEditorPanel", () => ({
  default: ({
    selectedAgentName,
    saveEdit,
    onAgentRenamed,
    onClose,
  }: {
    selectedAgentName: string | null;
    saveEdit: (edit: AgentPanelSave) => Promise<AgentPanelSaveResult>;
    onAgentRenamed?: (newName: string) => void;
    onClose?: () => void;
  }) => {
    panelAgentName = selectedAgentName;
    panelSaveEdit = saveEdit;
    panelOnAgentRenamed = onAgentRenamed;
    panelOnClose = onClose;
    return null;
  },
}));

vi.mock("../../utils/config", async () => {
  const actual = await vi.importActual<typeof import("../../utils/config")>("../../utils/config");
  return {
    ...actual,
    getWandName: () => ({ wandName: "agent_network_designer" }),
    getCruseAgentNames: () => ({ widgetAgentName: "", themeAgentName: "" }),
    getFeatureFlags: () => ({ pluginCruse: false }),
    getManifestUpdatePeriodMs: () => 1000,
    getServerInstanceId: () => "test-instance",
  };
});

/**
 * The sidebar's network picker is MUI Autocomplete. Replacing it exposes its onChange
 * and the value it is given, without driving a combo box through keyboard events.
 */
let pickerOnChange: ((event: unknown, value: unknown) => void) | undefined;
let pickerValue: unknown;

vi.mock("@mui/material", async () => {
  const actual = await vi.importActual<typeof import("@mui/material")>("@mui/material");
  return {
    ...actual,
    Autocomplete: ({ onChange, value }: { onChange?: (event: unknown, value: unknown) => void; value?: unknown }) => {
      pickerOnChange = onChange;
      pickerValue = value;
      return <div data-testid="network-picker" />;
    },
  };
});

import Editor from "./Editor";
import type { AgentPanelSave, AgentPanelSaveResult } from "../../components/NetworkAgentEditorPanel";
import { useChatContext } from "../../context/ChatContext";
import { useEditorNetworkStore } from "../../state/editorNetworkStore";
import { updateAgent } from "../../state/editorOperations";
import { isDraftKey } from "../../state/editorSession";
import type { AgentNetworkDefinitionEntry } from "../../uiCommon";

const DESIGNER = "agent_network_designer";
const A_KEY = "generated/network_a";
const B_KEY = "generated/network_b";
const A_DEFINITION = {
  network_a_agent: { instructions: "Front of A.", description: "A", tools: ["a_child"] },
  a_child: { instructions: "Child of A.", description: "A child", tools: [] },
};
const B_DEFINITION = {
  network_b_agent: { instructions: "Front of B.", description: "B", tools: [] },
};
const X_KEY = "generated/network_x";
const X_DEFINITION = {
  network_x_agent: { instructions: "Front of X.", description: "X", tools: [] },
};

/** A save as the designer received it: the network name and its agents with their down-chains. */
type Save = { name: unknown; agents: Record<string, string[]> };

/** Every save sent to the designer, in order. */
const saves: Save[] = [];
/** Each save's abort signal, in the same order. */
const saveSignals: (AbortSignal | null | undefined)[] = [];
/** The networks /api/v1/list serves. */
let servedNetworks: string[] = [];
/** The names the server was asked about, in order. */
const nameChecks: string[] = [];
/** Names the stubbed server reports as taken. */
let takenNames: string[] = [];
/** Held by a test to keep a save in flight; undefined lets saves answer at once. */
let saveGate: Promise<void> | undefined;
/** Set by a test to hold each save until its own release is called, in this list. */
let saveReleases: (() => void)[] | undefined;
/** Whether a save's echo carries sly_data, as the designer's does. */
let echoSlyData = true;
/** Held by a test to keep a Load Existing turn in flight, unless it is aborted; undefined answers at once. */
let definitionGate: Promise<void> | undefined;
/** The files the designer was asked to load, in order. */
const loads: string[] = [];
/** Set by a test to answer each load with this designer error instead of the network. */
let loadError: string | undefined;
/** Held by a test to keep a HOCON upload in flight; undefined answers at once. */
let importGate: Promise<void> | undefined;
/** Held by a test to send a save's echo in two frames and hold back the second. */
let lastFrameGate: Promise<void> | undefined;

/** The error fetch rejects with when its request is aborted. */
const abortError = () => new DOMException("The operation was aborted.", "AbortError");

/** Wait for `gate`, or reject the way fetch does when `signal` aborts first. */
const unlessAborted = (gate: Promise<void>, signal?: AbortSignal | null): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    signal?.addEventListener("abort", () => reject(abortError()), { once: true });
    void gate.then(resolve);
  });

/** The agents of a store entry as "agent->[down-chains]", or undefined when there is no entry. */
const entryAgents = (key: string): string[] | undefined =>
  useEditorNetworkStore
    .getState()
    .entries[key]?.definition.map((agent) => `${agent.origin}->[${(agent.tools ?? []).join(",")}]`);

/** Every draft entry in the store that holds a name or an agent. */
const usedDrafts = () =>
  Object.entries(useEditorNetworkStore.getState().entries).filter(
    ([key, entry]) => isDraftKey(key) && (entry.networkName || entry.definition.length > 0)
  );

/** The New network button itself; its tooltip's label sits on the span around it. */
const newNetworkButton = (): HTMLButtonElement =>
  screen.getByLabelText(/Start a new/).querySelector("button") as HTMLButtonElement;

const mountEditor = async () => {
  render(<Editor />);
  await waitFor(() => expect(pickerOnChange).toBeTypeOf("function"));
};

/** Open a network with the sidebar's Load Existing picker. */
const loadExisting = async (key: string) => {
  await act(async () => {
    pickerOnChange?.(null, key);
  });
  await waitFor(() => expect(screen.getByText(`Editing: ${key}`)).toBeTruthy());
};

/** A designer chat turn that builds network_a, recorded the way the chat panel records it. */
const chatTurnBuildsA = async () => {
  await act(async () => {
    chat?.addProgressMessage({
      sender: DESIGNER,
      text: { agent_network_definition: A_DEFINITION, agent_network_name: "network_a" },
      network: DESIGNER,
    });
  });
  await act(async () => {
    chat?.addSlyDataMessage({
      sender: DESIGNER,
      text: `\`\`\`json\n${JSON.stringify({
        agent_network_definition: A_DEFINITION,
        agent_network_name: "network_a",
        agent_network_hocon_text: "# network_a",
      })}\n\`\`\``,
      network: DESIGNER,
    });
  });
  await waitFor(() => expect(screen.getByText(`Editing: ${A_KEY}`)).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId("node-network_a_agent")).toBeTruthy());
};

const clickNewNetwork = async () => {
  await act(async () => {
    fireEvent.click(newNetworkButton());
  });
};

/** Submit `name` in the naming dialog that New network opens. */
const submitName = async (name: string) => {
  await act(async () => {
    fireEvent.change(screen.getByPlaceholderText("Name this network"), { target: { value: name } });
  });
  await act(async () => {
    fireEvent.click(screen.getByLabelText("Save network name"));
  });
};

beforeEach(() => {
  saves.length = 0;
  saveSignals.length = 0;
  servedNetworks = [A_KEY, B_KEY, X_KEY];
  nameChecks.length = 0;
  takenNames = [];
  saveGate = undefined;
  saveReleases = undefined;
  echoSlyData = true;
  definitionGate = undefined;
  loads.length = 0;
  loadError = undefined;
  importGate = undefined;
  lastFrameGate = undefined;
  chat = undefined;
  panelAgentName = undefined;
  panelSaveEdit = undefined;
  panelOnAgentRenamed = undefined;
  panelOnClose = undefined;
  deleteEdges = undefined;
  pickerOnChange = undefined;
  pickerValue = undefined;
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/editor");
  useEditorNetworkStore.setState({ entries: {} });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/v1/list")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ agents: servedNetworks.map((name) => ({ agent_name: name })) }),
        } as Response;
      }
      if (url.includes("/api/v1/hocon/import")) {
        if (importGate) await importGate;
        return {
          ok: true,
          status: 200,
          json: async () => ({ definition: X_DEFINITION, network_name: "network_x", hocon: "# x", name_is_taken: false }),
        } as Response;
      }
      if (url.includes("/api/v1/hocon/name_taken")) {
        const name = new URL(url).searchParams.get("name") ?? "";
        nameChecks.push(name);
        return {
          ok: true,
          status: 200,
          json: async () => ({ network_name: name, name_is_taken: takenNames.includes(name) }),
        } as Response;
      }
      if (url.includes("/streaming_chat")) {
        // An aborted request is never sent.
        if (init?.signal?.aborted) throw abortError();
        const sent = JSON.parse(String(init?.body)).sly_data as Record<string, unknown>;
        // A load-only turn: the designer reads the file and saves nothing, so it is not a save.
        if (sent.agent_network_hocon_file && !sent.agent_network_definition) {
          const file = String(sent.agent_network_hocon_file);
          loads.push(file);
          if (definitionGate) await unlessAborted(definitionGate, init?.signal);
          const stem = file.slice(file.lastIndexOf("/") + 1).replace(/\.hocon$/, "");
          const reply = loadError
            ? { type: "AGENT_FRAMEWORK", text: "", structure: { error: loadError, tool: DESIGNER } }
            : {
                type: "AGENT_FRAMEWORK",
                text: `The network ${stem} has been loaded.`,
                sly_data: {
                  agent_network_definition: file === `${B_KEY}.hocon` ? B_DEFINITION : A_DEFINITION,
                  agent_network_name: stem,
                  agent_network_metadata: {},
                },
              };
          return new Response(`${JSON.stringify({ response: reply })}\n`, { status: 200 });
        }
        const definition = (sent.agent_network_definition ?? {}) as Record<string, { tools?: string[] }>;
        const agents: Record<string, string[]> = {};
        for (const [agent, spec] of Object.entries(definition)) agents[agent] = spec.tools ?? [];
        saves.push({ name: sent.agent_network_name, agents });
        saveSignals.push(init?.signal);
        // A held save has no response yet, so aborting it rejects the fetch.
        if (saveGate) await unlessAborted(saveGate, init?.signal);
        const releases = saveReleases;
        if (releases) await unlessAborted(new Promise<void>((resolve) => releases.push(resolve)), init?.signal);
        // The designer echoes what it saved, which is how a save reaches the chat's cache.
        // A named save also carries the HOCON text it wrote.
        const response = echoSlyData
          ? {
              type: "AGENT",
              text: "saved",
              sly_data: {
                agent_network_definition: sent.agent_network_definition,
                agent_network_name: sent.agent_network_name,
                ...(sent.agent_network_name ? { agent_network_hocon_text: `# saved ${sent.agent_network_name}` } : {}),
              },
            }
          : { type: "AGENT", text: "saved" };
        const gate = lastFrameGate;
        if (!gate) return new Response(`${JSON.stringify({ response })}\n`, { status: 200 });
        // The same echo again as a last frame, with its own HOCON text, sent once the gate opens.
        const last = {
          ...response,
          sly_data: { ...response.sly_data, agent_network_hocon_text: `# last frame of ${sent.agent_network_name}` },
        };
        const encoder = new TextEncoder();
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(`${JSON.stringify({ response })}\n`));
            void gate.then(() => {
              controller.enqueue(encoder.encode(`${JSON.stringify({ response: last })}\n`));
              controller.close();
            });
          },
        });
        return new Response(body, { status: 200 });
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the New network button", () => {
  it("starts an empty draft, and naming it saves only the new network", async () => {
    await mountEditor();
    await loadExisting(A_KEY);
    expect(screen.getByTestId("node-a_child")).toBeTruthy();

    await clickNewNetwork();

    // The canvas has left network_a and is asking for the new network's name.
    expect(screen.queryByText(`Editing: ${A_KEY}`)).toBeNull();
    expect(screen.queryByTestId("node-network_a_agent")).toBeNull();
    expect(screen.getByText("Name this agent network")).toBeTruthy();

    await submitName("network_c");

    await waitFor(() => expect(saves).toEqual([{ name: "network_c", agents: { network_c_agent: [] } }]));
    await waitFor(() => expect(screen.getByText("Editing: generated/network_c")).toBeTruthy());
    expect(saves).toHaveLength(1);
    // network_a's entry is as it was opened: same name, same agents.
    expect(useEditorNetworkStore.getState().entries[A_KEY]?.networkName).toBe("network_a");
    expect(entryAgents(A_KEY)).toEqual(["network_a_agent->[a_child]", "a_child->[]"]);
  });

  it("clears the chat and starts a new chat session, so the next chat turn carries nothing of the old network", async () => {
    await mountEditor();
    await chatTurnBuildsA();
    // A stand-in for the chat panel's socket, so closing it can be seen.
    const close = vi.fn();
    await act(async () => {
      chat?.setChatWs({ close } as unknown as WebSocket);
    });
    const sessionBefore = chat?.sessionId;
    expect(chat?.getEditorOutgoingSlyData().agent_network_name).toBe("network_a");

    await clickNewNetwork();

    expect(chat?.getEditorOutgoingSlyData()).toEqual({});
    expect(chat?.sessionId).not.toBe(sessionBefore);
    expect(close).toHaveBeenCalledTimes(1);
    expect(chat?.chatWs).toBeNull();
    // Nothing of network_a was copied into the new draft from the cache.
    expect(screen.queryByTestId("node-network_a_agent")).toBeNull();
    expect(usedDrafts()).toEqual([]);
  });

  it("resets the sidebar, so the old network can be opened again", async () => {
    await mountEditor();
    await chatTurnBuildsA();
    expect(pickerValue).toBe(A_KEY);
    expect(screen.getByText("Agents (2)")).toBeTruthy();

    await clickNewNetwork();

    // MUI's Autocomplete fires no change when the value it holds is picked again, so
    // the picker must let go of network_a for it to be opened again.
    expect(pickerValue).toBeNull();
    expect(screen.queryByText(/^Agents \(/)).toBeNull();

    await loadExisting(A_KEY);
    await waitFor(() => expect(screen.getByTestId("node-a_child")).toBeTruthy());
    expect(useEditorNetworkStore.getState().entries[A_KEY]?.networkName).toBe("network_a");
    expect(saves).toEqual([]);
  });

  it("clears the agent selection, so the next agent goes under the new frontman", async () => {
    await mountEditor();
    await loadExisting(A_KEY);
    await act(async () => {
      fireEvent.click(screen.getByTestId("node-network_a_agent"));
    });
    await act(async () => {
      fireEvent.doubleClick(screen.getByTestId("node-network_a_agent"));
    });
    expect(panelAgentName).toBe("network_a_agent");

    await clickNewNetwork();
    expect(panelAgentName).toBeNull();

    await submitName("network_c");
    await waitFor(() => expect(screen.getByTestId("node-network_c_agent")).toBeTruthy());
    await waitFor(() => expect(newNetworkButton().disabled).toBe(false));
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Add agent"));
    });

    // The new agent goes under the new frontman, so the edit is valid and is saved.
    await waitFor(() => expect(saves).toHaveLength(2));
    expect(saves[1]).toEqual({ name: "network_c", agents: { network_c_agent: ["agent"], agent: [] } });
  });

  it("waits for an edit that is still saving, so its echo cannot bring the old network back", async () => {
    await mountEditor();
    await loadExisting(A_KEY);
    let releaseSave: () => void = () => {};
    saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Add agent"));
    });
    await waitFor(() => expect(saves).toHaveLength(1));

    expect(newNetworkButton().disabled).toBe(true);

    saveGate = undefined;
    await act(async () => {
      releaseSave();
    });
    await waitFor(() => expect(newNetworkButton().disabled).toBe(false));
    await clickNewNetwork();

    // The echo landed while network_a was open, so it stays with network_a.
    expect(screen.queryByText(`Editing: ${A_KEY}`)).toBeNull();
    expect(usedDrafts()).toEqual([]);
    expect(entryAgents(A_KEY)).toEqual(["network_a_agent->[a_child,agent]", "a_child->[]", "agent->[]"]);
  });

  it("waits for an import, from its upload to its save, so its echo cannot land on the new draft", async () => {
    await mountEditor();
    await loadExisting(A_KEY);
    let releaseUpload: () => void = () => {};
    importGate = new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
    let releaseSave: () => void = () => {};
    saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["# x"], "network_x.hocon")] } });
    });

    expect(newNetworkButton().disabled).toBe(true);

    importGate = undefined;
    await act(async () => {
      releaseUpload();
    });
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(newNetworkButton().disabled).toBe(true);

    saveGate = undefined;
    await act(async () => {
      releaseSave();
    });
    await waitFor(() => expect(newNetworkButton().disabled).toBe(false), { timeout: 5000 });
  });

  it("is disabled while the designer is working", async () => {
    await mountEditor();
    await chatTurnBuildsA();
    expect(newNetworkButton().disabled).toBe(false);

    await act(async () => {
      chat?.setWaitingForAgent(true);
    });

    // Leaving now would close the chat mid-turn, with nothing left to clear the wait.
    expect(newNetworkButton().disabled).toBe(true);
  });

  it("asks before the new network takes the open network's name", async () => {
    await mountEditor();
    await loadExisting(A_KEY);
    takenNames = ["network_a"];

    await clickNewNetwork();
    await submitName("network_a");

    // network_a is no longer the open network, so its name is another network's.
    await waitFor(() => expect(screen.getByText("Overwrite network_a?")).toBeTruthy());
    expect(nameChecks).toEqual(["network_a"]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    });
    await waitFor(() => expect(screen.queryByText("Overwrite network_a?")).toBeNull());
    expect(saves).toEqual([]);
    expect(entryAgents(A_KEY)).toEqual(["network_a_agent->[a_child]", "a_child->[]"]);
  });

  it("leaves a network built by hand intact", async () => {
    await mountEditor();
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Add frontman"));
    });
    await submitName("network_x");
    // The save's echo selects the network it saved.
    await waitFor(() => expect(screen.getByText("Editing: generated/network_x")).toBeTruthy());
    await waitFor(() => expect(newNetworkButton().disabled).toBe(false));

    await clickNewNetwork();
    await submitName("network_y");

    await waitFor(() => expect(saves).toHaveLength(2));
    expect(saves).toEqual([
      { name: "network_x", agents: { network_x_agent: [] } },
      { name: "network_y", agents: { network_y_agent: [] } },
    ]);
    expect(useEditorNetworkStore.getState().entries["generated/network_x"]?.networkName).toBe("network_x");
    expect(entryAgents("generated/network_x")).toEqual(["network_x_agent->[]"]);
  });

  it("still drops the open draft and starts an empty one when no network is selected", async () => {
    // No sly_data in the echo, so nothing selects the draft and it stays a draft.
    echoSlyData = false;
    await mountEditor();
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Add frontman"));
    });
    await submitName("network_x");
    await waitFor(() => expect(screen.getByTestId("node-network_x_agent")).toBeTruthy());
    await waitFor(() => expect(newNetworkButton().disabled).toBe(false));
    expect(usedDrafts()).toHaveLength(1);

    await clickNewNetwork();

    expect(usedDrafts()).toEqual([]);
    expect(screen.queryByTestId("node-network_x_agent")).toBeNull();
    expect(screen.getByText("Name this agent network")).toBeTruthy();
  });

  it("still opens another network with Load Existing afterwards", async () => {
    await mountEditor();
    await loadExisting(A_KEY);
    await clickNewNetwork();
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Cancel rename"));
    });

    await loadExisting(B_KEY);

    await waitFor(() => expect(screen.getByTestId("node-network_b_agent")).toBeTruthy());
    expect(screen.queryByTestId("node-network_a_agent")).toBeNull();
    expect(saves).toEqual([]);
  });

  it("ignores a network the old sidebar was still opening when New network was clicked", async () => {
    await mountEditor();
    await loadExisting(A_KEY);
    let releaseDefinition: () => void = () => {};
    definitionGate = new Promise<void>((resolve) => {
      releaseDefinition = resolve;
    });
    // Pick network_b, and click New network while its definition is still loading.
    await act(async () => {
      pickerOnChange?.(null, B_KEY);
    });
    await clickNewNetwork();

    definitionGate = undefined;
    await act(async () => {
      releaseDefinition();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    // The old sidebar's load is dropped: the page stays on the new draft, and nothing
    // is written for network_b, so a network saved later under that name keeps its own.
    expect(useEditorNetworkStore.getState().entries[B_KEY]).toBeUndefined();
    expect(screen.queryByText(`Editing: ${B_KEY}`)).toBeNull();
    expect(screen.getByText("Name this agent network")).toBeTruthy();

    await submitName("network_c");

    await waitFor(() => expect(saves).toEqual([{ name: "network_c", agents: { network_c_agent: [] } }]));
    expect(useEditorNetworkStore.getState().entries[B_KEY]).toBeUndefined();
  });

  it("drops every load the old sidebar started, not only the last one", async () => {
    await mountEditor();
    let releaseDefinition: () => void = () => {};
    definitionGate = new Promise<void>((resolve) => {
      releaseDefinition = resolve;
    });
    // Pick network_a, then network_b, and click New network while both are loading.
    await act(async () => {
      pickerOnChange?.(null, A_KEY);
    });
    await act(async () => {
      pickerOnChange?.(null, B_KEY);
    });
    await clickNewNetwork();

    definitionGate = undefined;
    await act(async () => {
      releaseDefinition();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(useEditorNetworkStore.getState().entries[A_KEY]).toBeUndefined();
    expect(useEditorNetworkStore.getState().entries[B_KEY]).toBeUndefined();
  });

  it("opens only the last of two networks picked one after the other, with no error", async () => {
    await mountEditor();
    let releaseDefinition: () => void = () => {};
    definitionGate = new Promise<void>((resolve) => {
      releaseDefinition = resolve;
    });
    await act(async () => {
      pickerOnChange?.(null, A_KEY);
    });
    await act(async () => {
      pickerOnChange?.(null, B_KEY);
    });

    definitionGate = undefined;
    await act(async () => {
      releaseDefinition();
    });

    await waitFor(() => expect(screen.getByText(`Editing: ${B_KEY}`)).toBeTruthy());
    expect(useEditorNetworkStore.getState().entries[A_KEY]).toBeUndefined();
    expect(screen.queryByText(/Could not open/)).toBeNull();
  });

  it("ignores the old sidebar's delayed refresh after New network", async () => {
    await mountEditor();
    // A frame naming network_a and the designer's reply land in one render, so the
    // sidebar's delayed refresh holds a view of the chat that still has network_a.
    await act(async () => {
      chat?.addProgressMessage({
        sender: DESIGNER,
        text: { agent_network_definition: A_DEFINITION, agent_network_name: "network_a" },
        network: DESIGNER,
      });
      chat?.addChatMessage({ sender: "agent", text: "Built network_a.", network: DESIGNER });
    });
    await waitFor(() => expect(screen.getByText(`Editing: ${A_KEY}`)).toBeTruthy());

    await clickNewNetwork();
    // The sidebar waits a fixed second before that refresh.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });

    expect(screen.queryByText(`Editing: ${A_KEY}`)).toBeNull();
    await submitName("network_c");
    await waitFor(() => expect(saves).toEqual([{ name: "network_c", agents: { network_c_agent: [] } }]));
    expect(useEditorNetworkStore.getState().entries[A_KEY]?.networkName).toBe("network_a");
  });

  it("resets the sidebar on every click, not only the first", async () => {
    await mountEditor();
    await chatTurnBuildsA();
    await clickNewNetwork();
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Cancel rename"));
    });
    await chatTurnBuildsA();
    expect(pickerValue).toBe(A_KEY);

    await clickNewNetwork();

    expect(pickerValue).toBeNull();
    expect(screen.queryByText(`Editing: ${A_KEY}`)).toBeNull();
  });

  it("still follows a chat turn after New network, even one that reuses the old name", async () => {
    await mountEditor();
    await chatTurnBuildsA();
    await clickNewNetwork();
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Cancel rename"));
    });
    expect(screen.queryByText(`Editing: ${A_KEY}`)).toBeNull();

    // The sidebar has forgotten the name it last saw, so the same name is new to it.
    await chatTurnBuildsA();

    expect(pickerValue).toBe(A_KEY);
    expect(saves).toEqual([]);
  });
});

describe("a save's echo", () => {
  /** Render the chat context again with no new frame, as any log line or chat message does. */
  const renderChatAgain = async () => {
    await act(async () => {
      chat?.addLogMessage({ sender: "system", text: "An unrelated log line.", network: "" });
    });
  };

  /** Let any effect a late echo sets off run before the page is checked. */
  const settle = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  };

  /** Hold every save until the returned function is called. */
  const holdSaves = (): (() => Promise<void>) => {
    let release: () => void = () => {};
    saveGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return async () => {
      saveGate = undefined;
      await act(async () => {
        release();
      });
    };
  };

  /**
   * Hold each save on its own. The returned function waits until the save at `index`
   * has been sent, then lets the server answer it.
   */
  const holdEachSave = (): ((index: number) => Promise<void>) => {
    const releases: (() => void)[] = [];
    saveReleases = releases;
    return async (index: number) => {
      await waitFor(() => expect(releases.length).toBeGreaterThan(index));
      await act(async () => {
        releases[index]();
      });
    };
  };

  /** Hold the next Load Existing turn until the returned function is called. */
  const holdDefinitionFetch = (): (() => Promise<void>) => {
    let release: () => void = () => {};
    definitionGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return async () => {
      definitionGate = undefined;
      await act(async () => {
        release();
      });
    };
  };

  /** Record the sly_data of a chat message the way the chat panel does when it sends one. */
  const recordChatSend = async () => {
    await act(async () => {
      chat?.addSlyDataMessage({
        sender: "user",
        text: JSON.stringify(chat.getEditorOutgoingSlyData(), null, 2),
        network: DESIGNER,
      });
    });
  };

  /** An agent's instructions in a store entry. */
  const instructionsOf = (key: string, agent: string) =>
    (
      useEditorNetworkStore.getState().entries[key]?.definition.find((entry) => entry.origin === agent) as
        | AgentNetworkDefinitionEntry
        | undefined
    )?.instructions;

  /** The agents in the sly_data the next chat message carries. */
  const outgoingAgents = () =>
    Object.keys((chat?.getEditorOutgoingSlyData().agent_network_definition ?? {}) as Record<string, unknown>);

  /** An agent's instructions in the sly_data the next chat message carries. */
  const outgoingInstructionsOf = (agent: string) =>
    (chat?.getEditorOutgoingSlyData().agent_network_definition as Record<string, { instructions?: string }> | undefined)?.[
      agent
    ]?.instructions;

  /**
   * Start saving new instructions for an agent the way the agent panel's Save does. The
   * panel is stubbed here, so this applies the edit and saves it with the function the
   * page gave the panel.
   */
  const startPanelSave = (key: string, agent: string, instructions: string): Promise<AgentPanelSaveResult> => {
    const next = updateAgent(useEditorNetworkStore.getState().entries[key]?.definition ?? [], agent, { instructions });
    useEditorNetworkStore.getState().applyEdit(key, next);
    if (!panelSaveEdit) throw new Error("The page gave the agent panel no saveEdit.");
    return panelSaveEdit({ agentName: agent, definition: next });
  };

  /** Save new instructions for an agent the way the agent panel's Save does, and wait for the answer. */
  const panelSave = async (key: string, agent: string, instructions: string) => {
    await act(async () => {
      await startPanelSave(key, agent, instructions);
    });
  };

  /** Rename the open network with the pencil and the naming field. */
  const renameNetwork = async (name: string) => {
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Rename this network"));
    });
    await submitName(name);
  };

  it("keeps an agent panel save after the chat renders again, and the next chat message carries it", async () => {
    await mountEditor();
    await chatTurnBuildsA();

    await panelSave(A_KEY, "a_child", "Edited in the panel.");
    await renderChatAgain();

    expect(instructionsOf(A_KEY, "a_child")).toBe("Edited in the panel.");
    expect(outgoingInstructionsOf("a_child")).toBe("Edited in the panel.");
    expect(screen.getByText(`Editing: ${A_KEY}`)).toBeTruthy();
  });

  it("gives the agent panel the same callbacks when the chat renders again", async () => {
    // New ones on each chat render would rebuild the panel's own callbacks each time,
    // and make it add its click-outside listener again.
    await mountEditor();
    await chatTurnBuildsA();
    const saveEditBefore = panelSaveEdit;
    const agentRenamedBefore = panelOnAgentRenamed;
    const closeBefore = panelOnClose;

    await renderChatAgain();

    expect(saveEditBefore).toBeTypeOf("function");
    expect(panelSaveEdit).toBe(saveEditBefore);
    expect(panelOnAgentRenamed).toBe(agentRenamedBefore);
    expect(panelOnClose).toBe(closeBefore);
  });

  it("moves the page to the file an agent panel save wrote, for a network opened from another folder", async () => {
    // Saves go to generated/<file name>, so the page follows the save there.
    await mountEditor();
    await loadExisting("basic/foo");

    await panelSave("basic/foo", "a_child", "Edited in the panel.");

    await waitFor(() => expect(screen.getByText("Editing: generated/foo")).toBeTruthy());
    expect(saves).toEqual([{ name: "foo", agents: { network_a_agent: ["a_child"], a_child: [] } }]);
    expect(pickerValue).toBe("generated/foo");
    expect(instructionsOf("generated/foo", "a_child")).toBe("Edited in the panel.");
  });

  it("gives the entry the page moves to the HOCON text the save wrote, over one from an earlier visit", async () => {
    // Export downloads the entry's HOCON text first.
    useEditorNetworkStore.getState().reconcileFromServer("generated/foo", {
      definition: [{ origin: "old_front", tools: [] }],
      networkName: "foo",
      hocon: "# generated/foo from an earlier visit",
    });
    await mountEditor();
    await loadExisting("basic/foo");

    await panelSave("basic/foo", "a_child", "Edited in the panel.");

    await waitFor(() => expect(screen.getByText("Editing: generated/foo")).toBeTruthy());
    expect(useEditorNetworkStore.getState().entries["generated/foo"]?.hocon).toBe("# saved foo");
  });

  it("moves the page to the new name when the open network is renamed, and keeps it there", async () => {
    await mountEditor();
    await chatTurnBuildsA();

    await renameNetwork("network_z");

    await waitFor(() => expect(screen.getByText("Editing: generated/network_z")).toBeTruthy());
    await renderChatAgain();

    expect(screen.getByText("Editing: generated/network_z")).toBeTruthy();
    expect(saves).toEqual([{ name: "network_z", agents: { network_a_agent: ["a_child"], a_child: [] } }]);
    // The page's new entry holds what the save echoed, and the next chat message names it.
    expect(useEditorNetworkStore.getState().entries["generated/network_z"]?.networkName).toBe("network_z");
    expect(entryAgents("generated/network_z")).toEqual(["network_a_agent->[a_child]", "a_child->[]"]);
    expect(chat?.getEditorOutgoingSlyData().agent_network_name).toBe("network_z");
  });

  it("keeps a canvas edit that is held back after an unrelated chat render (a log line)", async () => {
    await mountEditor();
    await chatTurnBuildsA();

    // Deleting the only connection leaves a_child with no parent, which is kept on the
    // canvas and not saved.
    await act(async () => {
      deleteEdges?.([{ source: "network_a_agent", target: "a_child" }]);
    });
    expect(entryAgents(A_KEY)).toEqual(["network_a_agent->[]", "a_child->[]"]);
    await renderChatAgain();

    expect(entryAgents(A_KEY)).toEqual(["network_a_agent->[]", "a_child->[]"]);
    expect(saves).toEqual([]);
  });

  describe("of a save that a newer save replaced, arriving before the newer save's", () => {
    it("is dropped when it was an agent panel save on a network from another folder", async () => {
      await mountEditor();
      await loadExisting("basic/foo");
      const release = holdEachSave();
      let panelSaving: Promise<unknown> = Promise.resolve();
      await act(async () => {
        panelSaving = startPanelSave("basic/foo", "a_child", "Edited in the panel.");
      });
      await act(async () => {
        fireEvent.click(screen.getByLabelText("Add agent"));
      });
      await waitFor(() => expect(saves).toHaveLength(2));

      await release(0);
      let outcome: unknown;
      await act(async () => {
        outcome = await panelSaving;
      });
      await settle();
      expect(screen.getByText("Editing: basic/foo")).toBeTruthy();
      await release(1);
      await waitFor(() => expect(screen.getByText("Editing: generated/foo")).toBeTruthy());
      await settle();

      expect(outcome).toBe("superseded");
      expect(saves.map((save) => save.name)).toEqual(["foo", "foo"]);
      expect(entryAgents("generated/foo")).toEqual(["network_a_agent->[a_child,agent]", "a_child->[]", "agent->[]"]);
      expect(instructionsOf("generated/foo", "a_child")).toBe("Edited in the panel.");
      expect(outgoingAgents()).toEqual(["network_a_agent", "a_child", "agent"]);
    });

    it("is dropped, with no import error, when it was an import", async () => {
      await mountEditor();
      await loadExisting(A_KEY);
      const release = holdEachSave();
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await act(async () => {
        fireEvent.change(input, { target: { files: [new File(["# x"], "network_x.hocon")] } });
      });
      await waitFor(() => expect(saves).toHaveLength(1));
      await act(async () => {
        fireEvent.click(screen.getByLabelText("Add agent"));
      });
      await waitFor(() => expect(saves).toHaveLength(2));

      await release(0);
      await settle();
      expect(screen.getByText(`Editing: ${A_KEY}`)).toBeTruthy();
      await release(1);
      await waitFor(() => expect(screen.getByText(`Editing: ${X_KEY}`)).toBeTruthy());
      await waitFor(() => expect(newNetworkButton().disabled).toBe(false), { timeout: 5000 });
      await settle();

      expect(saves.map((save) => save.name)).toEqual(["network_x", "network_x"]);
      expect(entryAgents(X_KEY)).toEqual(["network_x_agent->[agent]", "agent->[]"]);
      expect(outgoingAgents()).toEqual(["network_x_agent", "agent"]);
      expect(screen.queryAllByRole("alert")).toEqual([]);
    });

    it("still holds Launch until the network is served, when it was an import", async () => {
      servedNetworks = [A_KEY, B_KEY];
      const launchButton = () => screen.getByRole("button", { name: /^Launch/ }) as HTMLButtonElement;
      await mountEditor();
      await loadExisting(A_KEY);
      const release = holdEachSave();
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await act(async () => {
        fireEvent.change(input, { target: { files: [new File(["# x"], "network_x.hocon")] } });
      });
      await waitFor(() => expect(saves).toHaveLength(1));
      await act(async () => {
        fireEvent.click(screen.getByLabelText("Add agent"));
      });
      await waitFor(() => expect(saves).toHaveLength(2));
      await settle();
      expect(saveSignals[0]?.aborted).toBe(true);
      expect(launchButton().disabled).toBe(true);

      await release(1);
      await settle();
      expect(screen.getByText(`Editing: ${X_KEY}`)).toBeTruthy();
      expect(launchButton().disabled).toBe(true);

      servedNetworks = [A_KEY, B_KEY, X_KEY];
      await waitFor(() => expect(launchButton().disabled).toBe(false), { timeout: 3000 });
    });
  });

  // The older reply must not undo the newer save, whatever kind it was.
  describe("of an older save, arriving after the newer save's", () => {
    it("is dropped, and the older save still finishes, when the newer save renamed the network", async () => {
      await mountEditor();
      await loadExisting(A_KEY);
      const release = holdEachSave();
      let panelSaving: Promise<unknown> = Promise.resolve();
      await act(async () => {
        panelSaving = startPanelSave(A_KEY, "a_child", "Edited in the panel.");
      });
      await waitFor(() => expect(saves).toHaveLength(1));
      await renameNetwork("network_z");
      await waitFor(() => expect(saves).toHaveLength(2));

      await release(1);
      await waitFor(() => expect(screen.getByText("Editing: generated/network_z")).toBeTruthy());
      await release(0);
      let outcome: unknown;
      await act(async () => {
        outcome = await panelSaving;
      });
      await settle();

      expect(pickerValue).toBe("generated/network_z");
      expect(screen.getByText("Editing: generated/network_z")).toBeTruthy();
      expect(chat?.getEditorOutgoingSlyData().agent_network_name).toBe("network_z");
      expect(useEditorNetworkStore.getState().entries["generated/network_z"]?.networkName).toBe("network_z");
      // The rename carried the panel's edit.
      expect(saves[1]).toEqual({ name: "network_z", agents: { network_a_agent: ["a_child"], a_child: [] } });
      expect(instructionsOf("generated/network_z", "a_child")).toBe("Edited in the panel.");
      expect(outgoingInstructionsOf("a_child")).toBe("Edited in the panel.");
      // The rename writes another file, so network_a's own save is not cancelled.
      expect(saveSignals[0]?.aborted).toBe(false);
      expect(outcome).toBe("saved");
    });

    it("is dropped, and the older save still finishes, when the newer save was an import", async () => {
      await mountEditor();
      await loadExisting(A_KEY);
      const release = holdEachSave();
      let panelSaving: Promise<unknown> = Promise.resolve();
      await act(async () => {
        panelSaving = startPanelSave(A_KEY, "a_child", "Edited in the panel.");
      });
      await waitFor(() => expect(saves).toHaveLength(1));
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await act(async () => {
        fireEvent.change(input, { target: { files: [new File(["# x"], "network_x.hocon")] } });
      });
      await waitFor(() => expect(saves).toHaveLength(2));

      await release(1);
      await waitFor(() => expect(screen.getByText(`Editing: ${X_KEY}`)).toBeTruthy());
      await release(0);
      let outcome: unknown;
      await act(async () => {
        outcome = await panelSaving;
      });
      await waitFor(() => expect(newNetworkButton().disabled).toBe(false), { timeout: 5000 });
      await settle();

      expect(pickerValue).toBe(X_KEY);
      expect(screen.getByText(`Editing: ${X_KEY}`)).toBeTruthy();
      expect(chat?.getEditorOutgoingSlyData().agent_network_name).toBe("network_x");
      expect(entryAgents(X_KEY)).toEqual(["network_x_agent->[]"]);
      expect(outgoingAgents()).toEqual(["network_x_agent"]);
      // The import does not carry the panel's edit, so network_a's own save is not cancelled.
      expect(saveSignals[0]?.aborted).toBe(false);
      expect(outcome).toBe("saved");
    });

    it("is aborted with every older save of the same file, not only the last one (A, then B, then A)", async () => {
      await mountEditor();
      await loadExisting(A_KEY);
      const release = holdEachSave();
      let panelSaving: Promise<unknown> = Promise.resolve();
      await act(async () => {
        panelSaving = startPanelSave(A_KEY, "a_child", "Edited in the panel.");
      });
      await waitFor(() => expect(saves).toHaveLength(1));
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await act(async () => {
        fireEvent.change(input, { target: { files: [new File(["# x"], "network_x.hocon")] } });
      });
      await waitFor(() => expect(saves).toHaveLength(2));
      // The page is still on network_a, so naming it network_a again does not ask.
      await renameNetwork("network_a");
      await waitFor(() => expect(saves).toHaveLength(3));
      expect(saves.map((save) => save.name)).toEqual(["network_a", "network_x", "network_a"]);

      // The rename writes network_a again, so the first save of network_a is aborted
      // even though the import started in between.
      expect(saveSignals[0]?.aborted).toBe(true);
      expect(saveSignals[1]?.aborted).toBe(false);

      await release(2);
      await release(1);
      let outcome: unknown;
      await act(async () => {
        outcome = await panelSaving;
      });
      await waitFor(() => expect(newNetworkButton().disabled).toBe(false), { timeout: 5000 });
      await settle();

      expect(outcome).toBe("superseded");
      expect(screen.getByText(`Editing: ${A_KEY}`)).toBeTruthy();
      expect(chat?.getEditorOutgoingSlyData().agent_network_name).toBe("network_a");
      expect(outgoingAgents()).toEqual(["network_x_agent"]);
    });

    it("is not aborted by a rename to the last part of its nested name", async () => {
      await mountEditor();
      await act(async () => {
        chat?.addSlyDataMessage({
          sender: DESIGNER,
          text: `\`\`\`json\n${JSON.stringify({
            agent_network_definition: A_DEFINITION,
            agent_network_name: "team/coffee",
            agent_network_hocon_text: "# team/coffee",
          })}\n\`\`\``,
          network: DESIGNER,
        });
      });
      await waitFor(() => expect(screen.getByText("Editing: generated/team/coffee")).toBeTruthy());
      const release = holdEachSave();
      let panelSaving: Promise<unknown> = Promise.resolve();
      await act(async () => {
        panelSaving = startPanelSave("generated/team/coffee", "a_child", "Edited in the panel.");
      });
      await waitFor(() => expect(saves).toHaveLength(1));
      await renameNetwork("coffee");
      await waitFor(() => expect(saves).toHaveLength(2));
      expect(saves.map((save) => save.name)).toEqual(["team/coffee", "coffee"]);

      // team/coffee and coffee are different files, so the first save still finishes.
      expect(saveSignals[0]?.aborted).toBe(false);
      await release(1);
      await release(0);
      let outcome: unknown;
      await act(async () => {
        outcome = await panelSaving;
      });
      expect(outcome).toBe("saved");
    });

    it("is dropped, and the older save still finishes, when it was a rename and the newer save an import", async () => {
      await mountEditor();
      await loadExisting(A_KEY);
      const release = holdEachSave();
      await renameNetwork("network_z");
      await waitFor(() => expect(saves).toHaveLength(1));
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await act(async () => {
        fireEvent.change(input, { target: { files: [new File(["# x"], "network_x.hocon")] } });
      });
      await waitFor(() => expect(saves).toHaveLength(2));

      await release(1);
      await waitFor(() => expect(screen.getByText(`Editing: ${X_KEY}`)).toBeTruthy());
      await release(0);
      await settle();

      expect(screen.getByText(`Editing: ${X_KEY}`)).toBeTruthy();
      expect(chat?.getEditorOutgoingSlyData().agent_network_name).toBe("network_x");
      expect(saveSignals[0]?.aborted).toBe(false);
    });

    it("is dropped, and the older save still finishes, when it was an import and the newer save a rename", async () => {
      await mountEditor();
      await loadExisting(A_KEY);
      const release = holdEachSave();
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await act(async () => {
        fireEvent.change(input, { target: { files: [new File(["# x"], "network_x.hocon")] } });
      });
      await waitFor(() => expect(saves).toHaveLength(1));
      await renameNetwork("network_z");
      await waitFor(() => expect(saves).toHaveLength(2));

      await release(1);
      await waitFor(() => expect(screen.getByText("Editing: generated/network_z")).toBeTruthy());
      await release(0);
      await waitFor(() => expect(newNetworkButton().disabled).toBe(false), { timeout: 5000 });
      await settle();

      expect(screen.getByText("Editing: generated/network_z")).toBeTruthy();
      expect(chat?.getEditorOutgoingSlyData().agent_network_name).toBe("network_z");
      expect(saveSignals[0]?.aborted).toBe(false);
    });

    it("is dropped when the newer save was a canvas edit that moved the page to generated/", async () => {
      await mountEditor();
      await loadExisting("basic/foo");
      const release = holdEachSave();
      let panelSaving: Promise<unknown> = Promise.resolve();
      await act(async () => {
        panelSaving = startPanelSave("basic/foo", "a_child", "Edited in the panel.");
      });
      await waitFor(() => expect(saves).toHaveLength(1));
      await act(async () => {
        fireEvent.click(screen.getByLabelText("Add agent"));
      });
      await waitFor(() => expect(saves).toHaveLength(2));

      await release(1);
      await waitFor(() => expect(screen.getByText("Editing: generated/foo")).toBeTruthy());
      await release(0);
      let outcome: unknown;
      await act(async () => {
        outcome = await panelSaving;
      });
      await settle();

      expect(screen.getByText("Editing: generated/foo")).toBeTruthy();
      expect(entryAgents("generated/foo")).toEqual(["network_a_agent->[a_child,agent]", "a_child->[]", "agent->[]"]);
      expect(instructionsOf("generated/foo", "a_child")).toBe("Edited in the panel.");
      expect(outgoingAgents()).toEqual(["network_a_agent", "a_child", "agent"]);
      expect(outcome).toBe("superseded");
    });

    it("is dropped when it was a canvas edit and the newer save an agent panel save", async () => {
      await mountEditor();
      await loadExisting(A_KEY);
      const release = holdEachSave();
      await act(async () => {
        fireEvent.click(screen.getByLabelText("Add agent"));
      });
      await waitFor(() => expect(saves).toHaveLength(1));
      let panelSaving: Promise<unknown> = Promise.resolve();
      await act(async () => {
        panelSaving = startPanelSave(A_KEY, "a_child", "Edited in the panel.");
      });
      await waitFor(() => expect(saves).toHaveLength(2));

      await release(1);
      let outcome: unknown;
      await act(async () => {
        outcome = await panelSaving;
      });
      await release(0);
      await settle();

      expect(outcome).toBe("saved");
      expect(entryAgents(A_KEY)).toEqual(["network_a_agent->[a_child,agent]", "a_child->[]", "agent->[]"]);
      expect(instructionsOf(A_KEY, "a_child")).toBe("Edited in the panel.");
      expect(outgoingInstructionsOf("a_child")).toBe("Edited in the panel.");
    });

    it("is dropped when it was a rename and the newer save a canvas edit", async () => {
      await mountEditor();
      await loadExisting(A_KEY);
      const release = holdEachSave();
      await renameNetwork("network_z");
      await waitFor(() => expect(saves).toHaveLength(1));
      await act(async () => {
        fireEvent.click(screen.getByLabelText("Add agent"));
      });
      await waitFor(() => expect(saves).toHaveLength(2));

      await release(1);
      await waitFor(() => expect(screen.getByText("Editing: generated/network_z")).toBeTruthy());
      await release(0);
      await settle();

      expect(saves.map((save) => save.name)).toEqual(["network_z", "network_z"]);
      expect(entryAgents("generated/network_z")).toEqual([
        "network_a_agent->[a_child,agent]",
        "a_child->[]",
        "agent->[]",
      ]);
      expect(outgoingAgents()).toEqual(["network_a_agent", "a_child", "agent"]);
    });
  });

  it("keeps the rest of a save's echo after its first frame moved the page", async () => {
    // Nothing aborts a save when its own echo moves the page to generated/.
    await mountEditor();
    await loadExisting("basic/foo");
    let releaseLastFrame: () => void = () => {};
    lastFrameGate = new Promise<void>((resolve) => {
      releaseLastFrame = resolve;
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Add agent"));
    });
    await waitFor(() => expect(screen.getByText("Editing: generated/foo")).toBeTruthy());
    expect(useEditorNetworkStore.getState().entries["generated/foo"]?.hocon).toBe("# saved foo");

    await act(async () => {
      releaseLastFrame();
    });
    await waitFor(() => expect(newNetworkButton().disabled).toBe(false));
    await settle();

    expect(screen.getByText("Editing: generated/foo")).toBeTruthy();
    expect(useEditorNetworkStore.getState().entries["generated/foo"]?.hocon).toBe("# last frame of foo");
    expect(entryAgents("generated/foo")).toEqual(["network_a_agent->[a_child,agent]", "a_child->[]", "agent->[]"]);
  });

  describe("that arrives after Load Existing opened another network", () => {
    it.each([
      ["a different name", B_KEY, ["network_b_agent->[]"]],
      ["the same file name in another folder", "basic/network_a", ["network_a_agent->[a_child]", "a_child->[]"]],
    ])("leaves the page and the entry of a network with %s alone", async (_kind, otherKey, openedAgents) => {
      await mountEditor();
      await loadExisting(A_KEY);
      const releaseSaves = holdSaves();
      await act(async () => {
        fireEvent.click(screen.getByLabelText("Add agent"));
      });
      await waitFor(() => expect(saves).toHaveLength(1));
      await loadExisting(otherKey);
      expect(entryAgents(otherKey)).toEqual(openedAgents);

      await releaseSaves();
      await waitFor(() => expect(newNetworkButton().disabled).toBe(false));
      await settle();

      expect(screen.getByText(`Editing: ${otherKey}`)).toBeTruthy();
      expect(pickerValue).toBe(otherKey);
      expect(entryAgents(otherKey)).toEqual(openedAgents);
      // network_a's own entry still takes the echo.
      expect(entryAgents(A_KEY)).toEqual(["network_a_agent->[a_child,agent]", "a_child->[]", "agent->[]"]);
    });

    it("leaves the page alone when the save was an import", async () => {
      await mountEditor();
      await loadExisting(A_KEY);
      const releaseSaves = holdSaves();
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await act(async () => {
        fireEvent.change(input, { target: { files: [new File(["# x"], "network_x.hocon")] } });
      });
      await waitFor(() => expect(saves).toHaveLength(1));
      await loadExisting(B_KEY);

      await releaseSaves();
      await waitFor(() => expect(newNetworkButton().disabled).toBe(false), { timeout: 5000 });
      await settle();

      expect(screen.getByText(`Editing: ${B_KEY}`)).toBeTruthy();
      expect(pickerValue).toBe(B_KEY);
      expect(entryAgents(B_KEY)).toEqual(["network_b_agent->[]"]);
    });

    it("leaves the page and the entry alone when the save was an agent panel save", async () => {
      await mountEditor();
      await loadExisting(A_KEY);
      const releaseSaves = holdSaves();
      let saving: Promise<unknown> = Promise.resolve();
      await act(async () => {
        saving = startPanelSave(A_KEY, "a_child", "Edited in the panel.");
      });
      await waitFor(() => expect(saves).toHaveLength(1));
      await loadExisting("basic/network_a");

      await releaseSaves();
      await act(async () => {
        await saving;
      });
      await settle();

      expect(screen.getByText("Editing: basic/network_a")).toBeTruthy();
      expect(pickerValue).toBe("basic/network_a");
      expect(instructionsOf("basic/network_a", "a_child")).toBe("Child of A.");
      expect(chat?.getEditorOutgoingSlyData().agent_network_name).toBeUndefined();
      expect(instructionsOf(A_KEY, "a_child")).toBe("Edited in the panel.");
    });

    it("still reaches network_a's entry when the other network's first edit is held back", async () => {
      await mountEditor();
      await loadExisting(A_KEY);
      const releaseSaves = holdSaves();
      await act(async () => {
        fireEvent.click(screen.getByLabelText("Add agent"));
      });
      await waitFor(() => expect(saves).toHaveLength(1));
      await loadExisting("basic/network_a");
      // Leaves a_child with no parent, so it is kept on the canvas and not saved.
      await act(async () => {
        deleteEdges?.([{ source: "network_a_agent", target: "a_child" }]);
      });

      await releaseSaves();
      await waitFor(() => expect(newNetworkButton().disabled).toBe(false));
      await settle();

      expect(saves).toHaveLength(1);
      expect(entryAgents("basic/network_a")).toEqual(["network_a_agent->[]", "a_child->[]"]);
      expect(useEditorNetworkStore.getState().entries[A_KEY]?.hocon).toBe("# saved network_a");
    });

    it("still finishes when the save was an agent panel save and the other network saves first", async () => {
      await mountEditor();
      await loadExisting(A_KEY);
      const release = holdEachSave();
      let saving: Promise<unknown> = Promise.resolve();
      await act(async () => {
        saving = startPanelSave(A_KEY, "a_child", "Edited in the panel.");
      });
      await waitFor(() => expect(saves).toHaveLength(1));
      await loadExisting(B_KEY);
      await act(async () => {
        fireEvent.click(screen.getByLabelText("Add agent"));
      });
      await waitFor(() => expect(saves).toHaveLength(2));

      await release(1);
      await release(0);
      let outcome: unknown;
      await act(async () => {
        outcome = await saving;
      });
      await settle();

      // network_b's save carries none of network_a's edit, so it must not cancel it.
      expect(saveSignals[0]?.aborted).toBe(false);
      expect(outcome).toBe("saved");
      expect(useEditorNetworkStore.getState().entries[A_KEY]?.hocon).toBe("# saved network_a");
      expect(screen.getByText(`Editing: ${B_KEY}`)).toBeTruthy();
      expect(entryAgents(B_KEY)).toEqual(["network_b_agent->[agent]", "agent->[]"]);
    });

    it("leaves the page alone when the save was a rename of the network", async () => {
      await mountEditor();
      await loadExisting(A_KEY);
      const releaseSaves = holdSaves();
      await renameNetwork("network_z");
      await waitFor(() => expect(saves).toHaveLength(1));
      await loadExisting(B_KEY);

      await releaseSaves();
      await settle();

      expect(screen.getByText(`Editing: ${B_KEY}`)).toBeTruthy();
      expect(pickerValue).toBe(B_KEY);
      expect(entryAgents(B_KEY)).toEqual(["network_b_agent->[]"]);
      expect(chat?.getEditorOutgoingSlyData().agent_network_name).toBeUndefined();
    });
  });

  it("leaves a save on the network now open alone when an import from the network left finishes later", async () => {
    await mountEditor();
    await loadExisting(A_KEY);
    let releaseUpload: () => void = () => {};
    importGate = new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["# x"], "network_x.hocon")] } });
    });
    await loadExisting(B_KEY);
    const release = holdEachSave();
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Add agent"));
    });
    await waitFor(() => expect(saves).toHaveLength(1));

    // The import started on network_a, so its save belongs to that session.
    importGate = undefined;
    await act(async () => {
      releaseUpload();
    });
    await waitFor(() => expect(saves).toHaveLength(2));
    await release(1);
    await release(0);
    await waitFor(() => expect(newNetworkButton().disabled).toBe(false), { timeout: 5000 });
    await settle();

    expect(screen.getByText(`Editing: ${B_KEY}`)).toBeTruthy();
    expect(chat?.getEditorOutgoingSlyData().agent_network_name).toBe("network_b");
    expect(outgoingAgents()).toEqual(["network_b_agent", "agent"]);
  });

  describe("that arrives while Load Existing is still fetching another network", () => {
    it.each([
      ["a different name", B_KEY, ["network_b_agent->[]"]],
      ["the same file name in another folder", "basic/network_a", ["network_a_agent->[a_child]", "a_child->[]"]],
    ])("leaves the network with %s and the next chat message alone", async (_kind, otherKey, openedAgents) => {
      await mountEditor();
      await loadExisting(A_KEY);
      const releaseSaves = holdSaves();
      await act(async () => {
        fireEvent.click(screen.getByLabelText("Add agent"));
      });
      await waitFor(() => expect(saves).toHaveLength(1));

      // The click clears the chat, and the page changes network only once the fetch answers.
      const releaseFetch = holdDefinitionFetch();
      await act(async () => {
        pickerOnChange?.(null, otherKey);
      });
      await releaseSaves();
      await settle();
      await releaseFetch();
      await waitFor(() => expect(screen.getByText(`Editing: ${otherKey}`)).toBeTruthy());
      await settle();

      expect(entryAgents(otherKey)).toEqual(openedAgents);
      expect(pickerValue).toBe(otherKey);
      expect(chat?.getEditorOutgoingSlyData().agent_network_name).toBeUndefined();
      // network_a's own entry still takes the echo.
      expect(entryAgents(A_KEY)).toEqual(["network_a_agent->[a_child,agent]", "a_child->[]", "agent->[]"]);

      await recordChatSend();
      await settle();
      expect(screen.getByText(`Editing: ${otherKey}`)).toBeTruthy();
    });
  });

  // New network stays enabled during these saves, so the new session is what drops their echo.
  describe("that arrives after New network was clicked", () => {
    it("leaves the new draft alone when the save was an agent panel save", async () => {
      await mountEditor();
      await loadExisting(A_KEY);
      const releaseSaves = holdSaves();
      let saving: Promise<unknown> = Promise.resolve();
      await act(async () => {
        saving = startPanelSave(A_KEY, "a_child", "Edited in the panel.");
      });
      await waitFor(() => expect(saves).toHaveLength(1));
      await clickNewNetwork();

      await releaseSaves();
      await act(async () => {
        await saving;
      });
      await settle();

      expect(screen.queryByText(`Editing: ${A_KEY}`)).toBeNull();
      expect(screen.getByText("Name this agent network")).toBeTruthy();
      expect(usedDrafts()).toEqual([]);
      expect(chat?.getEditorOutgoingSlyData()).toEqual({});
      // network_a's own entry still takes the echo.
      expect(instructionsOf(A_KEY, "a_child")).toBe("Edited in the panel.");
    });

    it("still finishes when the save was an agent panel save and the new network saves first", async () => {
      await mountEditor();
      await loadExisting(A_KEY);
      const release = holdEachSave();
      let saving: Promise<unknown> = Promise.resolve();
      await act(async () => {
        saving = startPanelSave(A_KEY, "a_child", "Edited in the panel.");
      });
      await waitFor(() => expect(saves).toHaveLength(1));
      await clickNewNetwork();
      await submitName("network_c");
      await waitFor(() => expect(saves).toHaveLength(2));

      await release(1);
      await release(0);
      let outcome: unknown;
      await act(async () => {
        outcome = await saving;
      });
      await settle();

      expect(saves[1]?.name).toBe("network_c");
      expect(saveSignals[0]?.aborted).toBe(false);
      expect(outcome).toBe("saved");
      expect(useEditorNetworkStore.getState().entries[A_KEY]?.hocon).toBe("# saved network_a");
    });

    it("leaves the new draft alone when the save was a rename of the network", async () => {
      await mountEditor();
      await loadExisting(A_KEY);
      const releaseSaves = holdSaves();
      await renameNetwork("network_z");
      await waitFor(() => expect(saves).toHaveLength(1));
      await clickNewNetwork();

      await releaseSaves();
      await settle();

      expect(screen.queryByText("Editing: generated/network_z")).toBeNull();
      expect(screen.queryByText(`Editing: ${A_KEY}`)).toBeNull();
      expect(screen.getByText("Name this agent network")).toBeTruthy();
      expect(usedDrafts()).toEqual([]);
      expect(chat?.getEditorOutgoingSlyData()).toEqual({});
    });
  });
});

describe("Load Existing", () => {
  it("opens a network from another folder and stays on it", async () => {
    await mountEditor();
    await loadExisting("basic/network_a");
    // Let anything the reply set off run before the page is checked.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Had the reply reached the chat's cache, the page would have moved to generated/network_a.
    expect(screen.getByText("Editing: basic/network_a")).toBeTruthy();
    expect(entryAgents("basic/network_a")).toEqual(["network_a_agent->[a_child]", "a_child->[]"]);
    expect(useEditorNetworkStore.getState().entries[A_KEY]).toBeUndefined();
    expect(loads).toEqual(["basic/network_a.hocon"]);
    expect(saves).toEqual([]);
    expect(chat?.getEditorOutgoingSlyData()).toEqual({});
  });

  it("shows a load error and stays on the open network", async () => {
    await mountEditor();
    await loadExisting(A_KEY);
    loadError = "Error: Failed to parse agent network config file 'generated/network_b.hocon'.";

    await act(async () => {
      pickerOnChange?.(null, B_KEY);
    });

    await waitFor(() =>
      expect(
        screen.getByText(`Could not open "${B_KEY}": Failed to parse agent network config file 'generated/network_b.hocon'.`)
      ).toBeTruthy()
    );
    expect(screen.getByText(`Editing: ${A_KEY}`)).toBeTruthy();
    expect(useEditorNetworkStore.getState().entries[B_KEY]).toBeUndefined();
    expect(loads).toEqual([`${A_KEY}.hocon`, `${B_KEY}.hocon`]);
    expect(saves).toEqual([]);
  });
});
