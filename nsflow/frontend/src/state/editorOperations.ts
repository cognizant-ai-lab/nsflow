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
 * Pure transforms on an agent network definition.
 *
 * These replace the per-operation REST calls the editor used to make (POST an
 * agent, POST a duplicate, DELETE an agent). Doing the transform in the browser is
 * what lets an edit apply instantly; `editorRoundTrip` then sends the result to the
 * designer to be canonicalised.
 *
 * They are deliberately pure and free of React or store imports, so every editing
 * affordance can share them: drag-and-drop to add, right-click to delete, the hover
 * pencil to edit instructions, and dragging an edge to rewire down-chains. Each one
 * computes the next definition and hands it to `applyEdit`.
 *
 * Every function returns the ORIGINAL array unchanged (same reference) when the
 * operation does not apply, so callers can skip a pointless round-trip with a
 * `next === definition` check.
 */

import type { ConnectivityInfo } from "../uiCommon";
import { isExternalName, isToolboxTool, toToolsArray } from "./definitionShape";

// Never spread `tools` directly: it can arrive as an index-keyed object, which
// throws "is not iterable". toToolsArray is the one place that shape is undone.
const toolsOf = (entry: ConnectivityInfo): string[] => toToolsArray(entry.tools);

const has = (definition: ConnectivityInfo[], name: string): boolean =>
  definition.some((entry) => entry.origin === name);

/**
 * A name based on `base` that the definition does not already use.
 *
 * For anonymous additions only, where "agent" becoming "agent_2" is what the user
 * expects. A name that resolves to something specific, like a toolbox tool or
 * another network, must never be adjusted this way: the adjusted name would resolve
 * to nothing at all.
 */
