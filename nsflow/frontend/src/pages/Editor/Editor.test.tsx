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
 * Does New network leave the network that is open?
 *
 * The page owns the selected network, the sidebar keeps its own selection, and the
 * chat keeps a cache of the designer's frames. All three decide what the canvas
 * shows and what a save writes, so these tests mount the real Editor page against a
 * stubbed server and look at what was saved and what the store holds.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<typeof import("@xyflow/react")>("@xyflow/react");
  return {
    ...actual,
    ReactFlow: ({
      nodes,
      children,
      onNodeClick,
      onNodeDoubleClick,
    }: {
      nodes: { id: string }[];
      children?: React.ReactNode;
      onNodeClick?: (event: unknown, node: unknown) => void;
      onNodeDoubleClick?: (event: unknown, node: unknown) => void;
    }) => (
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
    ),
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

vi.mock("../../components/NetworkAgentEditorPanel", () => ({
  default: ({ selectedAgentName }: { selectedAgentName: string | null }) => {
    panelAgentName = selectedAgentName;
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
import { useChatContext } from "../../context/ChatContext";
import { useEditorNetworkStore } from "../../state/editorNetworkStore";
import { isDraftKey } from "../../state/editorSession";

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

describe("the New network button", () => {
  /** Every save sent to the designer, in order. */
  const saves: Save[] = [];
  /** The names the server was asked about, in order. */
  const nameChecks: string[] = [];
  /** Names the stubbed server reports as taken. */
  let takenNames: string[] = [];
  /** Held by a test to keep a save in flight; undefined lets saves answer at once. */
  let saveGate: Promise<void> | undefined;
  /** Whether a save's echo carries sly_data, as the designer's does. */
  let echoSlyData = true;
  /** Held by a test to keep a Load Existing fetch in flight; undefined answers at once. */
  let definitionGate: Promise<void> | undefined;
  /** Held by a test to keep a HOCON upload in flight; undefined answers at once. */
  let importGate: Promise<void> | undefined;

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
    nameChecks.length = 0;
    takenNames = [];
    saveGate = undefined;
    echoSlyData = true;
    definitionGate = undefined;
    importGate = undefined;
    chat = undefined;
    panelAgentName = undefined;
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
            json: async () => ({ agents: [{ agent_name: A_KEY }, { agent_name: B_KEY }, { agent_name: X_KEY }] }),
          } as Response;
        }
        if (url.includes("/api/v1/network_definition/")) {
          if (definitionGate) await definitionGate;
          const key = decodeURIComponent(url.split("/api/v1/network_definition/")[1]);
          const definition = key === B_KEY ? B_DEFINITION : A_DEFINITION;
          return {
            ok: true,
            status: 200,
            json: async () => ({ agent_network_definition: definition, agent_network_name: key }),
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
          const sent = JSON.parse(String(init?.body)).sly_data as Record<string, unknown>;
          const definition = (sent.agent_network_definition ?? {}) as Record<string, { tools?: string[] }>;
          const agents: Record<string, string[]> = {};
          for (const [agent, spec] of Object.entries(definition)) agents[agent] = spec.tools ?? [];
          saves.push({ name: sent.agent_network_name, agents });
          if (saveGate) await saveGate;
          // The designer echoes what it saved, which is how a save reaches the chat's cache.
          const response = echoSlyData
            ? {
                type: "AGENT",
                text: "saved",
                sly_data: {
                  agent_network_definition: sent.agent_network_definition,
                  agent_network_name: sent.agent_network_name,
                },
              }
            : { type: "AGENT", text: "saved" };
          return new Response(`${JSON.stringify({ response })}\n`, { status: 200 });
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

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
