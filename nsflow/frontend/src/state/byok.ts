/*
Copyright © 2026 Cognizant Technology Solutions Corp, www.cognizant.com.

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

/**
 * Bring Your Own Key: getting the user's LLM keys to neuro-san.
 *
 * The keys never reach nsflow's backend as storage. They live in the browser, are
 * attached to each request's sly_data, and neuro-san substitutes them where its
 * `llm_config` names `"sly_data"` instead of a literal key. That indirection is the
 * whole mechanism, and it is neuro-san's, not ours: a BYOK deployment's
 * `llm_config.hocon` sets `openai_api_key = "sly_data"`, which tells the runtime to
 * read `sly_data.llm_config.openai_api_key` from the client request.
 *
 * The field names come from ui-common's `LLM_PROVIDER_API_KEY_FIELD` rather than being
 * written out here. They are one half of a contract whose other half lives in a HOCON
 * file, so a second copy in nsflow would be a second thing to keep in step. ui-common
 * also owns expiry: `getApiKey` returns nothing for a key past its TTL, so a stale key
 * is simply not sent rather than sent and rejected.
 *
 * If the deployment is not BYOK, sending these is harmless: neuro-san only looks in
 * sly_data for a provider whose config asks it to.
 */

import { LLM_PROVIDER_API_KEY_FIELD, getApiKey, useSettingsStore, type LLMProvider } from "../uiCommon";

/** The `llm_config` fragment to merge into a request's sly_data, or undefined. */
export type ByokSlyData = { readonly llm_config: Record<string, string> } | undefined;

/**
 * Build the sly_data fragment carrying whatever keys the user has set.
 *
 * Returns undefined when there are none, so a caller can leave sly_data alone rather
 * than send an empty `llm_config` that means nothing.
 */
export const byokSlyData = (): ByokSlyData => {
  const { apiKeys } = useSettingsStore.getState().settings;

  const llmConfig: Record<string, string> = {};
  for (const [provider, field] of Object.entries(LLM_PROVIDER_API_KEY_FIELD) as [
    LLMProvider,
    string,
  ][]) {
    // getApiKey, not apiKeys[provider].value: it is what applies the TTL.
    const key = getApiKey(apiKeys, provider);
    if (key) llmConfig[field] = key;
  }

  return Object.keys(llmConfig).length > 0 ? { llm_config: llmConfig } : undefined;
};

/**
 * Merge the user's keys into sly_data that is about to be sent.
 *
 * Takes and returns the caller's own sly_data so the two concerns stay separate: the
 * chat panel decides what a request's sly_data is, and this only adds keys to it.
 *
 * A request with no other sly_data still gets an object when keys exist, because
 * otherwise a BYOK deployment could not be used at all from the Home page, where
 * sly_data is off unless the user ticks the box.
 */
export const withByok = (
  slyData: Record<string, unknown> | undefined
): Record<string, unknown> | undefined => {
  const byok = byokSlyData();
  if (!byok) return slyData;

  const existing = (slyData?.llm_config ?? {}) as Record<string, unknown>;
  return {
    ...(slyData ?? {}),
    // The caller's own llm_config wins on a collision: if something upstream has
    // deliberately set a key for this request, it knows more than the settings panel.
    llm_config: { ...byok.llm_config, ...existing },
  };
};

/**
 * Remove the user's keys from a sly_data blob before it is stored or displayed.
 *
 * The sly_data panel shows this text and can export it, and the per-network cache
 * persists it, so a key left in would be visible on screen and written to disk. That
 * applies in both directions: the panel records what was SENT, which now carries the
 * keys, and a network may echo `llm_config` straight back.
 *
 * ui-common does the same thing on its side (`const { llm_config: _, ...rest }` before
 * `updateSlyData`), for the same reason.
 *
 * Takes and returns the serialised form, because that is what the message carries.
 * Anything that is not a JSON object is passed through untouched rather than guessed at.
 */
export const withoutByokText = <T extends string | object>(text: T): T => {
  // A sly_data message's text is a JSON string in most paths but an object in some, so
  // both are handled rather than assuming the common one.
  if (text && typeof text === "object") {
    if (Array.isArray(text) || !("llm_config" in text)) return text;
    const { llm_config: _dropped, ...rest } = text as Record<string, unknown>;
    return rest as T;
  }
  if (typeof text !== "string" || !text.includes("llm_config")) return text;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return text;
    if (!("llm_config" in parsed)) return text;
    const { llm_config: _stripped, ...rest } = parsed as Record<string, unknown>;
    return JSON.stringify(rest, null, 2) as T;
  } catch {
    // Not JSON, so there is no structure to remove a key from. Returning the original
    // is right: this function redacts, it does not validate.
    return text;
  }
};
