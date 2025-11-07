
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

import React, { createContext, useEffect, useState, useContext } from "react";
import { getAppConfig } from "../utils/config";

const DEFAULT_PORT = 4173;
const NSFLOW_DEV_PORT = 8005;

type ApiPortContextType = {
  apiPort: number;
  setApiPort: (port: number) => void;
  apiUrl: string;
  setApiUrl: (url: string) => void;
  wsUrl: string;
  setWsUrl: (url: string) => void;
  isReady: boolean;
};

const ApiPortContext = createContext<ApiPortContextType | undefined>(undefined);

export const ApiPortProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [apiPort, setApiPort] = useState<number>(DEFAULT_PORT);
  const [apiUrl, setApiUrl] = useState<string>("");
  const [wsUrl, setWsUrl] = useState<string>("");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    (async () => {
      const config = getAppConfig();

      // 1) PRODUCTION: try same-origin first
      const sameOrigin = window.location.origin; // e.g., https://nsflow.onrender.com
      try {
        const r = await fetch(`${sameOrigin}/api/v1/ping`, { method: "GET" });
        if (r.ok) {
          setApiUrl(sameOrigin);
          // WebSocket protocol from current page:
          const wsProto = sameOrigin.startsWith("https") ? "wss" : "ws";
          const wsBase = sameOrigin.replace(/^https?/, wsProto);
          setWsUrl(wsBase);
          setApiPort(0); // not used in same-origin
          setIsReady(true);
          return;
        }
      } catch (e) {
        // ignore; we'll fall back
      }

      // 2) DEV FALLBACK: use config host/port (ONLY for local dev)
      // Avoid 0.0.0.0 in browser; if present, treat as localhost
      const host = (config.NSFLOW_HOST || "localhost").replace(/^0\.0\.0\.0$/, "localhost");
      const port = parseInt(config.NSFLOW_PORT || `${NSFLOW_DEV_PORT}`, 10);
      const httpProtocol = config.VITE_API_PROTOCOL || "http";
      const wsProtocol = config.VITE_WS_PROTOCOL || "ws";

      const resolvedApiUrl = port ? `${httpProtocol}://${host}:${port}` : `${httpProtocol}://${host}`;
      const resolvedWsUrl  = port ? `${wsProtocol}://${host}:${port}`    : `${wsProtocol}://${host}`;

      try {
        const r2 = await fetch(`${resolvedApiUrl}/api/v1/ping`);
        if (r2.ok) {
          setApiUrl(resolvedApiUrl);
          setWsUrl(resolvedWsUrl);
          setApiPort(port);
        } else {
          // last ditch: dev port 8005
          const fallback = `${httpProtocol}://${host}:${NSFLOW_DEV_PORT}`;
          const fallbackWs = `${wsProtocol}://${host}:${NSFLOW_DEV_PORT}`;
          setApiUrl(fallback);
          setWsUrl(fallbackWs);
          setApiPort(NSFLOW_DEV_PORT);
        }
      } catch {
        const fallback = `${httpProtocol}://${host}:${NSFLOW_DEV_PORT}`;
        const fallbackWs = `${wsProtocol}://${host}:${NSFLOW_DEV_PORT}`;
        setApiUrl(fallback);
        setWsUrl(fallbackWs);
        setApiPort(NSFLOW_DEV_PORT);
      } finally {
        setIsReady(true);
      }
    })();
  }, []);

  return (
    <ApiPortContext.Provider value={{ apiPort, setApiPort, apiUrl, setApiUrl, wsUrl, setWsUrl, isReady }}>
      {children}
    </ApiPortContext.Provider>
  );
};

export const useApiPort = () => {
  const context = useContext(ApiPortContext);
  if (!context) {
    throw new Error("useApiPort must be used within an ApiPortProvider");
  }
  return context;
};
