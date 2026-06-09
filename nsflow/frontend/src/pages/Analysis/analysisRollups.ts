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

import { Invocation, TraceStep } from "../../context/TraceContext";

const isSummary = (s: TraceStep) =>
  s.kind === "invocation_start" ||
  s.kind === "invocation_end" ||
  s.kind === "network_total";

/**
 * Pick the right number for an invocation's totals. Prefer the explicit
 * network_total step when present; otherwise sum per-agent rows.
 */
const invocationTotals = (inv: Invocation): {
  cost: number;
  tokens: number;
  promptTokens: number;
  completionTokens: number;
  llmCalls: number;
} => {
  const total = inv.steps.find((s) => s.kind === "network_total");
  if (total) {
    return {
      cost: total.total_cost ?? 0,
      tokens: total.total_tokens ?? 0,
      promptTokens: total.prompt_tokens ?? 0,
      completionTokens: total.completion_tokens ?? 0,
      llmCalls: total.successful_requests ?? 0,
    };
  }
  let cost = 0;
  let tokens = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let llmCalls = 0;
  for (const s of inv.steps) {
    if (isSummary(s)) continue;
    if (s.kind !== "agent" && s.kind !== "sub_network") continue;
    cost += s.total_cost ?? 0;
    tokens += s.total_tokens ?? 0;
    promptTokens += s.prompt_tokens ?? 0;
    completionTokens += s.completion_tokens ?? 0;
    llmCalls += s.successful_requests ?? 0;
  }
  return { cost, tokens, promptTokens, completionTokens, llmCalls };
};

export type NetworkRollup = {
  network: string;
  invocations: number;
  cost: number;
  tokens: number;
  llmCalls: number;
  pctOfTotal: number;
};

export const byNetwork = (invocations: Invocation[]): NetworkRollup[] => {
  const map = new Map<string, NetworkRollup>();
  for (const inv of invocations) {
    const t = invocationTotals(inv);
    const key = inv.network || "(unknown)";
    const row = map.get(key) ?? {
      network: key,
      invocations: 0,
      cost: 0,
      tokens: 0,
      llmCalls: 0,
      pctOfTotal: 0,
    };
    row.invocations += 1;
    row.cost += t.cost;
    row.tokens += t.tokens;
    row.llmCalls += t.llmCalls;
    map.set(key, row);
  }
  const rows = Array.from(map.values()).sort((a, b) => b.cost - a.cost);
  const totalCost = rows.reduce((acc, r) => acc + r.cost, 0);
  for (const r of rows) {
    r.pctOfTotal = totalCost > 0 ? (r.cost / totalCost) * 100 : 0;
  }
  return rows;
};

export type Distribution = {
  count: number;
  min: number;
  avg: number;
  p50: number;
  p90: number;
  max: number;
};

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
};

const distribution = (values: number[]): Distribution => {
  if (values.length === 0) {
    return { count: 0, min: 0, avg: 0, p50: 0, p90: 0, max: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    avg: sum / sorted.length,
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    max: sorted[sorted.length - 1],
  };
};

export type InvocationStats = {
  cost: Distribution;
  tokens: Distribution;
  llmCalls: Distribution;
  totalCost: number;
  totalTokens: number;
  totalLlmCalls: number;
};

export const invocationStats = (invocations: Invocation[]): InvocationStats => {
  const costs: number[] = [];
  const tokens: number[] = [];
  const calls: number[] = [];
  for (const inv of invocations) {
    const t = invocationTotals(inv);
    costs.push(t.cost);
    tokens.push(t.tokens);
    calls.push(t.llmCalls);
  }
  return {
    cost: distribution(costs),
    tokens: distribution(tokens),
    llmCalls: distribution(calls),
    totalCost: costs.reduce((a, b) => a + b, 0),
    totalTokens: tokens.reduce((a, b) => a + b, 0),
    totalLlmCalls: calls.reduce((a, b) => a + b, 0),
  };
};

export type NetworkInvocationStats = InvocationStats & { network: string };

/**
 * Per-network distribution stats. Networks are sorted by total cost so the
 * most-expensive ones surface first in the table.
 */
export const invocationStatsByNetwork = (
  invocations: Invocation[]
): NetworkInvocationStats[] => {
  const groups = new Map<string, Invocation[]>();
  for (const inv of invocations) {
    const key = inv.network || "(unknown)";
    const bucket = groups.get(key) ?? [];
    bucket.push(inv);
    groups.set(key, bucket);
  }
  const rows = Array.from(groups.entries()).map(([network, invs]) => ({
    network,
    ...invocationStats(invs),
  }));
  return rows.sort((a, b) => b.totalCost - a.totalCost);
};

export type AgentRollup = {
  agent: string;
  kind: string;
  hits: number;
  llmCalls: number;
  tokens: number;
  cost: number;
  totalDuration: number;
};

/**
 * Roll up by agent name within the given invocations. If `network` is set,
 * only count steps from that network. Excludes summary/boundary events.
 */
export const byAgent = (
  invocations: Invocation[],
  network?: string
): AgentRollup[] => {
  const map = new Map<string, AgentRollup>();
  for (const inv of invocations) {
    if (network && inv.network !== network) continue;
    for (const step of inv.steps) {
      if (isSummary(step)) continue;
      if (!step.agent) continue;
      const key = step.agent;
      const row = map.get(key) ?? {
        agent: key,
        kind: step.kind ?? "agent",
        hits: 0,
        llmCalls: 0,
        tokens: 0,
        cost: 0,
        totalDuration: 0,
      };
      row.hits += 1;
      row.llmCalls += step.successful_requests ?? 0;
      row.tokens += step.total_tokens ?? 0;
      row.cost += step.total_cost ?? 0;
      row.totalDuration += step.duration_s ?? 0;
      // Prefer a non-generic kind label if any step exposes one.
      if (step.kind && step.kind !== "agent") row.kind = step.kind;
      map.set(key, row);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
};

export type ModelRollup = {
  model: string;
  provider: string;
  invocations: number;
  cost: number;
  tokens: number;
  llmCalls: number;
};

/**
 * Roll up by model. Reads from `network_total` steps which are the only ones
 * neuro-san emits with a `models` map. Per-agent rows don't carry the model
 * name, so a "this agent used this model" view isn't possible without
 * upstream changes.
 */
export const byModel = (invocations: Invocation[]): ModelRollup[] => {
  const map = new Map<string, ModelRollup>();
  for (const inv of invocations) {
    const total = inv.steps.find((s) => s.kind === "network_total");
    if (!total || !total.model) continue;
    const key = `${total.provider ?? ""}::${total.model}`;
    const row = map.get(key) ?? {
      model: total.model,
      provider: total.provider ?? "",
      invocations: 0,
      cost: 0,
      tokens: 0,
      llmCalls: 0,
    };
    row.invocations += 1;
    row.cost += total.total_cost ?? 0;
    row.tokens += total.total_tokens ?? 0;
    row.llmCalls += total.successful_requests ?? 0;
    map.set(key, row);
  }
  return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
};

export const formatCost = (n: number): string =>
  n <= 0 ? "$0.00" : `$${n.toFixed(n < 1 ? 4 : 2)}`;

export const formatTokens = (n: number): string => {
  if (n <= 0) return "0";
  if (n < 1000) return n.toString();
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
};

export const formatDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 ms";
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
  if (seconds < 60) return `${seconds.toFixed(2)} s`;
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}m ${s.toFixed(1)}s`;
};
