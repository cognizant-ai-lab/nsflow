
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
  host: string;
  port: number;
  setHost: (h: string) => void;
  setPort: (p: number) => void;
  isNsReady: boolean;
};

const NeuroSanContext = createContext<NeuroSanContextType | undefined>(undefined);

export const NeuroSanProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState(30015);
  const [isNsReady, setIsNsReady] = useState(false);
  const { apiPort } = useApiPort();

  // Fetch config from backend on initial mount
  useEffect(() => {
    fetch(`http://localhost:${apiPort}/api/v1/get_ns_config`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch config");
        return res.json();
      })
      .then((data) => {
        if (data?.config?.ns_server_host) {
          setHost(data.config.ns_server_host);
        }
        if (data?.config?.ns_server_port) {
          setPort(data.config.ns_server_port);
        }
        setIsNsReady(true); // indicate config is loaded
        console.log(">>>> NeuroSan config loaded:", data.config);
      })
      .catch((err) => {
        console.warn("[!] Failed to load NeuroSan config, using fallback values:", err);
        setIsNsReady(true); // indicate config is loaded to avoid blocking UI
        // Optional: set fallback here if needed
      });
  }, [apiPort]);

  return (
    <NeuroSanContext.Provider value={{ host, port, setHost, setPort, isNsReady }}>
      {children}
    </NeuroSanContext.Provider>
  );
};

export const useNeuroSan = () => {
  const context = useContext(NeuroSanContext);
  if (!context) {
    throw new Error("useNeuroSan must be used within a NeuroSanProvider");
  }
  return context;
};
