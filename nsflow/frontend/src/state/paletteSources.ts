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
 * The things a user can drag onto the editor canvas, and how each becomes an entry
 * in the agent network definition.
 *
 * A blank agent, plus three sources each already served by nsflow:
 *   - agent networks   GET /api/v1/list
 *   - toolbox tools    GET /api/v1/toolbox
 *   - MCP servers      GET /api/v1/mcp/oauth/connections
 *
 * There are deliberately no starter templates. A user draws whatever shape they
 * want by adding a frontman and dragging the rest in, so the editor never has to
 * guess at a shape or keep a set of canned ones in step with anything.
 */

export const BUILDING_BLOCKS = "Building Blocks";

export type PaletteCategory =
  | typeof BUILDING_BLOCKS
  | "Agent Networks"
  | "Toolbox"
  | "MCP Servers";

/** Fixed order, so sections do not reshuffle as search results come and go. */
export const CATEGORY_ORDER: PaletteCategory[] = [
  BUILDING_BLOCKS,
  "Agent Networks",
  "Toolbox",
  "MCP Servers",
];

export type PaletteItem = {
  readonly category: PaletteCategory;
  /** The name shown in the palette. */
  readonly label: string;
  /** The name this is referenced by in a definition, which is also the node id. */
  readonly agentName: string;
  /** Shown in the palette only. Deliberately never written into a definition. */
  readonly description?: string;
  /** neuro-san's own label for the kind of tool, shown as a chip on the row. */
  readonly displayAs?: string;
  /** Set on an MCP connection whose token has expired, so the palette can say so. */
  readonly needsReauth?: boolean;
  /**
   * Whether the dropped name may be adjusted to avoid a collision.
   *
   * A blank agent is anonymous, so a second one becomes `agent_2`. Everything else
   * names a specific thing the server resolves, so a duplicate drop has to be a
   * no-op instead of silently creating `ddgs_search_2`, which resolves to nothing.
   */
  readonly uniquifyName?: boolean;
  /**
   * Whether this becomes an LLM agent, as opposed to a tool or an external
   * reference. An agent's entry needs instructions and a description; a tool's entry
   * must have neither, since that absence is what marks it as a tool.
   */
  readonly isLlmAgent?: boolean;
};

/** What travels in the drag payload. Mirrors Flowise's application/reactflow key. */
export const PALETTE_DRAG_TYPE = "application/reactflow";

/**
 * The network's entry point, offered only while the canvas is blank.
 *
 * The frontman is the one agent with no parent, so it is also the one thing that
 * cannot be added by dropping it onto something. It disappears from the palette once
 * a definition exists, because a network has exactly one.
 */
export const FRONTMAN_ITEM: PaletteItem = {
  category: BUILDING_BLOCKS,
  label: "Frontman",
  agentName: "frontman",
  description: "The agent the network talks to. Every network starts with one.",
  isLlmAgent: true,
};

/** A blank agent, so a network can be built up by dragging as well as by chat. */
export const NEW_AGENT_ITEM: PaletteItem = {
  category: BUILDING_BLOCKS,
  label: "Agent",
  agentName: "agent",
  description: "An LLM agent. Drop it on another agent to attach it as a down-chain.",
  uniquifyName: true,
  isLlmAgent: true,
};

/**
 * Turn what a user typed into a name neuro-san will accept.
 *
 * Names become HOCON filenames and URL path segments, and neuro-san validates them
 * against `^[a-zA-Z0-9_-]+$`, so "Car Wash Customer Care" would be rejected. Rather
 * than refuse it, this is what the user obviously meant: lower_snake_case.
 *
 * Applied on save rather than while typing, so the field does not fight the user
 * mid-word.
 */
export const sanitizeNetworkName = (proposed: string): string =>
  proposed
    .trim()
    .toLowerCase()
    // Anything that is not a name character becomes a separator, so spaces, dots and
    // punctuation all collapse the same way.
    .replace(/[^a-z0-9_-]+/g, "_")
    // Collapse runs and trim the separators a collapse can leave at either end.
    .replace(/_{2,}/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "");

/**
 * An agent network dropped onto a different network is a reference OUT to it, not a
 * copy of it. neuro-san spells such a reference with a leading slash, so this is the
 * convention rather than an invention: a live designer network lists
 * "/agent_network_editor" exactly this way.
 */
export const asExternalAgentName = (networkName: string): string =>
  networkName.startsWith("/") ? networkName : `/${networkName}`;

/**
 * What a dropped item becomes, and why `isLlmAgent` decides it.
 *
 * The designer tells the kinds apart by name and by which keys an entry carries,
 * never by any marker the editor could set:
 *
 *  - An external network ("/name") or an MCP server ("https://...") is omitted from
 *    the definitions and lives only as a name in its parent's tools, which is what
 *    makes it an external reference.
 *  - A toolbox tool must arrive with NO instructions and NO description. That absence
 *    is the only thing marking it as a tool, so its palette description must never be
 *    written into the entry, however tempting.
 *  - An LLM agent must arrive WITH both, and non-empty, or it is classified as a tool
 *    or sent to the instructions writer. `newAgentAttributes` supplies them.
 */

/**
 * Rank items against a query.
 *
 * Deliberately simple: a name match beats a description match, and an earlier match
 * beats a later one. Enough to make a long toolbox list usable without pulling in a
 * fuzzy-search dependency.
 */
