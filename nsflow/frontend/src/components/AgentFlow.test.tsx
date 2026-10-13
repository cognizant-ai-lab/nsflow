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
 * Does an import from the Home page keep the imported file's metadata block?
 *
 * Home's import saves the network the same way the Editor's does, so it follows the
 * same rule: the entry holds the file's block, or {} when the file has none, and the
 * save sends it. With no key the designer keeps the block of the file it saves over,
 * which for a taken name is the old network's.
 */

import { ReactFlowProvider } from "@xyflow/react";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<typeof import("@xyflow/react")>("@xyflow/react");
  return {
    ...actual,
    ReactFlow: ({ children }: { children?: React.ReactNode }) => <div data-testid="rf">{children}</div>,
    Background: () => null,
    Controls: () => null,
  };
});

vi.mock("../context/ApiPortContext", () => ({
  useApiPort: () => ({ apiUrl: "http://api", wsUrl: "ws://api" }),
}));

vi.mock("../context/ChatContext", () => ({
  useChatContext: () => ({ sessionId: "session" }),
}));

import AgentFlow from "./AgentFlow";
import { useEditorNetworkStore } from "../state/editorNetworkStore";

describe("importing a .hocon file from Home", () => {
  const IMPORTED_BLOCK = { sample_queries: ["Imported query."] };
  /** The sly_data of every save sent to the designer, in order. */
  const savedSlyData: Record<string, unknown>[] = [];
  /** What the stubbed import endpoint answers in the current test. */
  let importResponse: Record<string, unknown> = {};

  /** Mount Home's canvas with nothing selected and choose travel.hocon in the import control. */
  const importTravel = async () => {
    const { container } = render(
      <ReactFlowProvider>
        <AgentFlow selectedNetwork="" />
      </ReactFlowProvider>
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["# travel.hocon"], "travel.hocon")] } });
    });
  };

  beforeEach(() => {
    savedSlyData.length = 0;
    importResponse = {
      network_name: "travel",
      name_is_taken: true,
      definition: { frontman: { instructions: "You are the front man." } },
      hocon: "# travel.hocon",
      metadata: IMPORTED_BLOCK,
    };
    useEditorNetworkStore.setState({ entries: {} });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/v1/hocon/import")) {
          return { ok: true, status: 200, json: async () => importResponse } as Response;
        }
        if (url.includes("/streaming_chat")) {
          savedSlyData.push(JSON.parse(String(init?.body)).sly_data);
        }
        // No body, so the save throws once it is recorded: what is under test is what
        // was sent, not how the designer answers.
        return { ok: true, body: null, status: 200, statusText: "OK", json: async () => ({}) } as unknown as Response;
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the file's block, not the block an older entry of that name held", async () => {
    useEditorNetworkStore.getState().reconcileFromServer("travel", {
      definition: [{ origin: "old_frontman", tools: [] }],
      networkName: "travel",
      metadata: { sample_queries: ["Old query."] },
    });

    await importTravel();

    await waitFor(() => expect(savedSlyData).toHaveLength(1));
    expect(savedSlyData[0].agent_network_name).toBe("travel");
    expect(savedSlyData[0].agent_network_metadata).toEqual(IMPORTED_BLOCK);
    expect(useEditorNetworkStore.getState().entries.travel.metadata).toEqual(IMPORTED_BLOCK);
  });

  it("sends {} for a file with no block, and holds it in place of the older entry's block", async () => {
    useEditorNetworkStore.getState().reconcileFromServer("travel", {
      definition: [{ origin: "old_frontman", tools: [] }],
      networkName: "travel",
      metadata: { sample_queries: ["Old query."] },
    });
    importResponse = { ...importResponse, metadata: null };

    await importTravel();

    await waitFor(() => expect(savedSlyData).toHaveLength(1));
    expect(savedSlyData[0].agent_network_metadata).toEqual({});
    // Held, not just sent: if this save failed, the next one still wipes the old block.
    expect(useEditorNetworkStore.getState().entries.travel.metadata).toEqual({});
  });
});
