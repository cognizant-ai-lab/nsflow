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

import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import EditorSidebar from "./EditorSidebar";
import { useEditorNetworkStore } from "../state/editorNetworkStore";

const NETWORK_NAME = "generated/coffee_shop";

/** What /api/v1/network_definition returns for that network. */
const DEFINITION = {
  agent_network_definition: {
    frontman: { instructions: "You are the front man.", tools: ["helper"] },
    helper: { instructions: "You help." },
  },
  agent_network_name: NETWORK_NAME,
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
    useEditorNetworkStore.setState({ entries: {} });
    window.history.replaceState({}, "", "/editor");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/v1/network_definition/")) {
          return { ok: true, status: 200, json: async () => DEFINITION } as Response;
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

  it("opens the network named in the loadNetwork URL parameter", async () => {
    // What the pen icon on the home page opens: /editor?loadNetwork=<name>
    window.history.replaceState({}, "", `/editor?loadNetwork=${encodeURIComponent(NETWORK_NAME)}`);
    const onSelectNetwork = vi.fn();

    render(<EditorSidebar onSelectNetwork={onSelectNetwork} />);

    await waitFor(() => expect(onSelectNetwork).toHaveBeenCalledWith(NETWORK_NAME));
    expect(useEditorNetworkStore.getState().entries[NETWORK_NAME]).toBeTruthy();
  });
});
