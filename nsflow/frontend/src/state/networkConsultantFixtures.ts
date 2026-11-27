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
export const DEFAULT_FIXTURE_TIMEOUT_SECONDS = 400;

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
  valueType: DraftSlyDataValueType;
}

export type DraftSlyDataValueType = "string" | "number" | "boolean" | "json" | "null";

export const SLY_DATA_VALUE_TYPES: ReadonlyArray<{ value: DraftSlyDataValueType; label: string }> = [
  { value: "string", label: "String" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "json", label: "Object / List" },
  { value: "null", label: "Null" },
];

export interface DraftInteraction {
  id: string;
  text: string;
  timeoutInSeconds: string;
  slyData: DraftSlyDataEntry[];
  checks: DraftCheck[];
  original: Record<string, unknown>;
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

const slyDataValueToDraft = (value: unknown): Pick<DraftSlyDataEntry, "value" | "valueType"> => {
  if (value === null) return { value: "", valueType: "null" };
  if (typeof value === "number") return { value: String(value), valueType: "number" };
  if (typeof value === "boolean") return { value: String(value), valueType: "boolean" };
  if (typeof value === "string") return { value, valueType: "string" };
  return { value: JSON.stringify(value, null, 2) ?? "", valueType: "json" };
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};

const originalInteractions = (fixture: ConsultantFixture): Record<string, unknown>[] => {
  const interactions = fixture.definition?.interactions;
  return Array.isArray(interactions) ? interactions.map(asRecord) : [];
};

export const fixtureToDraft = (fixture: ConsultantFixture): DraftFixture => {
  const originals = originalInteractions(fixture);
  return {
    fileName: fixture.name.replace(/\.hocon$/, ""),
    successRatio: fixture.success_ratio ?? "",
    interactions: fixture.interactions.map((interaction, index) => ({
      id: newDraftId(),
      text: interaction.text,
      timeoutInSeconds:
        interaction.timeout_in_seconds != null
          ? String(interaction.timeout_in_seconds)
          : String(DEFAULT_FIXTURE_TIMEOUT_SECONDS),
      slyData: Object.entries(interaction.sly_data ?? {}).map(([key, value]) => ({
        id: newDraftId(),
        key,
        ...slyDataValueToDraft(value),
      })),
      checks: Object.entries(interaction.response_checks).map(([checkType, value]) => ({
        id: newDraftId(),
        checkType,
        value: checkValueToText(value),
      })),
      original: originals[index] ?? {},
    })),
  };
};

export const emptyInteraction = (): DraftInteraction => ({
  id: newDraftId(),
  text: "",
  timeoutInSeconds: String(DEFAULT_FIXTURE_TIMEOUT_SECONDS),
  slyData: [],
  checks: [{ id: newDraftId(), checkType: "gist", value: "" }],
  original: {},
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
  if (!draftInteractions.length) errors.push("At least one turn is required.");
  const interactions = draftInteractions.map((interaction, index) => {
    const label = `Turn ${index + 1}`;
    const timeout = Number(interaction.timeoutInSeconds);
    if (!interaction.text.trim()) errors.push(`${label}: a prompt is required.`);
    if (!interaction.timeoutInSeconds.trim() || !Number.isFinite(timeout) || timeout <= 0) {
      errors.push(`${label}: timeout must be a positive number.`);
    }
    const slyData = buildSlyData(interaction, label, errors);
    const checks = buildChecks(interaction, label, errors);
    const originalResponse = asRecord(interaction.original.response);
    const response = { ...originalResponse };
    if (interaction.checks.length > 0 || "text" in originalResponse) response.text = checks;
    return {
      ...interaction.original,
      text: interaction.text,
      timeout_in_seconds:
        Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_FIXTURE_TIMEOUT_SECONDS,
      response,
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
    if (key in slyData) {
      errors.push(`${label}: sly_data "${key}" can only be used once.`);
      return;
    }
    if (entry.valueType === "string") {
      slyData[key] = entry.value;
      return;
    }
    if (entry.valueType === "null") {
      slyData[key] = null;
      return;
    }
    if (entry.valueType === "number") {
      const value = Number(entry.value);
      if (!entry.value.trim() || !Number.isFinite(value)) {
        errors.push(`${label}: sly_data "${key}" must be a number.`);
      } else {
        slyData[key] = value;
      }
      return;
    }
    if (entry.valueType === "boolean") {
      if (entry.value === "true" || entry.value === "false") {
        slyData[key] = entry.value === "true";
      } else {
        errors.push(`${label}: sly_data "${key}" must be true or false.`);
      }
      return;
    }
    try {
      const value: unknown = JSON.parse(entry.value);
      if (typeof value !== "object" || value === null) {
        errors.push(`${label}: sly_data "${key}" must be a JSON object or list.`);
      } else {
        slyData[key] = value;
      }
    } catch {
      errors.push(`${label}: sly_data "${key}" must contain valid JSON.`);
    }
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
    if (check.checkType in checks) {
      errors.push(`${label}: "${check.checkType}" can only be used once.`);
      return;
    }
    if (NUMERIC_CHECK_TYPES.has(check.checkType)) {
      const value = Number(check.value);
      if (!check.value.trim() || !Number.isFinite(value)) {
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

export const unmanagedResponseSections = (fixture: ConsultantFixture): string[] => {
  const sections = originalInteractions(fixture).flatMap((interaction) =>
    Object.keys(asRecord(interaction.response)).filter((key) => key !== "text"),
  );
  return [...new Set(sections)];
};

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