export const uniqueAgentName = (definition: ConnectivityInfo[], base: string): string => {
  if (!has(definition, base)) return base;
  let suffix = 2;
  while (has(definition, `${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
};

/**
 * What a newly added LLM agent starts out with.
 *
 * The designer's own `AddAgent` coded tool writes `instructions` and `description`
 * for an agent and nothing at all for a tool, which is how the two are told apart
 * downstream: an entry with neither key is a TOOLBOX tool. So an agent added without
 * them is validated as a toolbox agent, and if it has down-chains validation reports
 * "toolbox agent 'x' references tool 'y'" and the designer LLM is summoned to repair
 * the network. Measured against a live designer: 39 seconds and thousands of tokens
 * per edit, renaming and restructuring what the user drew.
 *
 * `AddAgent` writes them as empty strings, but an empty value trips a second
 * validator ("provide non-empty 'instructions' and 'description'") which summons the
 * instructions writer instead: 22 seconds. So these defaults are non-empty, which is
 * what keeps a hand-added agent on the deterministic sub-second path.
 *
 * They stay deliberately generic, saying only what is certainly true rather than
 * inventing a purpose, because the user is expected to replace them. A user who then
 * clears them keeps the empty value: emptiness is preserved on the way to the
 * designer (see `definitionShape`), which is free to fill them in from there.
 */
export const newAgentAttributes = (name: string): Record<string, unknown> => ({
  instructions: `You are ${name}.`,
  description: `The ${name} agent.`,
});

/**
 * The agents nothing else chains down to.
 *
 * A valid network has exactly one, the frontman. More than one is what neuro-san
 * reports as "No front man agent found in network", so this is the test every
 * add-like operation uses to make sure it never creates a second one.
 */
export const rootsOf = (definition: ConnectivityInfo[]): string[] => {
  const referenced = new Set<string>();
  for (const entry of definition) {
    for (const tool of toolsOf(entry)) referenced.add(tool);
  }
  return definition
    .map((entry) => entry.origin)
    .filter((origin): origin is string => Boolean(origin) && !isExternalName(origin as string))
    .filter((origin) => !referenced.has(origin));
};

/**
 * The agent a new one attaches to when the caller names no parent.
 *
 * Undefined only for an empty network, where the new agent becomes the root itself.
 */
const defaultParent = (definition: ConnectivityInfo[]): string | undefined => rootsOf(definition)[0];

/**
 * Why this definition cannot be saved yet, or an empty list when it can.
 *
 * Rearranging a network passes through states that are legitimate to look at but not
 * to persist: detach an agent and, for that moment, the network has two roots. Sent
 * as-is, neuro-san reports "No front man agent found in network" and hands the
 * network to the designer LLM to repair, which restructures it and throws away the
 * edit in progress. Measured against a live designer at 30+ seconds.
 *
 * So the editor holds such a state locally and waits. Both rules below are ones the
 * designer was observed to enforce, not guesses.
 */
export const definitionIssues = (definition: ConnectivityInfo[]): string[] => {
  if (definition.length === 0) return ["Nothing to save yet."];

  const issues: string[] = [];

  const roots = rootsOf(definition);
  if (roots.length === 0) {
    // Every agent is referenced, so the graph is a cycle with no entry point.
    issues.push("Every agent is a down-chain of another, so the network has no entry point.");
  } else if (roots.length > 1) {
    issues.push(`More than one agent has no parent (${roots.join(", ")}). Connect all but one of them.`);
  }

  for (const entry of definition) {
    if (isToolboxTool(entry) && toolsOf(entry).length > 0) {
      issues.push(`"${entry.origin}" is a tool, so it cannot have down-chain agents.`);
    }
  }

  return issues;
};

/**
 * Whether `name` is allowed down-chain agents.
 *
 * Only LLM agents are. A toolbox tool with down-chains is an invalid network:
 * validation reports "toolbox agent 'x' references tool 'y'" and the designer LLM is
 * summoned to repair it, measured at 31 seconds against a live designer. An external
 * network or MCP server has no entry of its own here, so it cannot be given children
 * either. An unknown name is treated as allowed, since it is about to be added.
 */
export const canHaveChildren = (definition: ConnectivityInfo[], name: string): boolean => {
  if (isExternalName(name)) return false;
  const entry = definition.find((candidate) => candidate.origin === name);
  return entry ? !isToolboxTool(entry) : true;
};

/**
 * Add an agent as a down-chain of `parentName`, or of the frontman when no parent is
 * named. On an empty network the new agent becomes the frontman itself.
 *
 * There is deliberately no way to add a free-floating agent. One that nothing chains
 * down to gives the network a second root, and neuro-san's response to that is not
 * to reject the edit but to hand the network to the designer LLM to repair, which
 * restructures it and discards the edit. Defaulting the parent here rather than in
 * each caller is what makes that unreachable from any affordance.
 *
 * Returns the definition unchanged if the name is already taken, since two agents
 * with one name would be ambiguous everywhere downstream, or if the named parent
 * cannot have children.
 *
 * @param attributes extra fields for the new entry. Pass `newAgentAttributes(name)`
 *        for an LLM agent; omit it for a toolbox tool, whose entry has to stay empty
 *        for the designer to recognise it as one.
 */
export const addAgent = (
  definition: ConnectivityInfo[],
  name: string,
  parentName?: string,
  attributes?: Record<string, unknown>
): ConnectivityInfo[] => {
  if (!name || has(definition, name)) return definition;
  if (parentName && !canHaveChildren(definition, parentName)) return definition;

  const parent = parentName ?? defaultParent(definition);
  const withParentLink = definition.map((entry) =>
    parent && entry.origin === parent ? { ...entry, tools: [...toolsOf(entry), name] } : entry
  );
  return [...withParentLink, { origin: name, tools: [], ...attributes } as ConnectivityInfo];
};

/**
 * Whether `name` may be duplicated.
 *
 * The frontman may not. A copy inherits the original's parents, and the frontman has
 * none, so the copy would be a second root. It is also meaningless: a network has one
 * entry point.
 */
export const canDuplicate = (definition: ConnectivityInfo[], name: string): boolean =>
  has(definition, name) && !rootsOf(definition).includes(name);

/**
 * Whether `name` may be deleted.
 *
 * The frontman may not. It is the one agent with no parent, so there is nowhere to
 * promote its children to, and removing it leaves the network with no entry point.
 * Nothing is lost by refusing: its instructions and description are editable, and
 * starting a new draft discards the whole network at once.
 *
 * A name with no entry of its own is deletable, since that only removes a dangling
 * reference.
 */
export const canDelete = (definition: ConnectivityInfo[], name: string): boolean =>
  !rootsOf(definition).includes(name);

/**
 * Make `target` a down-chain of `source`, which is what drawing an edge means.
 *
 * This is how a free agent gets wired up after being dropped on empty canvas, so it
 * has to change the definition rather than just the rendered edges: an edge that
 * only exists in React Flow state disappears the next time the canvas renders from
 * the store, and never reaches the network.
 *
 * Returns the definition unchanged when the edge would be invalid or is already
 * there, so callers can skip a pointless round-trip with a `next === definition` check.
 */
export const connectAgents = (
  definition: ConnectivityInfo[],
  source: string,
  target: string
): ConnectivityInfo[] => {
  // A self-edge is a cycle of one, and neither end may be missing.
  if (!source || !target || source === target) return definition;
  if (!has(definition, source) || !canHaveChildren(definition, source)) return definition;

  const parent = definition.find((entry) => entry.origin === source);
  if (!parent || toolsOf(parent).includes(target)) return definition;

  return definition.map((entry) =>
    entry.origin === source ? { ...entry, tools: [...toolsOf(entry), target] } : entry
  );
};

/**
 * Stop `target` being a down-chain of `source`, which is what deleting an edge means.
 *
 * The target keeps its own entry: removing a connection is not removing an agent, and
 * the user is expected to reconnect it somewhere else. That does leave the network
 * temporarily rootless in the designer's eyes if the target had no other parent, so
 * callers that care should reconnect it before sending.
 */
export const disconnectAgents = (
  definition: ConnectivityInfo[],
  source: string,
  target: string
): ConnectivityInfo[] => {
  const parent = definition.find((entry) => entry.origin === source);
  if (!parent || !toolsOf(parent).includes(target)) return definition;

  return definition.map((entry) =>
    entry.origin === source
      ? { ...entry, tools: toolsOf(entry).filter((tool) => tool !== target) }
      : entry
  );
};

/**
 * Move `target` from one parent to another in a single edit.
 *
 * Rearranging by deleting a connection and adding a new one would leave the network
 * momentarily rootless, and the round-trip in between reports "No front man agent
 * found in network" and hands the network to the designer LLM to repair. Doing both
 * halves in one edit never puts an invalid definition on the wire.
 */
export const reparentAgent = (
  definition: ConnectivityInfo[],
  target: string,
  fromParent: string,
  toParent: string
): ConnectivityInfo[] => {
  if (fromParent === toParent) return definition;
  const detached = disconnectAgents(definition, fromParent, target);
  const attached = connectAgents(detached, toParent, target);
  // Either half refusing means the move is not possible; leave the original alone.
  return attached === detached ? definition : attached;
};

/**
 * Remove an agent, every reference to it, and re-home whatever it was chaining down
 * to.
 *
 * Dropping the references matters as much as dropping the entry: a leftover name in
 * some other agent's tools would render as a dangling "undefined agent" node.
 *
 * The children are promoted to the deleted agent's own parent rather than being left
 * where they are. Left alone they would have nothing chaining down to them, which
 * gives the network extra roots and hands it to the designer LLM to repair. Promoting
 * keeps the sub-tree and keeps the network valid in one edit.
 *
 * The frontman cannot be deleted at all: there would be no parent to promote its
 * children to, and the network would be left with no entry point. See `canDelete`.
 */
export const deleteAgent = (definition: ConnectivityInfo[], name: string): ConnectivityInfo[] => {
  if (!canDelete(definition, name)) return definition;

  const removed = definition.find((entry) => entry.origin === name);
  if (!removed) {
    // No entry of its own, so there is nothing to promote: just drop the references.
    return definition.map((entry) => {
      const tools = toolsOf(entry);
      return tools.includes(name) ? { ...entry, tools: tools.filter((tool) => tool !== name) } : entry;
    });
  }

  const parent = definition.find((entry) => toolsOf(entry).includes(name))?.origin;
  const orphans = toolsOf(removed);

  return definition
    .filter((entry) => entry.origin !== name)
    .map((entry) => {
      const tools = toolsOf(entry);
      if (!tools.includes(name)) return entry;

      // The children take the deleted agent's place in the list rather than being
      // appended, so the sub-tree stays where the user last saw it. Any child the
      // parent already had is skipped, since a name may appear only once.
      const promoted =
        entry.origin === parent ? orphans.filter((orphan) => !tools.includes(orphan)) : [];
      const next: string[] = [];
      for (const tool of tools) {
        if (tool === name) next.push(...promoted);
        else next.push(tool);
      }
      return { ...entry, tools: next };
    });
};

/**
 * Copy an agent under a new name, attached wherever the original was referenced.
 *
 * Reusing the original's parents is what makes the copy appear next to it on the
 * canvas rather than floating unattached, which is also why the frontman cannot be
 * duplicated: it has no parents to reuse.
 */
export const duplicateAgent = (
  definition: ConnectivityInfo[],
  sourceName: string,
  newName: string
): ConnectivityInfo[] => {
  const source = definition.find((entry) => entry.origin === sourceName);
  if (!source || !newName || has(definition, newName)) return definition;
  // The copy is attached wherever the original was referenced, so duplicating an
  // agent with no parents would produce one with no parents.
  if (!canDuplicate(definition, sourceName)) return definition;

  const withCopyLinked = definition.map((entry) =>
    toolsOf(entry).includes(sourceName) ? { ...entry, tools: [...toolsOf(entry), newName] } : entry
  );
  return [...withCopyLinked, { ...source, origin: newName, tools: toolsOf(source) }];
};

/**
 * Rename an agent, following every reference to it.
 *
 * The name is the identity: it is the node id on the canvas, the key in the
 * definition the designer stores, and the string every parent lists in its tools.
 * Changing only the entry would leave those parents pointing at a name that no
 * longer exists, which renders as a dangling "undefined agent" and fails validation.
 *
 * Refused when the new name is taken, when either name is missing, or when the
 * agent is an external reference or a toolbox tool — those names resolve to
 * something outside this network, so renaming them would simply break the link.
 */
export const renameAgent = (
  definition: ConnectivityInfo[],
  currentName: string,
  newName: string
): ConnectivityInfo[] => {
  if (!currentName || !newName || currentName === newName) return definition;
  if (!has(definition, currentName) || has(definition, newName)) return definition;
  if (!canRename(definition, currentName)) return definition;

  return definition.map((entry) => {
    const tools = toolsOf(entry);
    const renamedTools = tools.includes(currentName)
      ? tools.map((tool) => (tool === currentName ? newName : tool))
      : tools;
    const origin = entry.origin === currentName ? newName : entry.origin;
    return origin === entry.origin && renamedTools === tools
      ? entry
      : ({ ...entry, origin, tools: renamedTools } as ConnectivityInfo);
  });
};

/**
 * Whether `name` may be renamed.
 *
 * Only an LLM agent of this network. A toolbox tool's name IS the tool it resolves
 * to, and an external reference's name is the network or MCP server it points at, so
 * renaming either would break the reference rather than relabel anything.
 */
export const canRename = (definition: ConnectivityInfo[], name: string): boolean => {
  if (!name || isExternalName(name)) return false;
  const entry = definition.find((candidate) => candidate.origin === name);
  return Boolean(entry) && !isToolboxTool(entry);
};

/**
 * Merge a patch into one agent.
 *
 * This covers both editing instructions and rewiring down-chains, since an edge
 * change is just a new `tools` array.
 */
export const updateAgent = (
  definition: ConnectivityInfo[],
  name: string,
  patch: Partial<ConnectivityInfo> & Record<string, unknown>
): ConnectivityInfo[] => {
  if (!has(definition, name)) return definition;
  return definition.map((entry) => (entry.origin === name ? { ...entry, ...patch } : entry));
};
