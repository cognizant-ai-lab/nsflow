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
import {
  addAgent,
  canDelete,
  canDuplicate,
  canHaveChildren,
  connectAgents,
  definitionIssues,
  deleteAgent,
  disconnectAgents,
  duplicateAgent,
  canRename,
  renameAgent,
  reparentAgent,
  rootsOf,
  uniqueAgentName,
  updateAgent,
} from "./editorOperations";

/**
 * A realistic network: LLM agents carry instructions, and `rewards_db` is a toolbox
 * tool, which is expressed by its entry having neither instructions nor description.
 * That distinction is not decoration here — it decides what may be given children.
 */
const COFFEE: AgentNetworkDefinitionEntry[] = [
  { origin: "frontman", tools: ["barista", "loyalty"], instructions: "Greet.", description: "Front" },
  { origin: "barista", tools: [], instructions: "Make coffee.", description: "Barista" },
  { origin: "loyalty", tools: ["rewards_db"], instructions: "Handle points.", description: "Loyalty" },
  { origin: "rewards_db", tools: [] },
];

describe("uniqueAgentName", () => {
  it("keeps a free name and numbers a taken one", () => {
    expect(uniqueAgentName(COFFEE, "roaster")).toBe("roaster");
    expect(uniqueAgentName(COFFEE, "barista")).toBe("barista_2");
  });

  it("lets an agent be given many children, not just one", () => {
    // The canvas builds child names from the parent ("<parent>_child"), so without
    // this an agent could be given exactly one child and every later attempt was
    // rejected as a duplicate with no feedback.
    let definition: ConnectivityInfo[] = COFFEE;
    for (let i = 0; i < 4; i += 1) {
      const name = uniqueAgentName(definition, "barista_child");
      definition = addAgent(definition, name, "barista");
    }

    expect(definition.find((entry) => entry.origin === "barista")?.tools).toEqual([
      "barista_child",
      "barista_child_2",
      "barista_child_3",
      "barista_child_4",
    ]);
  });

  it("keeps counting past names that are themselves taken", () => {
    const taken = [...COFFEE, { origin: "barista_2", tools: [] }];
    expect(uniqueAgentName(taken, "barista")).toBe("barista_3");
  });
});

describe("addAgent", () => {
  it("appends a new agent with no tools", () => {
    const next = addAgent(COFFEE, "roaster");
    expect(next.find((a) => a.origin === "roaster")).toEqual({ origin: "roaster", tools: [] });
  });

  it("attaches to the frontman when no parent is named, never leaving it floating", () => {
    // A free-floating agent gives the network a second root, which neuro-san repairs
    // with its LLM rather than rejecting. Defaulting the parent here is what makes
    // that unreachable however the agent was added.
    const next = addAgent(COFFEE, "roaster");
    expect(next.find((a) => a.origin === "frontman")?.tools).toEqual(["barista", "loyalty", "roaster"]);
    expect(definitionIssues(next)).toEqual([]);
  });

  it("makes the first agent of an empty network the frontman", () => {
    const next = addAgent([], "frontman", undefined, { instructions: "Hi.", description: "Front" });
    expect(rootsOf(next)).toEqual(["frontman"]);
    expect(definitionIssues(next)).toEqual([]);
  });

  it("attaches the new agent to a parent when one is given", () => {
    const next = addAgent(COFFEE, "roaster", "frontman");
    expect(next.find((a) => a.origin === "frontman")?.tools).toEqual(["barista", "loyalty", "roaster"]);
  });

  it("refuses to add a duplicate name, returning the definition unchanged", () => {
    expect(addAgent(COFFEE, "barista")).toBe(COFFEE);
  });

  it("refuses a toolbox tool as the parent, which would be an invalid network", () => {
    // A toolbox tool with down-chains fails the designer's structure validation and
    // gets the whole network rewritten by the LLM, so the edit must not happen at all.
    expect(addAgent(COFFEE, "roaster", "rewards_db")).toBe(COFFEE);
  });

  it("refuses an external reference as the parent", () => {
    const withExternal = [...COFFEE, { origin: "/other_network", tools: [] }];
    expect(addAgent(withExternal, "roaster", "/other_network")).toBe(withExternal);
  });

  it("does not mutate the input", () => {
    const before = JSON.stringify(COFFEE);
    addAgent(COFFEE, "roaster", "frontman");
    expect(JSON.stringify(COFFEE)).toBe(before);
  });
});

