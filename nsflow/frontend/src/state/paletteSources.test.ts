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

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  asExternalAgentName,
  fetchPaletteItems,
  mcpServerLabel,
  rankPaletteItems,
  sanitizeNetworkName,
  type PaletteItem,
} from "./paletteSources";

const item = (label: string, description?: string): PaletteItem =>
  ({ category: "Toolbox", label, agentName: label, description }) as PaletteItem;

describe("rankPaletteItems", () => {
  it("ranks a name match above a description match", () => {
    const ranked = rankPaletteItems(
      [item("web_fetch", "Reads a page"), item("ddgs_search", "Searches the web")],
      "web"
    );
    expect(ranked.map((entry) => entry.label)).toEqual(["web_fetch", "ddgs_search"]);
  });

  it("keeps everything, in the given order, when there is no query", () => {
    const items = [item("b"), item("a")];
    expect(rankPaletteItems(items, "  ")).toBe(items);
  });

  it("drops items that match nothing", () => {
    expect(rankPaletteItems([item("web_fetch", "Reads a page")], "wikimedia")).toEqual([]);
  });
});

describe("sanitizeNetworkName", () => {
  it("turns what a user types into a name neuro-san accepts", () => {
    // neuro-san validates names against ^[a-zA-Z0-9_-]+$, so these would be rejected
    // outright. Correcting is friendlier than refusing, and unambiguous.
    expect(sanitizeNetworkName("Car Wash Customer Care")).toBe("car_wash_customer_care");
    expect(sanitizeNetworkName("  Retail Ops!  ")).toBe("retail_ops");
    expect(sanitizeNetworkName("my.network.v2")).toBe("my_network_v2");
  });

  it("leaves an already-valid name alone", () => {
    expect(sanitizeNetworkName("car_wash")).toBe("car_wash");
    expect(sanitizeNetworkName("retail-ops-2")).toBe("retail-ops-2");
  });

  it("returns empty when there is nothing usable, so the caller can refuse it", () => {
    expect(sanitizeNetworkName("   ")).toBe("");
    expect(sanitizeNetworkName("!!!")).toBe("");
  });
});

describe("asExternalAgentName", () => {
  it("marks another network as a reference out to it", () => {
    // The leading slash is what keeps the referenced network out of this network's
    // own definitions, so it stays a reference rather than becoming a copy.
    expect(asExternalAgentName("coffee_shop")).toBe("/coffee_shop");
    expect(asExternalAgentName("/coffee_shop")).toBe("/coffee_shop");
  });
});

describe("mcpServerLabel", () => {
  it("shortens a server URL, keeping what distinguishes it", () => {
    expect(mcpServerLabel("https://mcp.deepwiki.com/mcp")).toBe("mcp.deepwiki.com");
    expect(mcpServerLabel("https://example.com/server/mcp/free")).toBe("example.com/free");
    // Not a URL at all: showing the raw string beats showing nothing.
    expect(mcpServerLabel("not a url")).toBe("not a url");
  });
});

describe("fetchPaletteItems", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Serve each palette source from `bodies`, or fail it when absent. */
  const stubFetch = (bodies: Record<string, unknown>) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const match = Object.keys(bodies).find((key) => url.includes(key));
        if (!match) return { ok: false, json: async () => ({}) };
        return { ok: true, json: async () => bodies[match] };
      })
    );
  };

  it("offers networks, tools and MCP servers by the names neuro-san resolves", async () => {
    stubFetch({
      "/designer/references": {
        networks: ["/coffee_shop"],
        mcp_servers: ["https://mcp.deepwiki.com/mcp"],
      },
      "/toolbox": { tools: [{ name: "ddgs_search", description: "Search", display_as: "coded_tool" }] },
      "/list": { agents: [{ agent_name: "coffee_shop", description: "Coffee" }] },
    });

    const items = await fetchPaletteItems("http://api");

    expect(items.map((entry) => [entry.category, entry.agentName])).toEqual([
      ["Agent Networks", "/coffee_shop"],
      ["Toolbox", "ddgs_search"],
      // An MCP server is referenced by its URL, so the URL is the name.
      ["MCP Servers", "https://mcp.deepwiki.com/mcp"],
    ]);
    // The description comes from /api/v1/list, which decorates but does not decide.
    expect(items[0].description).toBe("Coffee");
  });

  it("offers only what the designer recognises, not everything the server hosts", async () => {
    // The whole point of the designer reference set. A network the server serves but
    // the designer does not know fails validation with "references an unrecognized
    // URL or path tool", and the designer answers that by rewriting the network with
    // its LLM, so every later edit breaks until the reference is removed.
    stubFetch({
      "/designer/references": { networks: ["/industry/banking_ops"] },
      "/list": {
        agents: [{ agent_name: "industry/banking_ops" }, { agent_name: "basic/coffee_finder" }],
      },
    });

    const items = await fetchPaletteItems("http://api");

    expect(items.map((entry) => entry.agentName)).toEqual(["/industry/banking_ops"]);
  });

  it("flags an MCP server whose stored token has expired", async () => {
    stubFetch({
      "/designer/references": { mcp_servers: ["https://mcp.deepwiki.com/mcp"] },
      "/mcp/oauth/connections": {
        connections: [{ server_url: "https://mcp.deepwiki.com/mcp", needs_reauth: true }],
      },
    });

    expect((await fetchPaletteItems("http://api"))[0].needsReauth).toBe(true);
  });

  it("leaves out the network being edited, which cannot be its own child", async () => {
    stubFetch({ "/designer/references": { networks: ["/coffee_shop", "/other"] } });

    const items = await fetchPaletteItems("http://api", "coffee_shop");

    expect(items.map((entry) => entry.label)).toEqual(["other"]);
  });

  it("skips a source that fails rather than emptying the palette", async () => {
    // An unreachable reference set should not hide the toolbox.
    stubFetch({ "/toolbox": { tools: [{ name: "ddgs_search" }] } });

    const items = await fetchPaletteItems("http://api");

    expect(items.map((entry) => entry.label)).toEqual(["ddgs_search"]);
  });
});
