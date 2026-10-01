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
 * Does adding an agent from the palette actually reach the canvas?
 *
 * Reported symptom: an agent added by click or drop only appeared after a page
 * reload, while the same agent added via right-click "Add Child" appeared at once.
 * Both go through the same store write, so this mounts the real component and
 * inspects what React Flow is handed, rather than reasoning about which of the two
 * paths differs.
 */

import { ReactFlowProvider } from "@xyflow/react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

/** Captures the nodes React Flow is asked to render on each pass. */
const renderedNodeIds: string[][] = [];

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<typeof import("@xyflow/react")>("@xyflow/react");
  return {
    ...actual,
    ReactFlow: ({ nodes, children }: { nodes: { id: string }[]; children?: React.ReactNode }) => {
      renderedNodeIds.push(nodes.map((node) => node.id));
      return (
        <div data-testid="rf">
          {nodes.map((node) => (
            <div key={node.id} data-testid={`node-${node.id}`} />
          ))}
          {children}
        </div>
      );
    },
    Background: () => null,
    Controls: () => null,
  };
});

vi.mock("../context/ApiPortContext", () => ({
  useApiPort: () => ({ apiUrl: "http://api", isReady: true }),
}));

vi.mock("../context/ChatContext", () => ({
  useChatContext: () => ({
    getLatestNetworkPayload: () => undefined,
    getLastProgressMessage: () => undefined,
    getLastSlyDataMessage: () => undefined,
    progressTick: 0,
    slyDataTick: 0,
    lastProgressAt: 0,
    lastSlyDataAt: 0,
    waitingForAgent: false,
    targetNetwork: "",
  }),
}));

// The agent editor panel pulls in the app's json-editor theming, which is not what
// is under test here.
vi.mock("./NetworkAgentEditorPanel", () => ({ default: () => null }));

// The real name mapping stays in: with the runtime config never loaded it falls back to
// the default "generated/" subdirectory, which is exactly the mapping the launch and
// export paths are meant to apply. Stubbing it as the identity hid a wrong mapping.
vi.mock("../utils/config", async () => {
  const actual = await vi.importActual<typeof import("../utils/config")>("../utils/config");
  return {
    ...actual,
    getFeatureFlags: () => ({ pluginCruse: false }),
    getManifestUpdatePeriodMs: () => 1000,
    // Stable across a test run, so the draft session is never treated as belonging to a
    // server that has since restarted.
    getServerInstanceId: () => "test-instance",
  };
});

import EditorAgentFlow from "./EditorAgentFlow";
import { useEditorNetworkStore } from "../state/editorNetworkStore";
import type { AgentNetworkDefinitionEntry } from "../uiCommon";
import { isDraftKey } from "../state/editorSession";
import * as config from "../utils/config";

const NETWORK = "coffee_shop";

const mount = () =>
  render(
    <ReactFlowProvider>
      <EditorAgentFlow selectedNetwork={NETWORK} />
    </ReactFlowProvider>
  );

