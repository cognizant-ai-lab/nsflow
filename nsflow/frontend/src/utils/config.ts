
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

let config: any = null;

type AppRuntimeConfig = {
  NSFLOW_HOST: string;
  NSFLOW_PORT: string;
  VITE_API_PROTOCOL: string;
  VITE_WS_PROTOCOL: string;
  VITE_USE_SPEECH: boolean;
  NSFLOW_WAND_NAME: string;
  NSFLOW_CRUSE_WIDGET_AGENT_NAME: string;
  NSFLOW_CRUSE_THEME_AGENT_NAME: string;
  // Subdirectory prefix under which AND-generated networks are served (e.g. "generated").
  AGENT_NETWORK_DESIGNER_SUBDIRECTORY?: string;
  // Seconds the neuro-san server takes to reload its registries (string from backend).
  AGENT_MANIFEST_UPDATE_PERIOD_SECONDS?: string;
  // NEW flags (booleans from backend)
  NSFLOW_PLUGIN_CRUSE: boolean;
  NSFLOW_PLUGIN_WAND: boolean;
  NSFLOW_PLUGIN_MULTIMEDIACARD: boolean;
  NSFLOW_PLUGIN_MANUAL_EDITOR: boolean;
  NSFLOW_PLUGIN_EXPORT: boolean;
};

export async function loadAppConfig(): Promise<void> {
  // const isDev = import.meta.env.MODE === "development";

  // // In development, use full URL to talk to FastAPI
  // const devHost = import.meta.env.VITE_BACKEND_HOST || "localhost";
  // const devPort = import.meta.env.VITE_BACKEND_PORT || "8005";
  // const baseUrl = isDev ? `http://${devHost}:${devPort}` : "";

  // const endpoint = isDev
  //   ? `${baseUrl}/api/v1/vite_config.json`
  //   : `/api/v1/vite_config.json`;

  const res = await fetch(`/api/v1/vite_config.json`);

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  config = await res.json();
  // console.log(">>> Loaded runtime config: ", config)
}

export function getAppConfig(): AppRuntimeConfig {
  if (!config) {
    throw new Error("Config not loaded. Call loadAppConfig() first.");
  }
  return config;
}

// Feature flags convenience for components:
export function getFeatureFlags() {
  const c = getAppConfig();
  return {
    pluginCruse: !!c.NSFLOW_PLUGIN_CRUSE,
    pluginWand: !!c.NSFLOW_PLUGIN_WAND,
    pluginManualEditor: !!c.NSFLOW_PLUGIN_MANUAL_EDITOR,
    pluginMultiMediaCard: !!c.NSFLOW_PLUGIN_MULTIMEDIACARD,
    pluginExport: !!c.NSFLOW_PLUGIN_EXPORT,
    viteUseSpeech: !!c.VITE_USE_SPEECH
  };
}

// Feature flags convenience for components:
export function getWandName() {
  const c = getAppConfig();
  return {
    wandName: c.NSFLOW_WAND_NAME,
  };
}

// Subdirectory prefix under which the Agent Network Designer's generated networks
// are served by neuro-san. Defaults to "generated" when the backend doesn't supply it.
export function getGeneratedSubdir(): string {
  try {
    const raw = getAppConfig().AGENT_NETWORK_DESIGNER_SUBDIRECTORY;
    const trimmed = (raw ?? "").trim().replace(/^\/+|\/+$/g, "");
    return trimmed || "generated";
  } catch {
    // Config not loaded yet; fall back to the default prefix.
    return "generated";
  }
}

// How long (in milliseconds) the neuro-san server needs to reload its registries before a
// freshly generated network shows up in /api/v1/list. The Editor uses this to delay enabling
// the launch button after generation finishes. Defaults to 2000ms when unset or unparseable.
export function getManifestUpdatePeriodMs(): number {
  try {
    const raw = getAppConfig().AGENT_MANIFEST_UPDATE_PERIOD_SECONDS;
    const seconds = Number((raw ?? "").trim());
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  } catch {
    // Config not loaded yet; fall through to default.
  }
  return 2000;
}

// Map an Agent Network Designer (AND) generated network's raw name to the path it is
// actually *served* under by neuro-san (e.g. "foo" -> "generated/foo"), so launching it
// matches what /api/v1/list returns.
//
// IMPORTANT: only call this with a name that came from the AND design payload; it is
// generated-by-construction. Do NOT use the presence/absence of "/" to decide whether a
// network is "generated": regular networks can live in the registries root with no "/",
// and some served names legitimately contain "/". The only guard here is idempotency:
// a name already starting with "<subdir>/" is returned unchanged so it can't be
// double-prefixed (e.g. "generated/generated/foo").
export function toServedNetworkPath(rawName: string): string {
  const name = (rawName ?? "").trim();
  if (!name) return name;
  const subdir = getGeneratedSubdir();
  if (name.startsWith(`${subdir}/`)) return name;
  return `${subdir}/${name}`;
}

export function getCruseAgentNames() {
  const c = getAppConfig();
  return {
    widgetAgentName: c.NSFLOW_CRUSE_WIDGET_AGENT_NAME,
    themeAgentName: c.NSFLOW_CRUSE_THEME_AGENT_NAME,
  };
}
