
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

import React, { useState, useEffect } from "react";
import { ReactFlowProvider } from "reactflow";
import Header from "../../components/Header";
import { ApiPortProvider } from "../../context/ApiPortContext";
import { NeuroSanProvider } from "../../context/NeuroSanContext";
import { ChatProvider } from "../../context/ChatContext";
import { getInitialTheme } from "../../utils/theme";


const Observability: React.FC = () => {
    const [selectedNetwork] = useState<string>("");
  
    useEffect(() => {
      document.documentElement.setAttribute("data-theme", getInitialTheme());
    }, []);
  
    return (
      <ChatProvider>
        <ReactFlowProvider>
          <ApiPortProvider>
            <NeuroSanProvider>
              {/* NeuroSanProvider is used to manage the host and port for the NeuroSan server */}
              <div className="h-screen w-screen bg-gray-900 flex flex-col">
                <div className="h-14">
                  <Header selectedNetwork={selectedNetwork}/>
                </div>
                
                <div className="h-14">
                  Coming soon
                </div>
              </div>
            </NeuroSanProvider>
          </ApiPortProvider>
        </ReactFlowProvider>
      </ChatProvider>
    );
  };

export default Observability;
