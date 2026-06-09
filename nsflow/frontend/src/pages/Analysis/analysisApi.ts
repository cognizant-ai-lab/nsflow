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

import { TraceKind } from "../../context/TraceContext";

export type InvocationSummary = {
  invocation_id: string;
  network: string;
  prompt: string;
  started_at: number;
  ended_at: number | null;
  duration_s: number | null;
  total_cost: number;
  total_tokens: number;
  llm_calls: number;
  model: string | null;
  provider: string | null;
};

export type KeyedRollupRow = {
  key: string | null;
  invocations: number;
  cost: number;
  tokens: number;
  llm_calls: number;
};

export type AgentRollupRow = {
  agent: string | null;
  kind: NonNullable<TraceKind>;
  hits: number;
  cost: number;
  tokens: number;
  llm_calls: number;
  total_duration_s: number;
};

export type RangeFilters = {
  network?: string | null;
  since?: number | null;
  until?: number | null;
};

const buildQuery = (
  base: string,
  params: Record<string, string | number | null | undefined>
): string => {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    usp.set(k, String(v));
  }
  const q = usp.toString();
  return q ? `${base}?${q}` : base;
};

export const fetchInvocations = async (
  apiUrl: string,
  filters: RangeFilters & { limit?: number } = {}
): Promise<InvocationSummary[]> => {
  const url = buildQuery(`${apiUrl}/api/v1/trace/invocations`, {
    network: filters.network,
    since: filters.since,
    until: filters.until,
    limit: filters.limit ?? 500,
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load invocations: ${res.status}`);
  const data = await res.json();
  return data?.invocations ?? [];
};

export const fetchKeyedRollups = async (
  apiUrl: string,
  groupBy: "network" | "model",
  filters: RangeFilters = {}
): Promise<KeyedRollupRow[]> => {
  const url = buildQuery(`${apiUrl}/api/v1/trace/rollups`, {
    group_by: groupBy,
    network: filters.network,
    since: filters.since,
    until: filters.until,
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${groupBy} rollup: ${res.status}`);
  const data = await res.json();
  return data?.rows ?? [];
};

export const fetchAgentRollups = async (
  apiUrl: string,
  filters: RangeFilters = {}
): Promise<AgentRollupRow[]> => {
  const url = buildQuery(`${apiUrl}/api/v1/trace/rollups`, {
    group_by: "agent",
    network: filters.network,
    since: filters.since,
    until: filters.until,
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load agent rollup: ${res.status}`);
  const data = await res.json();
  return data?.rows ?? [];
};
