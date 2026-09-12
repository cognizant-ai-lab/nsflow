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
 * The cached-layout path, which decides whether a newly added agent is visible.
 *
 * buildEditorGraph hands every node a placeholder position, so "does this node have
 * numbers in its position" cannot tell a laid-out node from one the cache has never
 * seen. Getting that wrong left a new agent stacked on the placeholder coordinate,
 * looking as though the edit had not applied.
 */

import type { Edge, Node } from "@xyflow/react";
import { beforeEach, describe, expect, it } from "vitest";

import { AgentLayoutManager, createLayoutManager } from "./agentLayoutManager";

/** The placeholder buildEditorGraph uses for every node it produces. */
const PLACEHOLDER = { x: 100, y: 100 };

const node = (id: string): Node => ({
  id,
  type: "agent",
  position: { ...PLACEHOLDER },
  data: { label: id },
});

const edge = (source: string, target: string): Edge => ({
  id: `${source}-${target}`,
  source,
  target,
});

describe("overlap separation", () => {
  beforeEach(() => localStorage.clear());

  /** Distance below which two cards read as one node with another missing. */
  const MIN_GAP = 60;

  const anyOverlap = (nodes: Node[]): boolean =>
    nodes.some((a, i) =>
      nodes.some(
        (b, j) =>
          i !== j &&
          Math.abs(a.position.x - b.position.x) < MIN_GAP &&
          Math.abs(a.position.y - b.position.y) < MIN_GAP
      )
    );

  /**
   * Tested directly rather than through applyLayout. The hierarchical layout does
   * not currently collide even for a dozen siblings, so driving this through the
   * public API would assert nothing: the pass is a guard against a layout that does,
   * and against the placeholder collision that made a new agent invisible.
   */
  it("pulls stacked nodes apart", () => {
    const stacked = [node("a"), node("b"), node("c")]; // all on the placeholder
    expect(anyOverlap(stacked)).toBe(true);

    const separated = AgentLayoutManager.separateOverlaps(stacked);

    expect(anyOverlap(separated)).toBe(false);
    // The first node keeps its place; only the ones that collide with it move.
    expect(separated[0].position).toEqual(stacked[0].position);
  });

  it("leaves an already-spread layout untouched", () => {
    const spread = [
      { ...node("a"), position: { x: 0, y: 0 } },
      { ...node("b"), position: { x: 400, y: 0 } },
    ];
    expect(AgentLayoutManager.separateOverlaps(spread).map((n) => n.position)).toEqual([
      { x: 0, y: 0 },
      { x: 400, y: 0 },
    ]);
  });

  it("is deterministic, so the canvas does not shuffle between renders", () => {
    const first = createLayoutManager("net_a").applyLayout(
      [node("frontman"), node("a"), node("b")],
      [edge("frontman", "a"), edge("frontman", "b")]
    );
    const second = createLayoutManager("net_b").applyLayout(
      [node("frontman"), node("a"), node("b")],
      [edge("frontman", "a"), edge("frontman", "b")]
    );

    expect(second.nodes.map((n) => n.position)).toEqual(first.nodes.map((n) => n.position));
  });
});

describe("applyLayout", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("lays out a network it has never seen", () => {
    const manager = createLayoutManager("net_fresh");
    const { nodes } = manager.applyLayout([node("frontman"), node("barista")], [
      edge("frontman", "barista"),
    ]);

    expect(nodes).toHaveLength(2);
    // Both moved off the placeholder, so neither is stacked on the other.
    expect(nodes.every((laid) => laid.position.x !== PLACEHOLDER.x || laid.position.y !== PLACEHOLDER.y))
      .toBe(true);
  });

  it("reuses cached positions when the graph has not changed", () => {
    const manager = createLayoutManager("net_stable");
    const graph: [Node[], Edge[]] = [[node("frontman"), node("barista")], [edge("frontman", "barista")]];
    const first = manager.applyLayout(...graph);

    const again = manager.applyLayout(
      [node("frontman"), node("barista")],
      [edge("frontman", "barista")]
    );

    // Same positions, so a re-render does not shuffle the canvas or discard a drag.
    expect(again.nodes.map((laid) => laid.position)).toEqual(first.nodes.map((laid) => laid.position));
  });

  it("lays out again when an agent is added, rather than leaving it on the placeholder", () => {
    const manager = createLayoutManager("net_added");
    manager.applyLayout([node("frontman"), node("barista")], [edge("frontman", "barista")]);

    // "roaster" is not in the cache. Before the fix, the cached path was taken
    // anyway and roaster kept {100,100} — invisible behind another node.
    const { nodes } = manager.applyLayout(
      [node("frontman"), node("barista"), node("roaster")],
      [edge("frontman", "barista"), edge("frontman", "roaster")]
    );

    const roaster = nodes.find((laid) => laid.id === "roaster");
    expect(roaster).toBeDefined();
    expect(roaster?.position).not.toEqual(PLACEHOLDER);
    // And it is not sitting on top of anything else.
    const others = nodes.filter((laid) => laid.id !== "roaster").map((laid) => laid.position);
    expect(others).not.toContainEqual(roaster?.position);
  });
});
