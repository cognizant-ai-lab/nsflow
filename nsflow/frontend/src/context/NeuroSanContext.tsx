
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