describe("canDuplicate", () => {
  it("refuses the frontman and allows any other agent", () => {
    // The copy inherits the original's parents, so duplicating the one agent that
    // has none would produce a second root.
    expect(canDuplicate(COFFEE, "frontman")).toBe(false);
    expect(canDuplicate(COFFEE, "barista")).toBe(true);
  });

  it("refuses a name that is not in the definition", () => {
    expect(canDuplicate(COFFEE, "ghost")).toBe(false);
  });
});

describe("canDelete", () => {
  it("refuses the frontman and allows any other agent", () => {
    // There is no parent to promote the frontman's children to, and removing it
    // would leave the network with no entry point. Editing its instructions or
    // starting a new draft covers what a user would want instead.
    expect(canDelete(COFFEE, "frontman")).toBe(false);
    expect(canDelete(COFFEE, "loyalty")).toBe(true);
  });

  it("allows deleting a dangling reference, which has no entry of its own", () => {
    expect(canDelete([{ origin: "frontman", tools: ["ghost"] }], "ghost")).toBe(true);
  });
});

describe("canHaveChildren", () => {
  it("allows an LLM agent and refuses a tool or an external reference", () => {
    expect(canHaveChildren(COFFEE, "frontman")).toBe(true);
    expect(canHaveChildren(COFFEE, "rewards_db")).toBe(false);
    expect(canHaveChildren(COFFEE, "/other_network")).toBe(false);
    expect(canHaveChildren(COFFEE, "https://mcp.example.com/mcp")).toBe(false);
  });

  it("allows a name that is not in the definition yet", () => {
    // It is about to be added as an agent, so refusing would block the first edit.
    expect(canHaveChildren(COFFEE, "roaster")).toBe(true);
  });
});

describe("connectAgents", () => {
  it("adds the target to the source's down-chains", () => {
    const next = connectAgents(COFFEE, "barista", "rewards_db");
    expect(next.find((a) => a.origin === "barista")?.tools).toEqual(["rewards_db"]);
  });

  it("refuses an edge out of a toolbox tool", () => {
    expect(connectAgents(COFFEE, "rewards_db", "barista")).toBe(COFFEE);
  });

  it("refuses a self-edge, a duplicate, and an unknown source", () => {
    expect(connectAgents(COFFEE, "frontman", "frontman")).toBe(COFFEE);
    expect(connectAgents(COFFEE, "frontman", "barista")).toBe(COFFEE);
    expect(connectAgents(COFFEE, "ghost", "barista")).toBe(COFFEE);
  });

  it("does not mutate the input", () => {
    const before = JSON.stringify(COFFEE);
    connectAgents(COFFEE, "barista", "rewards_db");
    expect(JSON.stringify(COFFEE)).toBe(before);
  });
});

