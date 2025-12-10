
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

import React from "react";
import { BrowserRouter } from "react-router-dom";
import AppRoutes from "./routes";
import { ApiPortProvider } from "../context/ApiPortContext";
import { NeuroSanProvider } from "../context/NeuroSanContext";
import { ChatProvider } from "../context/ChatContext";
import { ThemeProvider } from "../context/ThemeContext";
import { SnackbarProvider } from "../context/SnackbarContext";

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <SnackbarProvider>
        <ChatProvider>
          <ApiPortProvider>
            <NeuroSanProvider>
              <BrowserRouter>
                <AppRoutes />
              </BrowserRouter>
            </NeuroSanProvider>
          </ApiPortProvider>
        </ChatProvider>
      </SnackbarProvider>
    </ThemeProvider>
  );
};

export default App;
