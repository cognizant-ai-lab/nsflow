
# Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
# All Rights Reserved.
# Issued under the Academic Public License.
#
# You can be released from the terms, and requirements of the Academic Public
# License by purchasing a commercial license.
# Purchase of a commercial license is mandatory for any use of the
# ENN-release SDK Software in commercial settings.
#
# END COPYRIGHT
import React, { createContext, useState, useContext } from "react";

const DEFAULT_PORT = 4173;

type ApiPortContextType = {
  apiPort: number;
  setApiPort: (port: number) => void;
};

const ApiPortContext = createContext<ApiPortContextType | undefined>(undefined);

export const ApiPortProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [apiPort, setApiPort] = useState(DEFAULT_PORT);

  return (
    <ApiPortContext.Provider value={{ apiPort, setApiPort }}>
      {children}
    </ApiPortContext.Provider>
  );
};

// Custom Hook
export const useApiPort = () => {
  const context = useContext(ApiPortContext);
  if (!context) {
    throw new Error("useApiPort must be used within an ApiPortProvider");
  }
  return context;
};
