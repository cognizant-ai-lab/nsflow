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
  ConsultantFixture,
  FixtureInteraction,
  FixtureInteractionPayload,
} from "../types/networkConsultant";

export const STOCK_TEST_KEYS = [
  "gist",
  "not_gist",
  "keywords",
  "not_keywords",
  "value",
  "not_value",
  "less",
  "not_less",
  "greater",
  "not_greater",
] as const;

export const NUMERIC_CHECK_TYPES = new Set([
  "value",
  "not_value",
  "less",
  "not_less",
  "greater",
  "not_greater",
]);

export const SUCCESS_RATIO_PATTERN = /^\d+\/\d+$/;

let nextDraftId = 0;
export const newDraftId = (): string => String(nextDraftId++);

export interface DraftCheck {
  id: string;
  checkType: string;
  value: string;
}

export interface DraftSlyDataEntry {
  id: string;
  key: string;
  value: string;
}

export interface DraftInteraction {
  id: string;
  text: string;
  timeoutInSeconds: string;
  slyData: DraftSlyDataEntry[];
  checks: DraftCheck[];
}

export interface DraftFixture {
  fileName: string;
  successRatio: string;
  interactions: DraftInteraction[];
}

export const formatCheckTypeLabel = (key: string): string =>
  key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const checkValueToText = (value: unknown): string =>
  Array.isArray(value) ? value.map(String).join("\n") : String(value ?? "");

export const fixtureToDraft = (fixture: ConsultantFixture): DraftFixture => ({
  fileName: fixture.name.replace(/\.hocon$/, ""),
  successRatio: fixture.success_ratio ?? "",
  interactions: fixture.interactions.map((interaction) => ({
    id: newDraftId(),
    text: interaction.text,
    timeoutInSeconds: interaction.timeout_in_seconds != null ? String(interaction.timeout_in_seconds) : "400",
    slyData: Object.entries(interaction.sly_data ?? {}).map(([key, value]) => ({
      id: newDraftId(),
      key,
      value: String(value),
    })),
    checks: Object.entries(interaction.response_checks).map(([checkType, value]) => ({
      id: newDraftId(),
      checkType,
      value: checkValueToText(value),
    })),
  })),
});

export const emptyInteraction = (): DraftInteraction => ({
  id: newDraftId(),
  text: "",
  timeoutInSeconds: "400",
  slyData: [],
  checks: [{ id: newDraftId(), checkType: "gist", value: "" }],
});

export const emptyDraftFixture = (): DraftFixture => ({
  fileName: "",
  successRatio: "1/1",
  interactions: [emptyInteraction()],
});

export const buildInteractionsPayload = (
  draftInteractions: DraftInteraction[],
): { interactions: FixtureInteractionPayload[]; errors: string[] } => {
  const errors: string[] = [];
  const interactions = draftInteractions.map((interaction, index) => {
    const label = `Turn ${index + 1}`;
    const slyData = buildSlyData(interaction, label, errors);
    const checks = buildChecks(interaction, label, errors);
    return {
      text: interaction.text,
      timeout_in_seconds: Number(interaction.timeoutInSeconds) || 400,
      response: { text: checks },
      sly_data: slyData,
    };
  });
  return { interactions, errors };
};

const buildSlyData = (
  interaction: DraftInteraction,
  label: string,
  errors: string[],
): Record<string, unknown> => {
  const slyData: Record<string, unknown> = {};
  interaction.slyData.forEach((entry) => {
    const key = entry.key.trim();
    if (!key) {
      if (entry.value.trim()) errors.push(`${label}: a sly_data entry needs a variable name.`);
      return;
    }
    slyData[key] = entry.value;
  });
  return slyData;
};

const buildChecks = (
  interaction: DraftInteraction,
  label: string,
  errors: string[],
): Record<string, unknown> => {
  const checks: Record<string, unknown> = {};
  interaction.checks.forEach((check) => {
    if (NUMERIC_CHECK_TYPES.has(check.checkType)) {
      const value = Number(check.value);
      if (!check.value.trim() || Number.isNaN(value)) {
        errors.push(`${label}: "${check.checkType}" must be a number.`);
      } else {
        checks[check.checkType] = value;
      }
      return;
    }
    const values = check.value.split("\n").map((line) => line.trim()).filter(Boolean);
    if (values.length) checks[check.checkType] = values;
    else errors.push(`${label}: "${check.checkType}" needs at least one line.`);
  });
  return checks;
};

export const rawInteractionsToPayload = (
  interactions: FixtureInteraction[],
): FixtureInteractionPayload[] =>
  interactions.map((interaction) => ({
    text: interaction.text,
    timeout_in_seconds: interaction.timeout_in_seconds ?? 400,
    response: { text: interaction.response_checks },
    sly_data: interaction.sly_data ?? {},
  }));

export const uniqueCopyName = (fixtures: ConsultantFixture[], base: string): string => {
  const existingNames = new Set(fixtures.map((fixture) => fixture.name.replace(/\.hocon$/, "")));
  let candidate = `${base}_copy`;
  let suffix = 2;
  while (existingNames.has(candidate)) {
    candidate = `${base}_copy${suffix}`;
    suffix += 1;
  }
  return candidate;
};
