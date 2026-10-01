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
 * Does deleting a generated network from the Home sidebar delete the file that was clicked?
 *
 * The delete route takes a served path and removes the designer's subdirectory from it
 * once. The sidebar used to remove it as well, so for a nested copy left behind by #304,
 * "generated/generated/coffee_shop", the two removals together pointed at the original
 * "generated/coffee_shop" and deleted that instead (#307).
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Sidebar from "./Sidebar";

const API = "http://localhost:4173";

/** The network the test deletes, set per test so the tree opens straight onto it. */
let target = "";

vi.mock("../context/ApiPortContext", () => ({
  useApiPort: () => ({ apiUrl: API, isReady: true }),
}));

vi.mock("../context/NeuroSanContext", () => ({
  useNeuroSan: () => ({
    host: "localhost",
    port: 30015,
    connectionType: "http",
    isNsReady: true,
    setHost: vi.fn(),
    setPort: vi.fn(),
    setConnectionType: vi.fn(),
  }),
}));

vi.mock("../hooks/useChatControls", () => ({
  useChatControls: () => ({ stopWebSocket: vi.fn(), clearChat: vi.fn() }),
}));

// The sidebar expands the tree down to the active network on load, which is the
// simplest way to put the row with the delete icon on screen.
vi.mock("../context/ChatContext", () => ({
  useChatContext: () => ({ activeNetwork: target, setActiveNetwork: vi.fn() }),
}));

/** The DELETE requests the sidebar sent. */
const deleteRequests = () =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "DELETE")
    .map(([input]) => String(input));

/** Mount the sidebar with the given networks served, then delete `network` through the UI. */
const deleteThroughSidebar = async (network: string, served: string[]) => {
  target = network;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/api/v1/list")) {
        const agents = served.map((agent_name) => ({ agent_name }));
        return { ok: true, status: 200, json: async () => ({ agents }) } as Response;
      }
      if (init?.method === "DELETE") {
        return { ok: true, status: 200, json: async () => ({ deleted: network }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => "" } as Response;
    })
  );

  render(<Sidebar onSelectNetwork={vi.fn()} />);
  const deleteIcon = await screen.findByLabelText("Delete this generated agent network");
  await act(async () => {
    fireEvent.click(deleteIcon);
  });
  expect(screen.getByText(`Delete ${network}?`)).toBeTruthy();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  });
};

describe("deleting a generated network from the Home sidebar", () => {
  beforeEach(() => {
    target = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the served path, so the route's single strip lands on that file", async () => {
    await deleteThroughSidebar("generated/coffee_shop", ["generated/coffee_shop", "basic/music_nerd"]);

    // The route removes "generated/" once and deletes generated/coffee_shop.hocon.
    await waitFor(() =>
      expect(deleteRequests()).toEqual([`${API}/api/v1/hocon/generated/generated/coffee_shop`])
    );
  });

  it("deletes a nested copy, not the original it was made from", async () => {
    await deleteThroughSidebar("generated/generated/coffee_shop", ["generated/generated/coffee_shop"]);

    // The route removes one "generated/" and is left with "generated/coffee_shop", the
    // copy's own file. Stripping here as well sent ".../generated/generated/coffee_shop",
    // which the route turned into the original.
    await waitFor(() =>
      expect(deleteRequests()).toEqual([`${API}/api/v1/hocon/generated/generated/generated/coffee_shop`])
    );
  });
});
