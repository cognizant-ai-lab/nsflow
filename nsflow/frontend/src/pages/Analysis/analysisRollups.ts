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

// Client-side distribution stats over the API's invocation summaries.

export type Distribution = {
  count: number;
  min: number;
  avg: number;
  p50: number;
  p90: number;
  max: number;
};

export type InvocationStats = {
  cost: Distribution;
  tokens: Distribution;
  llmCalls: Distribution;
  totalCost: number;
  totalTokens: number;
  totalLlmCalls: number;
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

export const invocationStatsFromSummaries = (
  summaries: Array<{ total_cost: number; total_tokens: number; llm_calls: number }>
): InvocationStats => {
  const costs = summaries.map((s) => s.total_cost ?? 0);
  const tokens = summaries.map((s) => s.total_tokens ?? 0);
  const calls = summaries.map((s) => s.llm_calls ?? 0);
  return {
    cost: distribution(costs),
    tokens: distribution(tokens),
    llmCalls: distribution(calls),
    totalCost: costs.reduce((a, b) => a + b, 0),
    totalTokens: tokens.reduce((a, b) => a + b, 0),
    totalLlmCalls: calls.reduce((a, b) => a + b, 0),
  };
};

export { formatCost, formatDuration, formatTokens } from "../../components/trace/formatters";
