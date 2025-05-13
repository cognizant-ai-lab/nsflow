
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
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./app/App";
import { loadAppConfig } from "./utils/config";

async function bootstrap() {
  try {
    await loadAppConfig();
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  } catch (error) {
    console.error("[x] Failed to load runtime config:", error);
    const root = document.getElementById("root");
    if (root) {
      root.innerHTML = `<div style="color: white; background: red; padding: 1rem; font-family: monospace;">
        Failed to load config.json<br>${(error as Error).message}
      </div>`;
    }
  }
}

bootstrap();
