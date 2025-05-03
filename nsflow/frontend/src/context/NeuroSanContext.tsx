
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
import React, { createContext, useContext, useState } from "react";

type NeuroSanContextType = {
  host: string;
  port: number;
  setHost: (h: string) => void;
  setPort: (p: number) => void;
};

const NeuroSanContext = createContext<NeuroSanContextType | undefined>(undefined);

export const NeuroSanProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState(30015); // default server port

  return (
    <NeuroSanContext.Provider value={{ host, port, setHost, setPort }}>
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
