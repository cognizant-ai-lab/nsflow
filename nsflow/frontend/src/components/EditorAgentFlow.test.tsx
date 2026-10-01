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

const NETWORK = "coffee_shop";

const mount = () =>
  render(
    <ReactFlowProvider>
      <EditorAgentFlow selectedNetwork={NETWORK} />
    </ReactFlowProvider>
  );

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
