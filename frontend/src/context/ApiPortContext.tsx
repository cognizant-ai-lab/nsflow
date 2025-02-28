import React, { createContext, useState, useContext } from "react";

const DEFAULT_PORT = 8005;

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