describe("definitionIssues", () => {
  it("accepts a network with one root", () => {
    expect(definitionIssues(COFFEE)).toEqual([]);
  });

  it("reports a second root, which is what breaks a free-floating agent", () => {
    // Measured against a live designer: sending this reports "No front man agent
    // found in network" and hands the network to the LLM to restructure, discarding
    // the user's edit. So it must be caught before it goes on the wire.
    const orphaned: AgentNetworkDefinitionEntry[] = [
      ...COFFEE,
      { origin: "stray", tools: [], instructions: "Hi.", description: "Stray" },
    ];
    expect(definitionIssues(orphaned)).toEqual([
      "More than one agent has no parent (frontman, stray). Connect all but one of them.",
    ]);
  });

  it("reports a tool that has been given down-chains", () => {
    const definition: AgentNetworkDefinitionEntry[] = [
      { origin: "frontman", tools: ["rewards_db"], instructions: "Go.", description: "Front" },
      { origin: "rewards_db", tools: ["oops"] },
      { origin: "oops", tools: [], instructions: "Hi.", description: "Oops" },
    ];
    expect(definitionIssues(definition)).toContain(
      '"rewards_db" is a tool, so it cannot have down-chain agents.'
    );
  });

  it("reports a cycle with no entry point", () => {
    const cyclic: AgentNetworkDefinitionEntry[] = [
      { origin: "a", tools: ["b"], instructions: "A", description: "A" },
      { origin: "b", tools: ["a"], instructions: "B", description: "B" },
    ];
    expect(definitionIssues(cyclic)).toEqual([
      "Every agent is a down-chain of another, so the network has no entry point.",
    ]);
  });

  it("does not count an external reference as a root", () => {
    const withExternal: AgentNetworkDefinitionEntry[] = [
      { origin: "frontman", tools: ["/other_network"], instructions: "Go.", description: "Front" },
      { origin: "/other_network", tools: [] },
    ];
    expect(definitionIssues(withExternal)).toEqual([]);
  });
});

describe("disconnectAgents", () => {
  it("removes the down-chain but keeps both agents", () => {
    const next = disconnectAgents(COFFEE, "frontman", "barista");
    expect(next.find((a) => a.origin === "frontman")?.tools).toEqual(["loyalty"]);
    // The agent itself survives so it can be reconnected somewhere else.
    expect(next.find((a) => a.origin === "barista")).toBeDefined();
  });

  it("is a no-op when the connection is not there", () => {
    expect(disconnectAgents(COFFEE, "frontman", "rewards_db")).toBe(COFFEE);
  });
});

describe("reparentAgent", () => {
  it("moves an agent in one edit, never passing through a rootless state", () => {
    const next = reparentAgent(COFFEE, "barista", "frontman", "loyalty");
    expect(next.find((a) => a.origin === "frontman")?.tools).toEqual(["loyalty"]);
    expect(next.find((a) => a.origin === "loyalty")?.tools).toEqual(["rewards_db", "barista"]);
    // The whole point: the intermediate state is never observable.
    expect(definitionIssues(next)).toEqual([]);
  });

  it("refuses a move onto a tool, leaving the definition alone", () => {
    expect(reparentAgent(COFFEE, "barista", "frontman", "rewards_db")).toBe(COFFEE);
  });
});

describe("reusing an agent elsewhere in the network", () => {
  // frontman -> b, and frontman -> l1 -> l2. The goal is to move b under l2.
  const NETWORK: AgentNetworkDefinitionEntry[] = [
    { origin: "frontman", tools: ["b", "l1"], instructions: "Front.", description: "Front" },
    { origin: "b", tools: [], instructions: "B.", description: "B" },
    { origin: "l1", tools: ["l2"], instructions: "L1.", description: "L1" },
    { origin: "l2", tools: [], instructions: "L2.", description: "L2" },
  ];

  it("holds the detached step back, then saves once it is reconnected", () => {
    // Step one leaves b with no parent. Measured against a live designer, sending
    // this costs 28.5 seconds and twelve LLM tools, and the network comes back
    // restructured — so definitionIssues has to catch it and the editor has to wait.
    const detached = disconnectAgents(NETWORK, "frontman", "b");
    expect(detached.find((entry) => entry.origin === "b")).toBeDefined();
    expect(definitionIssues(detached)).toEqual([
      "More than one agent has no parent (frontman, b). Connect all but one of them.",
    ]);

    // Step two makes it valid again, and this is what actually goes to the designer.
    const reconnected = connectAgents(detached, "l2", "b");
    expect(reconnected.find((entry) => entry.origin === "l2")?.tools).toEqual(["b"]);
    expect(definitionIssues(reconnected)).toEqual([]);
  });

  it("does it in one edit when the edge endpoint is dragged instead", () => {
    const moved = reparentAgent(NETWORK, "b", "frontman", "l2");
    expect(moved.find((entry) => entry.origin === "frontman")?.tools).toEqual(["l1"]);
    expect(moved.find((entry) => entry.origin === "l2")?.tools).toEqual(["b"]);
    // Never invalid at any point, so it is sent straight away.
    expect(definitionIssues(moved)).toEqual([]);
  });
});

