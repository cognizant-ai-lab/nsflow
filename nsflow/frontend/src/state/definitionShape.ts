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
 * Converts between the two shapes an agent network definition takes.
 *
 * The designer's native shape is a DICT keyed by agent name. The connectivity report
 * and the editor store use a LIST of `{origin, tools, ...}`. Frames arrive in either,
 * so the store normalises to the list; edits are sent as the dict.
 *
 * Sending the dict rather than the list is not a style choice. The designer's own
 * list-to-dict converter copies `tools`, `instructions` and `description` only when
 * their value is TRUTHY, so an empty-string `instructions` is silently dropped on the
 * way in. That matters because emptiness is meaningful:
 *
 *   - an entry with NO instructions/description keys is a TOOLBOX tool
 *   - an entry WITH them, even empty, is an LLM agent
 *
 * So a user who clears an agent's instructions and sends the list form has that agent
 * quietly reclassified as a toolbox tool, which then fails validation ("toolbox agent
 * 'x' references tool 'y'") and summons the designer LLM to repair the network:
 * verified against a live designer at 39 seconds and thousands of tokens per edit,
 * renaming and restructuring what the user drew. Sending the dict preserves the
 * distinction and the same edit applies deterministically in under a second.
 */

import type { ConnectivityInfo } from "../uiCommon";

/** One agent's entry in the dict shape. */
type DictEntry = {
  tools?: string[];
  down_chains?: string[];
  instructions?: string;
  description?: string;
};

/**
 * Whether a name refers to something outside this network.
 *
 * Mirrors neuro-san's `is_url_or_path`: a leading slash is another agent network and
 * an http(s) URL is an MCP server. Neither is ever a definition of its own, so both
 * live only as a name in some parent's tools.
 */
export const isExternalName = (name: string): boolean =>
  name.startsWith("/") || name.startsWith("http://") || name.startsWith("https://");

/**
 * Whether an entry is a toolbox tool rather than an LLM agent.
 *
 * The test is the absence of both text fields, because that absence is exactly what
 * the designer uses: its `AddAgent` writes `instructions` and `description` for an
 * agent and nothing at all for a tool. An external reference is not a toolbox tool,
 * even though its entry is also bare.
 */
export const isToolboxTool = (entry: ConnectivityInfo | undefined): boolean => {
  if (!entry?.origin || isExternalName(entry.origin)) return false;
  const withText = entry as ConnectivityInfo & { instructions?: string; description?: string };
  return withText.instructions === undefined && withText.description === undefined;
};

/**
 * Down-chains as an array, whatever shape the frame used.
 *
 * A definition arriving from the designer sometimes carries `tools` as an
 * index-keyed object rather than an array — the editor panel has had to undo that
 * since before this store existed. Anything downstream spreads `tools`, so letting
 * one through unconverted throws "is not iterable" and takes the whole canvas down.
 * Normalising here means every later consumer can assume an array.
 */
export const toToolsArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((tool): tool is string => typeof tool === "string");
  if (value && typeof value === "object") {
    return Object.values(value).filter((tool): tool is string => typeof tool === "string");
  }
  return [];
};

/**
 * Convert the dict shape to the canonical connectivity list.
 *
 * `down_chains` is accepted alongside `tools` because the backend canonicalises
 * children under that name when converting between the two shapes.
 */
export const dictToList = (definition: Record<string, unknown>): ConnectivityInfo[] =>
  Object.entries(definition).map(([origin, value]) => {
    const entry = (value ?? {}) as DictEntry;
    return {
      origin,
      tools: toToolsArray(entry.tools ?? entry.down_chains),
      // Presence, not truthiness: an empty-string instructions still marks an LLM
      // agent, and dropping it here would turn that agent into a toolbox tool.
      ...(entry.instructions === undefined ? {} : { instructions: entry.instructions }),
      ...(entry.description === undefined ? {} : { description: entry.description }),
    } as ConnectivityInfo;
  });

/**
 * Accept either shape and return the list the store holds.
 *
 * The list shape is normalised too, not passed through: `tools` can arrive as an
 * object in either shape, and this is the one place server data enters the store.
 */
export const toConnectivityList = (definition: unknown): ConnectivityInfo[] | undefined => {
  if (Array.isArray(definition)) {
    return definition.map((entry) => ({ ...entry, tools: toToolsArray(entry?.tools) }));
  }
  if (definition && typeof definition === "object") return dictToList(definition as Record<string, unknown>);
  return undefined;
};

/**
 * Convert the connectivity list to the dict shape the designer stores.
 *
 * Three rules, each of which the designer depends on:
 *
 *  - External references are omitted. They are not definitions, and the designer
 *    drops them anyway; leaving them in would make them nodes.
 *  - `tools` is written only when non-empty. An empty `tools: []` would make a
 *    toolbox tool's entry non-empty, which is precisely what stops it being
 *    recognised as a tool.
 *  - `instructions` and `description` are written whenever the key is present, even
 *    when empty, because presence is what distinguishes an agent from a tool.
 */
export const listToDict = (definition: ConnectivityInfo[]): Record<string, unknown> => {
  const result: Record<string, unknown> = {};

  for (const entry of definition) {
    const origin = entry.origin;
    if (!origin || isExternalName(origin)) continue;

    const value: Record<string, unknown> = {};
    const tools = toToolsArray(entry.tools);
    if (tools.length > 0) value.tools = tools;

    const withText = entry as ConnectivityInfo & { instructions?: string; description?: string };
    if (withText.instructions !== undefined) value.instructions = withText.instructions;
    if (withText.description !== undefined) value.description = withText.description;

    result[origin] = value;
  }

  return result;
};
