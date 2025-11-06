
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

import React, { createContext, useContext, useEffect, useState } from "react";
import { useApiPort } from "./ApiPortContext";

type NeuroSanContextType = {
  host: string | undefined;
  port: number | undefined;
  connectionType: string | undefined;
  configId: string | undefined;
  setHost: (h: string) => void;
  setPort: (p: number) => void;
  setConnectionType: (c: string) => void;
  isNsReady: boolean;
};

const NeuroSanContext = createContext<NeuroSanContextType | undefined>(undefined);

export const NeuroSanProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [host, setHost] = useState<string | undefined>();
  const [port, setPort] = useState<number | undefined>();
  const [connectionType, setConnectionType] = useState<string | undefined>();
  const [configId, setConfigId] = useState<string | undefined>();
  const [isNsReady, setIsNsReady] = useState(false);

  const { apiUrl } = useApiPort();

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/v1/get_ns_config`);
        if (!response.ok) throw new Error("Failed to fetch config");

        const data = await response.json();
        const cfg = data?.config;

        if (cfg?.ns_server_host) setHost(cfg.ns_server_host);
        if (cfg?.ns_server_port) setPort(cfg.ns_server_port);
        if (cfg?.ns_connectivity_type) setConnectionType(cfg.ns_connectivity_type);
        if (data?.config_id) setConfigId(data.config_id);

        console.log(">>>> NeuroSan config loaded:", data);
      } catch (err) {
        console.warn("[!] Failed to load NeuroSan config, using fallback values:", err);

      } finally {
        setIsNsReady(true); // signal readiness regardless of success/failure
      }
    };

    fetchConfig();
  }, [apiUrl]);

  return (
    <NeuroSanContext.Provider
      value={{
        host,
        port,
        connectionType,
        configId,
        setHost,
        setPort,
        setConnectionType,
        isNsReady,
      }}
    >
      {children}
    </NeuroSanContext.Provider>
  );
};

export const useNeuroSan = (): NeuroSanContextType => {
  const context = useContext(NeuroSanContext);
  if (!context) {
    throw new Error("useNeuroSan must be used within a NeuroSanProvider");
  }
  return context;
};