export const rankPaletteItems = (items: PaletteItem[], query: string): PaletteItem[] => {
  const q = query.trim().toLowerCase();
  if (!q) return items;

  const scored = items
    .map((item) => {
      const label = item.label.toLowerCase();
      const description = (item.description ?? "").toLowerCase();
      const inLabel = label.indexOf(q);
      const inDescription = description.indexOf(q);

      let score = -1;
      if (label === q) score = 1000;
      else if (inLabel === 0) score = 500 - label.length;
      else if (inLabel > 0) score = 200 - inLabel;
      else if (inDescription >= 0) score = 50 - Math.min(inDescription, 49);

      return { item, score };
    })
    .filter((entry) => entry.score >= 0);

  scored.sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label));
  return scored.map((entry) => entry.item);
};

/** Group ranked items for display, preserving rank inside each category. */
export const groupByCategory = (items: PaletteItem[]): Map<PaletteCategory, PaletteItem[]> => {
  const grouped = new Map<PaletteCategory, PaletteItem[]>();
  for (const item of items) {
    const bucket = grouped.get(item.category);
    if (bucket) bucket.push(item);
    else grouped.set(item.category, [item]);
  }
  return grouped;
};

type ListResponse = { agents?: Array<{ agent_name?: string; description?: string }> };
type ToolboxResponse = { tools?: Array<{ name?: string; description?: string; display_as?: string }> };
type McpConnectionsResponse = { connections?: Array<{ server_url?: string; needs_reauth?: boolean }> };
type ReferencesResponse = { networks?: string[]; mcp_servers?: string[] };

/**
 * A short label for an MCP server, since the full URL is too long for a palette row.
 *
 * The host alone is ambiguous when one host serves several MCP endpoints
 * ("example.com/mcp/a" and "example.com/mcp/b"), so the last meaningful path segment
 * is kept when there is one.
 */
export const mcpServerLabel = (serverUrl: string): string => {
  try {
    const url = new URL(serverUrl);
    const segments = url.pathname.split("/").filter((segment) => segment && segment !== "mcp");
    const tail = segments[segments.length - 1];
    return tail ? `${url.host}/${tail}` : url.host;
  } catch {
    // Not a parseable URL; the raw string is still the most useful thing to show.
    return serverUrl;
  }
};

const getJson = async <T,>(url: string): Promise<T | undefined> => {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
};

/**
 * Load everything the palette can offer.
 *
 * What may be OFFERED comes from the designer's own reference set, not from
 * everything the server hosts. The two are different, and the difference is not
 * cosmetic: referencing a network the designer does not recognise fails validation
 * with "references an unrecognized URL or path tool", and the designer's answer to a
 * failed validation is to invoke its LLM and restructure the network. One such
 * reference therefore breaks every later edit until it is removed. /api/v1/list and
 * the OAuth connection store are still read, but only to decorate the rows.
 *
 * A source that fails is skipped rather than failing the whole palette: an MCP
 * server store being unreachable should not hide the toolbox.
 */
export const fetchPaletteItems = async (apiUrl: string, currentNetwork?: string): Promise<PaletteItem[]> => {
  const [references, toolbox, list, connections] = await Promise.all([
    getJson<ReferencesResponse>(`${apiUrl}/api/v1/designer/references`),
    getJson<ToolboxResponse>(`${apiUrl}/api/v1/toolbox`),
    getJson<ListResponse>(`${apiUrl}/api/v1/list`),
    getJson<McpConnectionsResponse>(`${apiUrl}/api/v1/mcp/oauth/connections`),
  ]);

  // Descriptions are worth showing but are not what decides the offer, so a missing
  // list simply means rows without a subtitle.
  const describedBy = new Map<string, string>();
  for (const agent of list?.agents ?? []) {
    if (agent.agent_name && agent.description) describedBy.set(agent.agent_name, agent.description);
  }

  // An MCP server can be offered by the designer while its stored token has expired.
  // That is worth flagging on the row, but it does not change what may be referenced.
  const needsReauth = new Set<string>();
  for (const connection of connections?.connections ?? []) {
    if (connection.server_url && connection.needs_reauth) needsReauth.add(connection.server_url);
  }

  const items: PaletteItem[] = [];

  for (const networkName of references?.networks ?? []) {
    // Already in "/<name>" form; asExternalAgentName leaves it alone.
    const agentName = asExternalAgentName(networkName);
    const label = agentName.replace(/^\//, "");
    // Referencing the network being edited would make it its own child.
    if (!label || label === currentNetwork) continue;
    items.push({
      category: "Agent Networks",
      label,
      agentName,
      description: describedBy.get(label),
    });
  }

  for (const tool of toolbox?.tools ?? []) {
    if (!tool.name) continue;
    items.push({
      category: "Toolbox",
      label: tool.name,
      agentName: tool.name,
      description: tool.description,
      displayAs: tool.display_as ?? "coded_tool",
    });
  }

  for (const serverUrl of references?.mcp_servers ?? []) {
    if (!serverUrl) continue;
    items.push({
      category: "MCP Servers",
      label: mcpServerLabel(serverUrl),
      // neuro-san references an MCP server by its URL, so the URL is the name.
      agentName: serverUrl,
      description: serverUrl,
      needsReauth: needsReauth.has(serverUrl),
    });
  }

  return items;
};