describe("deleteAgent", () => {
  it("refuses the frontman, leaving the definition untouched", () => {
    expect(deleteAgent(COFFEE, "frontman")).toBe(COFFEE);
  });

  it("promotes the deleted agent's children to its parent, leaving no orphan", () => {
    // loyalty owns rewards_db. Deleting loyalty must not leave rewards_db with
    // nothing chaining down to it, which would give the network a second root.
    const next = deleteAgent(COFFEE, "loyalty");
    expect(next.find((a) => a.origin === "frontman")?.tools).toEqual(["barista", "rewards_db"]);
    expect(definitionIssues(next)).toEqual([]);
  });

  it("promotes several children at once, into the deleted agent's position", () => {
    // A -> B -> C, D, E. Deleting B must leave A -> C, D, E, and where B sat.
    const chain: AgentNetworkDefinitionEntry[] = [
      { origin: "a", tools: ["b", "f"], instructions: "A.", description: "A" },
      { origin: "b", tools: ["c", "d", "e"], instructions: "B.", description: "B" },
      { origin: "c", tools: [], instructions: "C.", description: "C" },
      { origin: "d", tools: [], instructions: "D.", description: "D" },
      { origin: "e", tools: [], instructions: "E.", description: "E" },
      { origin: "f", tools: [], instructions: "F.", description: "F" },
    ];
    const next = deleteAgent(chain, "b");
    expect(next.find((entry) => entry.origin === "a")?.tools).toEqual(["c", "d", "e", "f"]);
    expect(next.map((entry) => entry.origin)).not.toContain("b");
    expect(definitionIssues(next)).toEqual([]);
  });

  it("does not duplicate a child the parent already had", () => {
    const shared: AgentNetworkDefinitionEntry[] = [
      { origin: "frontman", tools: ["mid", "shared"], instructions: "Go.", description: "Front" },
      { origin: "mid", tools: ["shared"], instructions: "Mid.", description: "Mid" },
      { origin: "shared", tools: [], instructions: "Shared.", description: "Shared" },
    ];
    expect(deleteAgent(shared, "mid").find((a) => a.origin === "frontman")?.tools).toEqual([
      "shared",
    ]);
  });

  it("removes the agent's own entry", () => {
    expect(deleteAgent(COFFEE, "barista").map((a) => a.origin)).toEqual(["frontman", "loyalty", "rewards_db"]);
  });

  it("also removes it from every other agent's tools, leaving no dangling edge", () => {
    const next = deleteAgent(COFFEE, "barista");
    expect(next.find((a) => a.origin === "frontman")?.tools).toEqual(["loyalty"]);
  });

  it("removes references even when the agent has no entry of its own", () => {
    const dangling: ConnectivityInfo[] = [{ origin: "frontman", tools: ["ghost"] }];
    expect(deleteAgent(dangling, "ghost")).toEqual([{ origin: "frontman", tools: [] }]);
  });

  it("does not mutate the input", () => {
    const before = JSON.stringify(COFFEE);
    deleteAgent(COFFEE, "barista");
    expect(JSON.stringify(COFFEE)).toBe(before);
  });
});

