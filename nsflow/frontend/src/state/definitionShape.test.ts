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
 * These rules are all load-bearing against a live designer, and each one was arrived
 * at by measuring what the designer does when it is broken:
 *
 *  - agent entry with no instructions/description -> read as a toolbox tool, and if
 *    it has down-chains, validation fails and the designer LLM rewrites the network
 *  - toolbox entry with anything in it -> read as an LLM agent
 *  - empty-string instructions dropped -> the agent silently becomes a tool
 */

import { describe, expect, it } from "vitest";

import type { AgentNetworkDefinitionEntry } from "../uiCommon";
import { listToDict, toConnectivityList } from "./definitionShape";

describe("listToDict", () => {
  it("keeps an agent an agent and a tool a tool", () => {
    const definition: AgentNetworkDefinitionEntry[] = [
      { origin: "frontman", tools: ["ddgs_search"], instructions: "Answer.", description: "Front" },
      { origin: "ddgs_search", tools: [] },
    ];
    const dict = listToDict(definition);

    expect(dict).toEqual({
      frontman: { tools: ["ddgs_search"], instructions: "Answer.", description: "Front" },
      // No keys at all: that absence is the only thing marking it as a toolbox tool.
      ddgs_search: {},
    });
  });

  it("keeps instructions the user deliberately cleared", () => {
    // The designer's own converter would drop these for being falsy, turning the
    // agent into a toolbox tool behind the user's back.
    const cleared: AgentNetworkDefinitionEntry[] = [
      { origin: "frontman", tools: [], instructions: "", description: "" },
    ];
    const dict = listToDict(cleared);

    expect(dict).toEqual({ frontman: { instructions: "", description: "" } });
  });

  it("omits an empty tools list, which would make a tool look like an agent", () => {
    expect(listToDict([{ origin: "ddgs_search", tools: [] }])).toEqual({ ddgs_search: {} });
  });

  it("omits external references, which are not definitions", () => {
    const withExternals: AgentNetworkDefinitionEntry[] = [
      { origin: "frontman", tools: ["/other_network", "https://mcp.example.com/mcp"], instructions: "Go." },
      { origin: "/other_network", tools: [] },
      { origin: "https://mcp.example.com/mcp", tools: [] },
    ];
    const dict = listToDict(withExternals);

    // They survive only as names in the parent's tools, which is what makes them
    // references out rather than nodes of this network.
    expect(Object.keys(dict)).toEqual(["frontman"]);
    expect(dict.frontman).toEqual({
      tools: ["/other_network", "https://mcp.example.com/mcp"],
      instructions: "Go.",
    });
  });
});

describe("toConnectivityList", () => {
  it("normalises the dict shape the designer echoes back", () => {
    expect(toConnectivityList({ frontman: { tools: ["x"], instructions: "Hi" }, x: {} })).toEqual([
      { origin: "frontman", tools: ["x"], instructions: "Hi" },
      { origin: "x", tools: [] },
    ]);
  });

  it("accepts down_chains as an alias for tools", () => {
    expect(toConnectivityList({ frontman: { down_chains: ["x"] } })).toEqual([
      { origin: "frontman", tools: ["x"] },
    ]);
  });

  it("round-trips an emptied agent without reclassifying it", () => {
    const original: AgentNetworkDefinitionEntry[] = [
      { origin: "frontman", tools: [], instructions: "", description: "" },
    ];
    expect(toConnectivityList(listToDict(original))).toEqual(original);
  });

  it("normalises tools that arrive as an index-keyed object", () => {
    // Observed from the designer, and undone by the agent panel since before this
    // store existed. Left alone, every downstream spread of `tools` throws
    // "is not iterable" and the canvas goes blank.
    expect(toConnectivityList({ frontman: { tools: { "0": "a", "1": "b" } } })).toEqual([
      { origin: "frontman", tools: ["a", "b"] },
    ]);
    expect(toConnectivityList([{ origin: "frontman", tools: { "0": "a" } }])).toEqual([
      { origin: "frontman", tools: ["a"] },
    ]);
  });

  it("survives a definition whose tools are missing or malformed", () => {
    expect(toConnectivityList([{ origin: "a" }, { origin: "b", tools: null }])).toEqual([
      { origin: "a", tools: [] },
      { origin: "b", tools: [] },
    ]);
  });

  it("keeps the list shape, and rejects anything else", () => {
    expect(toConnectivityList([{ origin: "frontman", tools: [] }])).toEqual([
      { origin: "frontman", tools: [] },
    ]);
    expect(toConnectivityList(undefined)).toBeUndefined();
    expect(toConnectivityList("nope")).toBeUndefined();
  });
});
