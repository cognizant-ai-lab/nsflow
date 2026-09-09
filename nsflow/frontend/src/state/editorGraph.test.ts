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

import { describe, expect, it } from "vitest";

import type { AgentNetworkDefinitionEntry, ConnectivityInfo } from "../uiCommon";
import { buildEditorGraph } from "./editorGraph";

const COFFEE: ConnectivityInfo[] = [
  { origin: "frontman", tools: ["barista", "loyalty"] },
  { origin: "barista", tools: [] },
  { origin: "loyalty", tools: ["rewards_db"] },
];

describe("buildEditorGraph", () => {
  it("returns an empty graph rather than throwing on a non-list definition", () => {
    // The designer's default progress style reports the definition as a dict. This
    // runs during render, so throwing here blanks the page; callers are expected to
    // normalise first, and this makes forgetting survivable.
    const asDict = { frontman: { tools: ["barista"] } } as unknown as ConnectivityInfo[];
    expect(buildEditorGraph(asDict, "coffee_shop")).toEqual({ nodes: [], edges: [] });
    expect(buildEditorGraph(undefined as unknown as ConnectivityInfo[], "x")).toEqual({
      nodes: [],
      edges: [],
    });
  });

  it("creates one node per agent, including down-chain-only references", () => {
    const { nodes } = buildEditorGraph(COFFEE, "coffee_shop");
    expect(nodes.map((n) => n.id).sort()).toEqual(["barista", "frontman", "loyalty", "rewards_db"]);
  });

  it("marks agents without their own entry as undefined_agent", () => {
    const { nodes } = buildEditorGraph(COFFEE, "coffee_shop");
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    expect(byId.frontman.type).toBe("agent");
    expect(byId.frontman.data.is_defined).toBe(true);
    expect(byId.rewards_db.type).toBe("undefined_agent");
    expect(byId.rewards_db.data.is_defined).toBe(false);
  });

  it("reproduces the node data shape the backend produced", () => {
    const { nodes } = buildEditorGraph(COFFEE, "coffee_shop");
    const frontman = nodes.find((n) => n.id === "frontman")!;
    expect(frontman.data).toEqual({
      label: "frontman",
      depth: 0,
      parent: undefined,
      children: ["barista", "loyalty"],
      instructions: "",
      dropdown_tools: [],
      sub_networks: [],
      network_name: "coffee_shop",
      is_defined: true,
    });
    expect(frontman.position).toEqual({ x: 100, y: 100 });
  });

  it("carries instructions through from the definition entry", () => {
    const withInstructions: AgentNetworkDefinitionEntry[] = [
      { origin: "frontman", tools: [], instructions: "Greet the customer." },
    ];
    const { nodes } = buildEditorGraph(withInstructions, "coffee_shop");
    expect(nodes[0].data.instructions).toBe("Greet the customer.");
  });

  it("computes depth and parent from the frontman down", () => {
    const { nodes } = buildEditorGraph(COFFEE, "coffee_shop");
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n.data]));
    expect(byId.frontman.depth).toBe(0);
    expect(byId.barista.depth).toBe(1);
    expect(byId.barista.parent).toBe("frontman");
    expect(byId.rewards_db.depth).toBe(2);
    expect(byId.rewards_db.parent).toBe("loyalty");
  });

  it("creates one edge per down-chain, in the backend's shape", () => {
    const { edges } = buildEditorGraph(COFFEE, "coffee_shop");
    expect(edges).toHaveLength(3);
    expect(edges).toContainEqual({
      id: "frontman-barista",
      source: "frontman",
      target: "barista",
      animated: false,
      type: "default",
    });
  });

  it("returns an empty graph for an empty definition", () => {
    expect(buildEditorGraph([], "coffee_shop")).toEqual({ nodes: [], edges: [] });
  });

  it("does not loop forever on a cyclic definition", () => {
    const cyclic: ConnectivityInfo[] = [
      { origin: "a", tools: ["b"] },
      { origin: "b", tools: ["a"] },
    ];
    const { nodes, edges } = buildEditorGraph(cyclic, "cyclic_net");
    expect(nodes.map((n) => n.id).sort()).toEqual(["a", "b"]);
    expect(edges).toHaveLength(2);
  });

  it("treats a leading-slash origin as an external agent, never as a definition", () => {
    // Taken from a live agent_network_designer connectivity response: external
    // agents appear as their own entries AND inside another agent's tools, but the
    // backend excludes them from the definition dict, so they must not count as
    // defined here either.
    const withExternal: ConnectivityInfo[] = [
      { origin: "agent_network_designer", tools: ["/agent_network_editor", "web_search"] },
      { origin: "/agent_network_editor", tools: [] },
      { origin: "web_search", tools: [] },
    ];
    const { nodes } = buildEditorGraph(withExternal, "agent_network_designer");
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n.data]));

    expect(byId["/agent_network_editor"].is_defined).toBe(false);
    expect(byId["web_search"].is_defined).toBe(true);
    // still reachable in the graph, as a child of the frontman
    expect(byId["/agent_network_editor"].parent).toBe("agent_network_designer");
  });
});
