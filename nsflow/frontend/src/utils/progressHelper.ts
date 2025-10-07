// Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
// All Rights Reserved.
// Issued under the Academic Public License.
//
// You can be released from the terms, and requirements of the Academic Public
// License by purchasing a commercial license.
// Purchase of a commercial license is mandatory for any use of the
// nsflow SDK Software in commercial settings.
//
// END COPYRIGHT

export type ProgressPayload = {
  agent_network_definition?: Record<string, any>;
  agent_network_name?: string;
};

/**
 * Parse a markdown code-fenced JSON string like:
 * ```json
 * { "foo": "bar" }
 * ```
 * Also tries to unescape '\n' if needed.
 */
export function parseCodeFenceJSON(s: string): any | undefined {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (m ? m[1] : s).trim();
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(raw.replace(/\\n/g, "\n"));
    } catch {
      return undefined;
    }
  }
}

/** Normalize text (string | object) → object */
export function asObjectText(text: string | object): Record<string, any> | undefined {
  if (typeof text === "object" && text) return text as Record<string, any>;
  if (typeof text === "string") return parseCodeFenceJSON(text);
  return undefined;
}

/**
 * Extract a { agent_network_definition, agent_network_name } payload from:
 * - a ChatContext Message-like object: { text: string|object }
 * - a raw object
 * - a code-fenced JSON string
 * Also accepts { message: {...} } wrapping.
 */
export function extractProgressPayload(
  src?: { text: string | object } | string | object
): ProgressPayload | undefined {
  if (!src) return undefined;

  // If caller passed a Message-like object
  if (typeof src === "object" && "text" in (src as any)) {
    const obj = asObjectText((src as any).text);
    if (!obj) return undefined;

    if ("agent_network_definition" in obj || "agent_network_name" in obj) {
      return obj as ProgressPayload;
    }
    if ("message" in obj && typeof (obj as any).message === "object") {
      const inner = (obj as any).message;
      if ("agent_network_definition" in inner || "agent_network_name" in inner) {
        return inner as ProgressPayload;
      }
    }
    return undefined;
  }

  // If caller passed an object or string directly
  const obj = typeof src === "string" ? asObjectText(src) : (src as any);
  if (!obj || typeof obj !== "object") return undefined;

  if ("agent_network_definition" in obj || "agent_network_name" in obj) {
    return obj as ProgressPayload;
  }
  if ("message" in obj && typeof obj.message === "object") {
    const inner = obj.message;
    if ("agent_network_definition" in inner || "agent_network_name" in inner) {
      return inner as ProgressPayload;
    }
  }
  return undefined;
}
