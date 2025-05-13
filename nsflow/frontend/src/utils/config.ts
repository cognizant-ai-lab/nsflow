
// Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
// All Rights Reserved.
// Issued under the Academic Public License.
//
// You can be released from the terms, and requirements of the Academic Public
// License by purchasing a commercial license.
// Purchase of a commercial license is mandatory for any use of the
// nsflow SDK Software in commercial settings.
//
// END COPYRIGHT

let config: any = null;

export async function loadAppConfig(): Promise<void> {
  const isDev = import.meta.env.MODE === "development";

  // In development, use full URL to talk to FastAPI
  const devHost = import.meta.env.VITE_BACKEND_HOST || "localhost";
  const devPort = import.meta.env.VITE_BACKEND_PORT || "8005";
  const baseUrl = isDev ? `http://${devHost}:${devPort}` : "";

  const res = await fetch(`${baseUrl}/api/v1/vite_config.json`);

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  config = await res.json();
  console.log(">>> Loaded runtime config: ", config)
}

export function getAppConfig(): Record<string, any> {
  if (!config) {
    throw new Error("Config not loaded. Call loadAppConfig() first.");
  }
  return config;
}
