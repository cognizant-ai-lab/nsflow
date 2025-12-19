
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
  // NEW flags (booleans from backend)
  NSFLOW_PLUGIN_CRUSE: boolean;
  NSFLOW_PLUGIN_WAND: boolean;
  NSFLOW_PLUGIN_MANUAL_EDITOR: boolean;
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