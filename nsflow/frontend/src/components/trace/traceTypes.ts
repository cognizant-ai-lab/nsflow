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

// Shared data shapes for the trace pipeline.

export type TraceKind =
  | "agent"
  | "sub_network"
  | "tool"
  | "external_agent"
  | "network_total"
  | "invocation_start"
  | "invocation_end";

export type TraceStep = {
  invocation_id?: string | null;
  network?: string | null;
  otrace: string[];
  agent: string;
  depth: number;
  kind?: TraceKind;
  duration_s: number;
  received_at: number;
  start_s: number;
  total_tokens?: number | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_cost?: number | null;
  successful_requests?: number | null;
  is_network_total?: boolean;
  params?: Record<string, unknown> | null;
  prompt?: string | null;
  model?: string | null;
  provider?: string | null;
};

export type Invocation = {
  id: string;
  network: string;
  prompt: string;
  startedAt: number;
  endedAt: number | null;
  steps: TraceStep[];
};