describe("naming a network after one that already exists", () => {
  // The designer saves a named network to <subdirectory>/<name>.hocon over whatever is
  // there, so a name another network already has replaces that network. These tests
  // drive the real component against a stubbed server and look at what was sent.

  /** The names the server was asked about, in order. */
  const nameChecks: string[] = [];
  /** The sly_data of every save sent to the designer, in order. */
  const savedSlyData: Record<string, unknown>[] = [];
  /** What the stubbed server answers about any name it is asked about. */
  let nameIsTaken = true;
  /** The status the stubbed name check answers with. */
  let nameCheckStatus = 200;
  /** Whether the stubbed name check fails before any response, as an unreachable server does. */
  let nameCheckThrows = false;
  /** Gates the next name checks wait on, in order, so a test can hold one back. */
  const nameCheckGates: Promise<void>[] = [];

  /** Every draft entry in the store. A network built by hand lives under a draft key. */
  const draftEntries = () =>
    Object.entries(useEditorNetworkStore.getState().entries)
      .filter(([key]) => isDraftKey(key))
      .map(([, entry]) => entry);

  /** The network name each recorded save carried. */
  const savedNames = () => savedSlyData.map((slyData) => slyData.agent_network_name);

  /** Start a fresh draft, ask for its frontman, and submit `name` in the naming dialog. */
  const nameFirstAgent = async (name: string) => {
    render(
      <ReactFlowProvider>
        <EditorAgentFlow selectedNetwork="" />
      </ReactFlowProvider>
    );
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Add frontman"));
    });
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("Name this network"), { target: { value: name } });
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Save network name"));
    });
  };

  /** Open a saved network, rename it, and submit. Leaving `typed` out resubmits the name as it stands. */
  const renameOpenNetwork = async (selectedNetwork: string, typed?: string) => {
    render(
      <ReactFlowProvider>
        <EditorAgentFlow selectedNetwork={selectedNetwork} />
      </ReactFlowProvider>
    );
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Rename this network"));
    });
    if (typed !== undefined) {
      await act(async () => {
        fireEvent.change(screen.getByPlaceholderText("Name this network"), { target: { value: typed } });
      });
    }
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Save network name"));
    });
  };

  /**
   * A network opened from outside the designer's folder: keyed and selected by its served
   * path, with its bare name in the entry. Nothing maps either onto the other, so only
   * the entry's own name says which name is this network's.
   */
  const openMusicNerd = () => {
    const definition: AgentNetworkDefinitionEntry[] = [
      { origin: "music_nerd_agent", tools: [], instructions: "Talk music.", description: "Front" },
    ];
    useEditorNetworkStore.getState().reconcileFromServer("basic/music_nerd", { definition, networkName: "music_nerd" });
  };

  beforeEach(() => {
    renderedNodeIds.length = 0;
    nameChecks.length = 0;
    savedSlyData.length = 0;
    nameIsTaken = true;
    nameCheckStatus = 200;
    nameCheckThrows = false;
    nameCheckGates.length = 0;
    localStorage.clear();
    useEditorNetworkStore.setState({ entries: {} });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/v1/hocon/name_taken")) {
          const name = new URL(url).searchParams.get("name") ?? "";
          nameChecks.push(name);
          const gate = nameCheckGates.shift();
          if (gate) await gate;
          if (nameCheckThrows) throw new TypeError("Failed to fetch");
          return {
            ok: nameCheckStatus === 200,
            status: nameCheckStatus,
            statusText: nameCheckStatus === 200 ? "OK" : "Internal Server Error",
            json: async () => ({ network_name: name, name_is_taken: nameIsTaken }),
          } as Response;
        }
        if (url.includes("/streaming_chat")) {
          savedSlyData.push(JSON.parse(String(init?.body)).sly_data);
        }
        // No body, so a save throws and logs once it is recorded, as in the block
        // below: what is under test is what was sent, not how the designer answers.
        return { ok: true, body: null, status: 200, statusText: "OK", json: async () => ({}) } as unknown as Response;
      })
    );
  });

  it("asks before a draft takes a name another network has, and adds nothing until Overwrite", async () => {
    await nameFirstAgent("travel");

    await waitFor(() => expect(screen.getByText("Overwrite travel?")).toBeTruthy());
    expect(nameChecks).toEqual(["travel"]);
    // While the question is open the other network is still intact: no name recorded,
    // no frontman on the canvas, and nothing sent that could save over it.
    expect(savedSlyData).toEqual([]);
    expect(screen.queryByTestId("node-travel_agent")).toBeNull();
    expect(draftEntries().some((entry) => entry.networkName)).toBe(false);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Overwrite" }));
    });

    await waitFor(() => expect(screen.getByTestId("node-travel_agent")).toBeTruthy());
    // The frontman's save carries the name, which is what makes it land on travel.
    await waitFor(() => expect(savedNames()).toEqual(["travel"]));
  });

  it("leaves the draft unnamed and empty when the user cancels", async () => {
    await nameFirstAgent("travel");
    await waitFor(() => expect(screen.getByText("Overwrite travel?")).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    });

    // The flow ends there. Going on to add the frontman would find the draft still
    // unnamed and put the naming dialog straight back up, which is not what Cancel said.
    await waitFor(() => expect(screen.queryByText("Overwrite travel?")).toBeNull());
    await waitFor(() => expect(screen.queryByText("Name this agent network")).toBeNull());
    expect(savedSlyData).toEqual([]);
    expect(screen.queryByTestId("node-travel_agent")).toBeNull();
    expect(draftEntries().some((entry) => entry.networkName || entry.definition.length > 0)).toBe(false);
  });

  it("names a draft without asking when no other network has the name", async () => {
    nameIsTaken = false;
    await nameFirstAgent("car_wash");

    await waitFor(() => expect(screen.getByTestId("node-car_wash_agent")).toBeTruthy());
    expect(nameChecks).toEqual(["car_wash"]);
    expect(screen.queryByText("Overwrite car_wash?")).toBeNull();
    await waitFor(() => expect(savedNames()).toEqual(["car_wash"]));
  });

  it("names as before, with a warning, when the check itself fails", async () => {
    // A failing check means nsflow's own server is failing, and the save goes through
    // the same server, so refusing the name would only add a second failure.
    nameCheckStatus = 500;
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await nameFirstAgent("car_wash");

    await waitFor(() => expect(screen.getByTestId("node-car_wash_agent")).toBeTruthy());
    expect(screen.queryByText("Overwrite car_wash?")).toBeNull();
    expect(consoleWarn.mock.calls.some(([message]) => String(message).includes('"car_wash"'))).toBe(true);
    consoleWarn.mockRestore();
  });

  it("names as before, with a warning, when the check cannot reach the server", async () => {
    // A request that never gets a response, as opposed to one the server answered
    // with an error: the same reasoning applies, so the same outcome is expected.
    nameCheckThrows = true;
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await nameFirstAgent("car_wash");

    await waitFor(() => expect(screen.getByTestId("node-car_wash_agent")).toBeTruthy());
    expect(nameChecks).toEqual(["car_wash"]);
    expect(screen.queryByText("Overwrite car_wash?")).toBeNull();
    expect(consoleWarn.mock.calls.some(([message]) => String(message).includes('"car_wash"'))).toBe(true);
    consoleWarn.mockRestore();
  });

  it("does not ask about the name the network's entry already carries", async () => {
    openMusicNerd();
    await renameOpenNetwork("basic/music_nerd");

    // The rename's save goes out under the name, with no question first, even though
    // the server would have called it taken: every edit of this entry already saves
    // under that name, so asking would guard nothing.
    await waitFor(() => expect(savedNames()).toEqual(["music_nerd"]));
    expect(nameChecks).toEqual([]);
  });

  it("does not ask about the name whose served path is the open network", async () => {
    // Mapped into the designer's folder for this test, as the real mapping does, so the
    // name typed differs from the selection and only its served path can match it.
    const toServed = vi
      .spyOn(config, "toServedNetworkPath")
      .mockImplementation((name: string) => `generated/${name}`);
    try {
      const served = "generated/coffee_shop";
      // Seeded without a name of its own, so the entry cannot answer and only the
      // selection can say this name is the open network's.
      const seed: AgentNetworkDefinitionEntry[] = [
        { origin: "frontman", tools: [], instructions: "Greet.", description: "Front" },
      ];
      useEditorNetworkStore.getState().applyEdit(served, seed);

      await renameOpenNetwork(served, "coffee_shop");

      await waitFor(() => expect(savedNames()).toEqual(["coffee_shop"]));
      expect(nameChecks).toEqual([]);
    } finally {
      toServed.mockRestore();
    }
  });

  it("keeps the old name when a rename onto another network is cancelled", async () => {
    openMusicNerd();
    await renameOpenNetwork("basic/music_nerd", "travel");
    await waitFor(() => expect(screen.getByText("Overwrite travel?")).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    });

    await waitFor(() => expect(screen.queryByText("Overwrite travel?")).toBeNull());
    expect(useEditorNetworkStore.getState().entries["basic/music_nerd"]?.networkName).toBe("music_nerd");
    expect(savedSlyData).toEqual([]);
  });

  it("keeps the newer name when an older name's check answers last", async () => {
    openMusicNerd();
    nameIsTaken = false;
    // Hold the first check back, so the second name is submitted and answered first.
    let releaseFirstCheck: () => void = () => {};
    nameCheckGates.push(new Promise<void>((resolve) => { releaseFirstCheck = resolve; }));

    await renameOpenNetwork("basic/music_nerd", "alpha");
    await waitFor(() => expect(nameChecks).toEqual(["alpha"]));
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Rename this network"));
    });
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("Name this network"), { target: { value: "beta" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Save network name"));
    });
    await waitFor(() => expect(savedNames()).toEqual(["beta"]));

    // Only now does the first answer arrive. The user has since chosen "beta", so
    // "alpha" must not be recorded or saved on top of it.
    await act(async () => {
      releaseFirstCheck();
    });

    await waitFor(() => expect(nameChecks).toEqual(["alpha", "beta"]));
    expect(useEditorNetworkStore.getState().entries["basic/music_nerd"]?.networkName).toBe("beta");
    expect(savedNames()).toEqual(["beta"]);
  });

  it("drops a naming whose check answers after the page moved to another network", async () => {
    openMusicNerd();
    nameIsTaken = false;
    let releaseCheck: () => void = () => {};
    nameCheckGates.push(new Promise<void>((resolve) => { releaseCheck = resolve; }));

    const view = render(
      <ReactFlowProvider>
        <EditorAgentFlow selectedNetwork="basic/music_nerd" />
      </ReactFlowProvider>
    );
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Rename this network"));
    });
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("Name this network"), { target: { value: "alpha" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Save network name"));
    });
    await waitFor(() => expect(nameChecks).toEqual(["alpha"]));

    // Another network is opened while the check is still out.
    view.rerender(
      <ReactFlowProvider>
        <EditorAgentFlow selectedNetwork="generated/coffee_shop" />
      </ReactFlowProvider>
    );
    await act(async () => {
      releaseCheck();
    });

    // The rename was for a network that is no longer open, so nothing is recorded or saved.
    await waitFor(() => expect(nameChecks).toEqual(["alpha"]));
    expect(useEditorNetworkStore.getState().entries["basic/music_nerd"]?.networkName).toBe("music_nerd");
    expect(savedSlyData).toEqual([]);
  });

  it("drops a naming whose check answers after the Editor was left", async () => {
    openMusicNerd();
    nameIsTaken = false;
    let releaseCheck: () => void = () => {};
    nameCheckGates.push(new Promise<void>((resolve) => { releaseCheck = resolve; }));

    const view = render(
      <ReactFlowProvider>
        <EditorAgentFlow selectedNetwork="basic/music_nerd" />
      </ReactFlowProvider>
    );
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Rename this network"));
    });
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("Name this network"), { target: { value: "alpha" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Save network name"));
    });
    await waitFor(() => expect(nameChecks).toEqual(["alpha"]));

    // The user goes to another page while the check is still out.
    view.unmount();
    await act(async () => {
      releaseCheck();
    });

    // Nothing the user can no longer see is renamed or saved.
    await waitFor(() => expect(nameChecks).toEqual(["alpha"]));
    expect(useEditorNetworkStore.getState().entries["basic/music_nerd"]?.networkName).toBe("music_nerd");
    expect(savedSlyData).toEqual([]);
  });

  it("closes the overwrite question as declined when the page moves to another network", async () => {
    openMusicNerd();
    const view = render(
      <ReactFlowProvider>
        <EditorAgentFlow selectedNetwork="basic/music_nerd" />
      </ReactFlowProvider>
    );
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Rename this network"));
    });
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("Name this network"), { target: { value: "travel" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Save network name"));
    });
    await waitFor(() => expect(screen.getByText("Overwrite travel?")).toBeTruthy());

    // A designer frame, or the sidebar, moves the page while the question is open.
    view.rerender(
      <ReactFlowProvider>
        <EditorAgentFlow selectedNetwork="generated/coffee_shop" />
      </ReactFlowProvider>
    );

    await waitFor(() => expect(screen.queryByText("Overwrite travel?")).toBeNull());
    expect(useEditorNetworkStore.getState().entries["basic/music_nerd"]?.networkName).toBe("music_nerd");
    expect(savedSlyData).toEqual([]);
  });

  it("saves the network as it is when Overwrite is clicked, not as it was when asked", async () => {
    openMusicNerd();
    await renameOpenNetwork("basic/music_nerd", "travel");
    await waitFor(() => expect(screen.getByText("Overwrite travel?")).toBeTruthy());

    // A progress frame lands while the question is open and adds an agent, the way
    // streamed frames reach the store.
    const progressed: AgentNetworkDefinitionEntry[] = [
      { origin: "music_nerd_agent", tools: ["critic"], instructions: "Talk music.", description: "Front" },
      { origin: "critic", tools: [], instructions: "Review it.", description: "Critic" },
    ];
    act(() => {
      useEditorNetworkStore
        .getState()
        .reconcileFromServer("basic/music_nerd", { definition: progressed, networkName: "music_nerd" });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Overwrite" }));
    });

    // Saved with the agent the frame added: a definition read before the question
    // would have written the network back without it.
    await waitFor(() => expect(savedNames()).toEqual(["travel"]));
    expect(Object.keys(savedSlyData[0].agent_network_definition as Record<string, unknown>)).toContain("critic");
  });
});

