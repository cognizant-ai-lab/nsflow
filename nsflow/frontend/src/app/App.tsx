
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
import React from "react";
import { BrowserRouter } from "react-router-dom";
import AppRoutes from "./routes";
import { ApiPortProvider } from "../context/ApiPortContext";
import { NeuroSanProvider } from "../context/NeuroSanContext";
import { ChatProvider } from "../context/ChatContext";

const App: React.FC = () => {
  return (
    <ChatProvider>
      <ApiPortProvider>
        <NeuroSanProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </NeuroSanProvider>
      </ApiPortProvider>
    </ChatProvider>
  );
};

export default App;
