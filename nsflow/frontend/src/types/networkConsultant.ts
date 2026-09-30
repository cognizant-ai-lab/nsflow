/*
Copyright © 2025-2026 Cognizant Technology Solutions Corp, www.cognizant.com.

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

export type ConsultantJobOrigin = "tests" | "generate" | "improve";
export type ConsultantEndpoint = "run-tests" | "generate-tests" | "improve";

export interface FixtureResult {
  fixture: string;
  passed: boolean;
  message?: string | null;
  infrastructure_error?: boolean;
}
export interface FixtureInteraction {
  text: string;
  timeout_in_seconds: number | null;
  response_checks: Record<string, unknown>;
  sly_data: Record<string, unknown>;
}

export interface FixtureInteractionPayload {
  text: string;
  timeout_in_seconds: number;
  response: { text: Record<string, unknown> };
  sly_data: Record<string, unknown>;
}

export interface ConsultantFixture {
  name: string;
  agent: string | null;
  success_ratio: string | null;
  connections: string[];
  interactions: FixtureInteraction[];
  raw_hocon: string;
  parse_error: string | null;
}

export interface ConsultantJobStatus {
  job_id: string;
  running: boolean;
  returncode: number | null;
  pending_question?: string | null;
  tool_issues?: string[];
  ungrounded?: string[];
  progress_chart?: string | null;
  git_branch?: string | null;
  results?: FixtureResult[];
}