describe("adding an agent from the palette", () => {
  beforeEach(() => {
    renderedNodeIds.length = 0;
    localStorage.clear();
    useEditorNetworkStore.getState().reset(NETWORK);
    // A network with a frontman, so an added agent has something to attach to.
    const seed: AgentNetworkDefinitionEntry[] = [
      { origin: "frontman", tools: [], instructions: "Greet.", description: "Front" },
    ];
    useEditorNetworkStore.getState().applyEdit(NETWORK, seed);
    // The round-trip is deliberately left broken (no body, so sendEditorUpdate
    // throws and logs). The canvas must update from the optimistic local apply
    // whatever the designer does, so a failing round-trip should not hide the edit.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, body: null, status: 200, statusText: "OK", json: async () => ({}) }))
    );
  });

  it("renders the new agent without waiting for a reload", async () => {
    mount();

    await waitFor(() => expect(screen.getByTestId("node-frontman")).toBeTruthy());

    // The palette notch adds an agent in one click; the seeded network already has
    // a frontman, so the add button offers a plain agent.
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Add agent"));
    });

    // The store is the authority, so confirm the edit landed there first: if it did
    // not, the failure is in the operation, not in the rendering.
    await waitFor(() =>
      expect(
        useEditorNetworkStore.getState().entries[NETWORK]?.definition.map((entry) => entry.origin)
      ).toContain("agent")
    );

    // ...and then that React Flow was actually handed it.
    await waitFor(() => expect(screen.getByTestId("node-agent")).toBeTruthy());

    // And that it STAYS. waitFor succeeds on a transient appearance, which is
    // exactly what the bug looked like: renderFromStore added the node and a
    // relayout scheduled in a requestAnimationFrame then wrote back a stale node
    // list that no longer contained it. So let every queued frame and timer run,
    // and check the last thing React Flow was actually given.
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 150)));
    });

    expect(renderedNodeIds[renderedNodeIds.length - 1]).toContain("agent");
    expect(screen.getByTestId("node-agent")).toBeTruthy();
  });

  it("asks for a name before the first agent, then adds it", async () => {
    // A hand-built network has no name until someone gives it one, and the designer
    // drops any edit that arrives without agent_network_name. Asking up front is what
    // stops that first edit being applied locally and silently lost server-side.
    useEditorNetworkStore.getState().reset(NETWORK);
    render(
      <ReactFlowProvider>
        <EditorAgentFlow selectedNetwork="" />
      </ReactFlowProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Add frontman"));
    });

    // Nothing added yet: the dialog is asking first.
    expect(screen.getByText("Name this agent network")).toBeTruthy();
    expect(screen.queryByTestId("node-frontman")).toBeNull();

    // Typed with spaces and capitals on purpose: the name is sanitised on save.
    const nameField = screen.getByPlaceholderText("Name this network");
    await act(async () => {
      fireEvent.change(nameField, { target: { value: "Car Wash" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Save network name"));
    });

    // The frontman is named after the network rather than being called "frontman",
    // which says nothing about what it does once it reaches the HOCON or the chat.
    await waitFor(() => expect(screen.getByTestId("node-car_wash_agent")).toBeTruthy());
  });

  it("offers nothing but the frontman while the canvas is empty", async () => {
    // Referencing a network or a tool before there is an agent to attach it to would
    // leave it unattached, which is the state the whole editor is built to avoid.
    useEditorNetworkStore.getState().reset(NETWORK);
    render(
      <ReactFlowProvider>
        <EditorAgentFlow selectedNetwork="" />
      </ReactFlowProvider>
    );

    expect(screen.getByLabelText("Add frontman")).not.toHaveProperty("disabled", true);
    for (const source of ["Agent Networks", "Toolbox", "MCP Servers"]) {
      expect(screen.getByLabelText(source)).toHaveProperty("disabled", true);
    }
  });
});

