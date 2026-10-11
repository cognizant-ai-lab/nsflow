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

import type {
  ConsultantEndpoint,
  ConsultantFixture,
  ConsultantJobStatus,
} from "../types/networkConsultant";

export const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : "An unexpected error occurred.";

export class ConsultantApiError extends Error {
  readonly messages: string[];

  constructor(messages: string[]) {
    super(messages.join(" "));
    this.messages = messages;
  }
}

export const describeErrors = (error: unknown): string[] =>
  error instanceof ConsultantApiError ? error.messages : [describeError(error)];

const errorMessages = async (response: Response): Promise<string[]> => {
  const body = await response.json().catch(() => null);
  const detail = body?.detail;
  if (Array.isArray(detail?.errors)) return detail.errors;
  return [typeof detail === "string" ? detail : `Request failed (${response.status})`];
};

const expectSuccess = async (response: Response, fallbackMessage?: string): Promise<Response> => {
  if (!response.ok) {
    const messages = fallbackMessage ? [fallbackMessage] : await errorMessages(response);
    throw new ConsultantApiError(messages);
  }
  return response;
};

const consultantUrl = (apiUrl: string, path: string): string =>
  `${apiUrl}/api/v1/network_consultant/${path}`;

export const listConsultantFixtures = async (
  apiUrl: string,
  networkName: string,
  failureMessage?: string,
): Promise<ConsultantFixture[]> => {
  const query = new URLSearchParams({ network_name: networkName });
  const rawResponse = await fetch(`${consultantUrl(apiUrl, "fixtures")}?${query}`);
  const response = await expectSuccess(rawResponse, failureMessage?.replace("{status}", String(rawResponse.status)));
  const body = await response.json();
  return body.fixtures ?? [];
};

export const listSlyDataKeys = async (apiUrl: string, networkName: string): Promise<string[]> => {
  const query = new URLSearchParams({ network_name: networkName });
  const response = await expectSuccess(await fetch(`${consultantUrl(apiUrl, "sly_data_keys")}?${query}`));
  const body = await response.json();
  return body.keys ?? [];
};

export const saveConsultantFixture = async (
  apiUrl: string,
  networkName: string,
  fixtureName: string,
  fixture: Record<string, unknown>,
  originalFixtureName?: string,
): Promise<void> => {
  const query = new URLSearchParams({ network_name: networkName, fixture_name: fixtureName });
  if (originalFixtureName) query.set("original_fixture_name", originalFixtureName);
  await expectSuccess(
    await fetch(`${consultantUrl(apiUrl, "fixtures")}?${query}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixture }),
    }),
  );
};

export const deleteConsultantFixture = async (
  apiUrl: string,
  networkName: string,
  fixtureName: string,
): Promise<void> => {
  const query = new URLSearchParams({ network_name: networkName, fixture_name: fixtureName });
  await expectSuccess(await fetch(`${consultantUrl(apiUrl, "fixtures")}?${query}`, { method: "DELETE" }));
};

export const startConsultantJob = async (
  apiUrl: string,
  endpoint: ConsultantEndpoint,
  body: Record<string, unknown>,
): Promise<string> => {
  const response = await expectSuccess(
    await fetch(consultantUrl(apiUrl, endpoint), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const result = await response.json();
  return result.job_id;
};

export const getConsultantJob = async (
  apiUrl: string,
  jobId: string,
  themeMode: string,
): Promise<ConsultantJobStatus> => {
  const query = new URLSearchParams({ theme: themeMode });
  const rawResponse = await fetch(`${consultantUrl(apiUrl, `jobs/${jobId}`)}?${query}`);
  const response = await expectSuccess(rawResponse, `Status check failed (${rawResponse.status})`);
  return response.json();
};

export const answerConsultantJob = async (apiUrl: string, jobId: string, answer: string): Promise<void> => {
  await expectSuccess(
    await fetch(consultantUrl(apiUrl, `jobs/${jobId}/answer`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer }),
    }),
  );
};

export const stopConsultantJob = async (apiUrl: string, jobId: string): Promise<void> => {
  await expectSuccess(await fetch(consultantUrl(apiUrl, `jobs/${jobId}/stop`), { method: "POST" }));
};
