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
import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("../utils/config", () => ({
  getFeatureFlags: () => ({ pluginCruse: false }),
  toServedNetworkPath: (name: string) => name,
  getManifestUpdatePeriodMs: () => 1000,
  // Stable across a test run, so the draft session is never treated as belonging to a
  // server that has since restarted.
  getServerInstanceId: () => "test-instance",
}));

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
