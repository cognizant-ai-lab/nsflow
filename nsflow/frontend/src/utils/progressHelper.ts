/*
Copyright © 2025 Cognizant Technology Solutions Corp, www.cognizant.com.

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
