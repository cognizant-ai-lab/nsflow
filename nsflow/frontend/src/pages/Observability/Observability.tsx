
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
