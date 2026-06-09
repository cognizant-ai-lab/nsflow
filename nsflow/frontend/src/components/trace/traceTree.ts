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

import { TraceKind, TraceStep } from "../../context/TraceContext";
import { guessKind } from "./traceKinds";

export type TraceNode = {
  key: string;
  label: string;
  path: string[];
  step: TraceStep | null;
  kind: TraceKind;
  durationS: number;
  selfDurationS: number;
  totalTokens: number;
  totalCost: number;
  children: TraceNode[];
};

export type TraceTree = {
  roots: TraceNode[];
  totalDurationS: number;
  totalTokens: number;
  totalCost: number;
  earliestStartS: number;
  latestEndS: number;
};

/**
 * Build a hierarchy from a flat list of trace steps.
 *
 * Each step carries an `otrace` (root → ... → leaf agent). We bucket steps by
 * their full path so duplicate hits on the same agent get summed; the tree's
 * parent/child structure is derived from prefixes of those paths.
 */
export const buildTraceTree = (steps: TraceStep[]): TraceTree => {
  const byKey = new Map<string, TraceNode>();
  const childKeysByParent = new Map<string, Set<string>>();

  const ensure = (path: string[]): TraceNode => {
    const key = path.join(" / ") || "(root)";
    let node = byKey.get(key);
    if (!node) {
      node = {
        key,
        label: path[path.length - 1] ?? "(root)",
        path,
        step: null,
        kind: guessKind(path),
        durationS: 0,
        selfDurationS: 0,
        totalTokens: 0,
        totalCost: 0,
        children: [],
      };
      byKey.set(key, node);
      // Only register a parent relationship when the parent path is non-empty.
      // A 1-element path (top-level agent) has no real parent; it's a root.
      if (path.length > 1) {
        const parentKey = path.slice(0, -1).join(" / ");
        let kids = childKeysByParent.get(parentKey);
        if (!kids) {
          kids = new Set();
          childKeysByParent.set(parentKey, kids);
        }
        kids.add(key);
      }
    }
    return node;
  };

  // Ensure intermediate nodes exist even if no step landed exactly on them.
  for (const step of steps) {
    if (
      step.kind === "invocation_start" ||
      step.kind === "invocation_end" ||
      step.kind === "network_total"
    ) {
      continue;
    }
    for (let i = 1; i <= step.otrace.length; i++) {
      ensure(step.otrace.slice(0, i));
    }
  }

  // Attach the latest step's stats to its node. If the same path is hit
  // multiple times in one invocation, accumulate. Skip boundary/aggregate
  // events: invocation_start/end are markers, and network_total is a
  // summary row that would double-count the frontman's own time.
  for (const step of steps) {
    if (
      step.kind === "invocation_start" ||
      step.kind === "invocation_end" ||
      step.kind === "network_total"
    ) {
      continue;
    }
    const node = ensure(step.otrace);
    node.step = step;
    if (step.kind) node.kind = step.kind;
    node.durationS += step.duration_s || 0;
    node.totalTokens += step.total_tokens ?? 0;
    node.totalCost += step.total_cost ?? 0;
  }

  // selfDuration = node.duration - sum(children.duration), floored at 0.
  for (const node of byKey.values()) {
    const kids = childKeysByParent.get(node.key);
    if (kids) {
      for (const ck of kids) {
        const child = byKey.get(ck);
        if (child) node.children.push(child);
      }
      node.children.sort((a, b) => b.durationS - a.durationS);
      const childSum = node.children.reduce((acc, c) => acc + c.durationS, 0);
      node.selfDurationS = Math.max(node.durationS - childSum, 0);
    } else {
      node.selfDurationS = node.durationS;
    }
  }

  const rootKeys = new Set(byKey.keys());
  for (const kids of childKeysByParent.values()) {
    for (const k of kids) rootKeys.delete(k);
  }
  const roots = Array.from(rootKeys)
    .map((k) => byKey.get(k)!)
    .sort((a, b) => b.durationS - a.durationS);

  const totalDurationS = roots.reduce((acc, r) => Math.max(acc, r.durationS), 0);
  const totalTokens = roots.reduce((acc, r) => acc + r.totalTokens, 0);
  const totalCost = roots.reduce((acc, r) => acc + r.totalCost, 0);

  const startTimes = steps.map((s) => s.start_s).filter((n) => Number.isFinite(n));
  const endTimes = steps.map((s) => s.received_at).filter((n) => Number.isFinite(n));
  const earliestStartS = startTimes.length ? Math.min(...startTimes) : 0;
  const latestEndS = endTimes.length ? Math.max(...endTimes) : 0;

  return { roots, totalDurationS, totalTokens, totalCost, earliestStartS, latestEndS };
};

export const formatDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 ms";
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
  if (seconds < 60) return `${seconds.toFixed(2)} s`;
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}m ${s.toFixed(1)}s`;
};

export const formatCost = (cost: number): string => {
  if (!Number.isFinite(cost) || cost <= 0) return "—";
  return `$${cost.toFixed(4)}`;
};
