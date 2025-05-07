
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
import React, { createContext, useEffect, useState, useContext } from "react";

const DEFAULT_PORT = 4173;
const NSFLOW_DEV_PORT = 8005;

type ApiPortContextType = {
  apiPort: number;
  setApiPort: (port: number) => void;
  isReady: boolean;
};

const ApiPortContext = createContext<ApiPortContextType | undefined>(undefined);

export const ApiPortProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [apiPort, setApiPort] = useState<number>(DEFAULT_PORT);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Try hitting the default backend port
    fetch(`http://localhost:${DEFAULT_PORT}/api/v1/ping`)
      .then((res) => {
        if (res.ok) {
          console.log("✅ FastAPI backend is running on DEFAULT_PORT:", DEFAULT_PORT);
          setApiPort(DEFAULT_PORT);
        } else {
          throw new Error(`Default port response not OK`);
        }
      })
      .catch((err) => {
        console.warn("[!] Default port failed, switching to NSFLOW_DEV_PORT:", err);
        setApiPort(NSFLOW_DEV_PORT);
      })
      .finally(() => setIsReady(true));;
  }, []);

  return (
    <ApiPortContext.Provider value={{ apiPort, setApiPort, isReady }}>
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