describe("duplicateAgent", () => {
  it("refuses the frontman, which would leave the copy with no parent", () => {
    expect(duplicateAgent(COFFEE, "frontman", "frontman_copy")).toBe(COFFEE);
  });

  it("leaves the network valid after duplicating an ordinary agent", () => {
    expect(definitionIssues(duplicateAgent(COFFEE, "barista", "barista_copy"))).toEqual([]);
  });

  it("copies the agent's tools and instructions under the new name", () => {
    const withInstructions: ConnectivityInfo[] = [
      { origin: "frontman", tools: ["loyalty"] },
      { origin: "loyalty", tools: ["rewards_db"], instructions: "Handle rewards." } as ConnectivityInfo,
    ];
    const next = duplicateAgent(withInstructions, "loyalty", "loyalty_copy");
    expect(next.find((a) => a.origin === "loyalty_copy")).toMatchObject({
      origin: "loyalty_copy",
      tools: ["rewards_db"],
      instructions: "Handle rewards.",
    });
  });

  it("attaches the copy wherever the original was referenced", () => {
    const next = duplicateAgent(COFFEE, "barista", "barista_2");
    expect(next.find((a) => a.origin === "frontman")?.tools).toEqual(["barista", "loyalty", "barista_2"]);
  });

  it("returns the definition unchanged for an unknown source or a taken name", () => {
    expect(duplicateAgent(COFFEE, "nope", "x")).toBe(COFFEE);
    expect(duplicateAgent(COFFEE, "barista", "loyalty")).toBe(COFFEE);
  });
});

describe("renameAgent", () => {
  it("follows every reference, so no parent is left pointing at a gone name", () => {
    const next = renameAgent(COFFEE, "barista", "brewer");
    expect(next.find((entry) => entry.origin === "brewer")).toBeDefined();
    expect(next.find((entry) => entry.origin === "barista")).toBeUndefined();
    // The parent's tools list is the reference that would otherwise dangle.
    expect(next.find((entry) => entry.origin === "frontman")?.tools).toEqual(["brewer", "loyalty"]);
    expect(definitionIssues(next)).toEqual([]);
  });

  it("renames the frontman too, which has no parent to follow", () => {
    const next = renameAgent(COFFEE, "frontman", "greeter");
    expect(rootsOf(next)).toEqual(["greeter"]);
    expect(definitionIssues(next)).toEqual([]);
  });

  it("refuses a name that is taken, or an unknown agent", () => {
    expect(renameAgent(COFFEE, "barista", "loyalty")).toBe(COFFEE);
    expect(renameAgent(COFFEE, "ghost", "brewer")).toBe(COFFEE);
    expect(renameAgent(COFFEE, "barista", "barista")).toBe(COFFEE);
  });

  it("refuses a tool or an external reference, whose name is what it resolves to", () => {
    const withExternal = [...COFFEE, { origin: "/other_network", tools: [] }];
    expect(canRename(COFFEE, "rewards_db")).toBe(false);
    expect(renameAgent(COFFEE, "rewards_db", "points_db")).toBe(COFFEE);
    expect(canRename(withExternal, "/other_network")).toBe(false);
  });

  it("does not mutate the input", () => {
    const before = JSON.stringify(COFFEE);
    renameAgent(COFFEE, "barista", "brewer");
    expect(JSON.stringify(COFFEE)).toBe(before);
  });
});

describe("updateAgent", () => {
  it("merges the patch into the named agent only", () => {
    const next = updateAgent(COFFEE, "barista", { instructions: "Make the coffee." });
    expect(next.find((a) => a.origin === "barista")).toMatchObject({
      origin: "barista",
      tools: [],
      instructions: "Make the coffee.",
    });
    expect(next.find((a) => a.origin === "loyalty")).toEqual(COFFEE[2]);
  });

  it("can rewire down-chains, which is how an edge edit is expressed", () => {
    const next = updateAgent(COFFEE, "frontman", { tools: ["loyalty"] });
    expect(next.find((a) => a.origin === "frontman")?.tools).toEqual(["loyalty"]);
  });

  it("returns the definition unchanged for an unknown agent", () => {
    expect(updateAgent(COFFEE, "nope", { instructions: "x" })).toBe(COFFEE);
  });
});