describe("downloading the network as .hocon", () => {
  // What a Load Existing entry looks like after #304: keyed by the served path, the
  // page selecting that same path, and the file's stem inside the entry. A network
  // from a folder other than the designer's, so the served path is nothing the stem
  // could be mapped back to: the request has to come from the page's selection.
  const SERVED = "basic/music_nerd";
  const downloads: string[] = [];
  let clickSpy: MockInstance;

  /** The export URLs the component asked for so far. */
  const exportRequests = () =>
    vi.mocked(fetch).mock.calls.map(([input]) => String(input)).filter((url) => url.includes("/api/v1/export/"));

  beforeEach(() => {
    renderedNodeIds.length = 0;
    downloads.length = 0;
    localStorage.clear();
    useEditorNetworkStore.getState().reset(SERVED);
    useEditorNetworkStore.getState().reconcileFromServer(SERVED, {
      definition: [{ origin: "frontman", tools: [] }],
      networkName: "music_nerd",
      // No hocon in the store: a network that was opened, not yet saved, so the
      // button has to go and fetch the served file.
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/api/v1/export/agent_network/")) {
          return { ok: true, status: 200, text: async () => "# the served file" } as Response;
        }
        return { ok: true, body: null, status: 200, statusText: "OK", json: async () => ({}) } as unknown as Response;
      })
    );
    // jsdom has neither blob URLs nor navigation; record the download instead. A
    // subclass rather than patching URL in place, so unstubbing really restores it.
    vi.stubGlobal(
      "URL",
      class StubURL extends URL {
        static createObjectURL = vi.fn(() => "blob:x");
        static revokeObjectURL = vi.fn();
      }
    );
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
  });

  afterEach(() => {
    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("fetches the served file by its served path, not by the designer's raw name", async () => {
    render(
      <ReactFlowProvider>
        <EditorAgentFlow selectedNetwork={SERVED} />
      </ReactFlowProvider>
    );
    await waitFor(() => expect(screen.getByLabelText("Export agent network")).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Export agent network"));
    });

    // The export route, like /api/v1/list, knows networks by served path. Before this
    // the request went out under the entry's name; with the entry now holding the
    // raw name that would be a 404 and a download button that silently does nothing.
    await waitFor(() =>
      expect(exportRequests()).toEqual([`http://api/api/v1/export/agent_network/${encodeURIComponent(SERVED)}`])
    );
    // The file is named after the network itself, without the folder.
    await waitFor(() => expect(downloads).toEqual(["music_nerd.hocon"]));
  });

  it("names the download after the file it fetched, not after a rename whose save failed", async () => {
    render(
      <ReactFlowProvider>
        <EditorAgentFlow selectedNetwork={SERVED} />
      </ReactFlowProvider>
    );
    await waitFor(() => expect(screen.getByLabelText("Export agent network")).toBeTruthy());

    // A rename writes the new name into the entry before its save resolves. The fetch
    // stub answers the save with no body, so the save fails and the entry is left
    // holding "bar" and no HOCON while the page still selects the old file.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Rename this network"));
    });
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("Name this network"), { target: { value: "bar" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Save network name"));
    });
    await waitFor(() =>
      expect(consoleError.mock.calls.some(([message]) => String(message).includes("Failed to name the network"))).toBe(true)
    );
    consoleError.mockRestore();
    expect(useEditorNetworkStore.getState().entries[SERVED]?.networkName).toBe("bar");

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Export agent network"));
    });

    // What went out is the old served file, so that is what the download is called.
    await waitFor(() =>
      expect(exportRequests()).toEqual([`http://api/api/v1/export/agent_network/${encodeURIComponent(SERVED)}`])
    );
    await waitFor(() => expect(downloads).toEqual(["music_nerd.hocon"]));
  });

  it("maps a draft's own name to its served path when the page has nothing selected", async () => {
    // A network built by hand: the page selects nothing, the canvas works in the
    // draft entry, and the only name anywhere is the one the user typed, which is the
    // designer's name for it once saved. The served file lives one folder down.
    render(
      <ReactFlowProvider>
        <EditorAgentFlow selectedNetwork="" />
      </ReactFlowProvider>
    );
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Add frontman"));
    });
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("Name this network"), { target: { value: "car_wash" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Save network name"));
    });
    await waitFor(() => expect(screen.getByTestId("node-car_wash_agent")).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Export agent network"));
    });

    await waitFor(() =>
      expect(exportRequests()).toEqual([
        `http://api/api/v1/export/agent_network/${encodeURIComponent("generated/car_wash")}`,
      ])
    );
    await waitFor(() => expect(downloads).toEqual(["car_wash.hocon"]));
  });
});
