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

import { beforeEach, describe, expect, it } from "vitest";

import { byokSlyData, withByok, withoutByokText } from "./byok";
import { API_KEYS_TTL_MS, LLM_PROVIDER_API_KEY_FIELD, useSettingsStore } from "../uiCommon";

/** Save a key the way the settings panel does, including a real expiry. */
const saveKey = (provider: "OpenAI" | "Anthropic", value: string, expiresAt?: number) =>
  useSettingsStore.getState().updateSettings({
    apiKeys: { [provider]: { value, expiresAt: expiresAt ?? Date.now() + API_KEYS_TTL_MS } },
  });

describe("byok", () => {
  beforeEach(() => {
    useSettingsStore.getState().resetSettings();
  });

  it("sends nothing when the user has set no keys", () => {
    // Not an empty llm_config: an empty one asserts something about the request that
    // is not true, and a deployment reading it would find no key where one was implied.
    expect(byokSlyData()).toBeUndefined();
    expect(withByok(undefined)).toBeUndefined();
    expect(withByok({ existing: 1 })).toEqual({ existing: 1 });
  });

  it("names each key by the field neuro-san reads, not by the provider", () => {
    saveKey("OpenAI", "sk-test");
    // The mapping is ui-common's, so this also pins that we are using it rather than
    // writing the field name out ourselves.
    expect(byokSlyData()).toEqual({ llm_config: { [LLM_PROVIDER_API_KEY_FIELD.OpenAI]: "sk-test" } });
  });

  it("carries keys even when the request has no other sly_data", () => {
    // Home mode sends no sly_data unless the user ticks the box. A BYOK deployment has
    // no keys of its own, so dropping them there would refuse every turn.
    saveKey("Anthropic", "sk-ant-test");
    expect(withByok(undefined)).toEqual({
      llm_config: { [LLM_PROVIDER_API_KEY_FIELD.Anthropic]: "sk-ant-test" },
    });
  });

  it("leaves a key the caller set for this request alone", () => {
    saveKey("OpenAI", "from-settings");
    const merged = withByok({ llm_config: { [LLM_PROVIDER_API_KEY_FIELD.OpenAI]: "from-caller" } });
    expect(merged).toEqual({ llm_config: { [LLM_PROVIDER_API_KEY_FIELD.OpenAI]: "from-caller" } });
  });

  it("does not send an expired key", () => {
    // Expiry is ui-common's, applied by getApiKey. Asserted here because the failure
    // mode is silent: an expired key would be sent and rejected mid-run.
    saveKey("OpenAI", "stale", Date.now() - 1000);
    expect(byokSlyData()).toBeUndefined();
  });

  it("keeps other sly_data untouched", () => {
    saveKey("OpenAI", "sk-test");
    const merged = withByok({ agent_network_name: "demo" });
    expect(merged?.agent_network_name).toBe("demo");
  });
});

describe("withoutByokText", () => {
  it("removes the keys from a serialised blob but keeps everything else", () => {
    const text = JSON.stringify({ llm_config: { openai_api_key: "sk-secret" }, keep: "me" });
    const redacted = withoutByokText(text);
    expect(redacted).not.toContain("sk-secret");
    expect(JSON.parse(redacted)).toEqual({ keep: "me" });
  });

  it("removes the keys from an object blob too", () => {
    const redacted = withoutByokText({ llm_config: { openai_api_key: "sk-secret" }, keep: "me" });
    expect(redacted).toEqual({ keep: "me" });
  });

  it("leaves a blob without keys exactly as it was", () => {
    const text = JSON.stringify({ agent_network_name: "demo" });
    expect(withoutByokText(text)).toBe(text);
  });

  it("passes through anything that is not a JSON object", () => {
    // It redacts; it does not validate. Mangling a non-JSON message would lose data
    // the sly_data panel is meant to show.
    expect(withoutByokText("Welcome to sly_data logs.")).toBe("Welcome to sly_data logs.");
    expect(withoutByokText("")).toBe("");
  });
});
