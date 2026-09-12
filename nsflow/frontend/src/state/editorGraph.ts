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
 * Builds the React Flow graph from an agent network definition, in the browser.
 *
 * This replaces the POST /api/v1/connectivity/from_json round-trip the editor used
 * to make. The output shape deliberately mirrors what the backend produced, so the
 * existing consumer code and layout manager need no changes: positions are
 * placeholders, because the editor runs its layout manager over the result.
 */

import type { Edge, Node } from "@xyflow/react";

import { type ConnectivityInfo, getFrontman } from "../uiCommon";
import { toToolsArray } from "./definitionShape";

export type EditorNodeData = {
  label: string;
  depth: number;
  parent: string | undefined;
  children: string[];
  instructions: string;
  dropdown_tools: never[];
  sub_networks: never[];
  network_name: string;
  is_defined: boolean;
  // @xyflow/react 12 requires a node's data to satisfy Record<string, unknown>.
  [key: string]: unknown;
};

const DEFAULT_POSITION = { x: 100, y: 100 };

type DefinitionEntry = ConnectivityInfo & { instructions?: string };

/**
 * Whether an agent is external to this network.
 *
 * A leading slash marks a reference into another agent network, and an http(s) URL
 * marks an MCP server. Such entries are reachable inside a tools list but are never
 * definitions of their own, so they render as undefined agents. This mirrors
 * neuro-san's own `is_url_or_path`, which is what decides whether an entry survives
 * into a network's definitions.
 */
const isExternal = (name: string): boolean =>
  name.startsWith("/") || name.startsWith("http://") || name.startsWith("https://");

const downChains = (entry: ConnectivityInfo | undefined): string[] => toToolsArray(entry?.tools);

export const buildEditorGraph = (
  definition: ConnectivityInfo[],
  networkName: string
): { nodes: Node<EditorNodeData>[]; edges: Edge[] } => {
  // A backstop, not politeness. This runs during render, so anything thrown here
  // takes the whole page down, and the definition arrives from several callers —
  // one of which was handing over the designer's DICT-shaped progress payload, whose
  // missing `length` slipped past an emptiness check and then failed to iterate.
  // Callers should normalise with toConnectivityList; this makes forgetting cheap.
  if (!Array.isArray(definition) || definition.length === 0) return { nodes: [], edges: [] };

  // Entries keyed by name, for reading tools and instructions back out. External
  // references are kept here so their tools resolve, but excluded from `defined`
  // below so they never count as definitions.
  const entries = new Map<string, DefinitionEntry>();
  for (const entry of definition) {
    if (entry.origin) entries.set(entry.origin, entry as DefinitionEntry);
  }
  const defined = new Set([...entries.keys()].filter((name) => !isExternal(name)));

  // Breadth-first from the frontman, so depth and parent match the backend's
  // traversal. Tracking visited nodes also makes a cyclic definition terminate.
  const depth = new Map<string, number>();
  const parent = new Map<string, string | undefined>();
  const frontman = getFrontman(definition)?.origin ?? definition[0]?.origin;

  const queue: string[] = [];
  if (frontman) {
    depth.set(frontman, 0);
    parent.set(frontman, undefined);
    queue.push(frontman);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of downChains(entries.get(current))) {
      if (depth.has(child)) continue;
      depth.set(child, (depth.get(current) ?? 0) + 1);
      parent.set(child, current);
      queue.push(child);
    }
  }

  // Every agent that is defined or merely referenced becomes a node, so a dangling
  // down-chain still shows up on the canvas.
  const allNames = new Set<string>(entries.keys());
  for (const entry of definition) {
    for (const child of downChains(entry)) allNames.add(child);
  }

  const nodes: Node<EditorNodeData>[] = [...allNames].map((name) => {
    const entry = entries.get(name);
    const isDefined = defined.has(name);
    return {
      id: name,
      type: isDefined ? "agent" : "undefined_agent",
      position: { ...DEFAULT_POSITION },
      data: {
        label: name,
        depth: depth.get(name) ?? 0,
        parent: parent.get(name),
        children: downChains(entry),
        instructions: entry?.instructions ?? "",
        dropdown_tools: [],
        sub_networks: [],
        network_name: networkName,
        is_defined: isDefined,
      },
    };
  });

  const edges: Edge[] = [];
  for (const entry of definition) {
    if (!entry.origin) continue;
    for (const target of downChains(entry)) {
      edges.push({
        id: `${entry.origin}-${target}`,
        source: entry.origin,
        target,
        animated: false,
        type: "default",
      });
    }
  }

  return { nodes, edges };
};
