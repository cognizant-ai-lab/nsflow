
/*
Copyright 2025 Cognizant Technology Solutions Corp, www.cognizant.com.

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
    const config = getAppConfig();
    const host = config.NSFLOW_HOST || "localhost";
    const port = parseInt(config.NSFLOW_PORT || "8005", 10);
    const httpProtocol = config.VITE_API_PROTOCOL || "http";
    const wsProtocol = config.VITE_WS_PROTOCOL || "ws";

    const resolvedApiUrl = `${httpProtocol}://${host}:${port}`;
    const resolvedWsUrl = `${wsProtocol}://${host}:${port}`;

    // Try hitting the default backend port
    fetch(`${resolvedApiUrl}/api/v1/ping`)
      .then((res) => {
        if (res.ok) {
          console.log("FastAPI backend is running on:", resolvedApiUrl);
          setApiPort(port);
          setApiUrl(resolvedApiUrl);
          setWsUrl(resolvedWsUrl);
        } else {
          throw new Error(`Backend ping failed`);
        }
      })
      .catch((err) => {
        console.warn("[!] Backend not reachable, switching to NSFLOW_DEV_PORT:", err);
        const fallbackUrl = `${httpProtocol}://${host}:${NSFLOW_DEV_PORT}`;
        const fallbackWs = `${wsProtocol}://${host}:${NSFLOW_DEV_PORT}`;
        setApiPort(NSFLOW_DEV_PORT);
        setApiUrl(fallbackUrl);
        setWsUrl(fallbackWs);
      })
      .finally(() => setIsReady(true));;
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
