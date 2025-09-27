
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
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import AgentFlow from "../../components/AgentFlow";
import Sidebar from "../../components/Sidebar";
// import ChatPanel from "./components/ChatPanel";
import TabbedChatPanel from "../../components/TabbedChatPanel";
import LogsPanel from "../../components/LogsPanel";
import InfoPanel from "../../components/InfoPanel";
import Header from "../../components/Header";
import { ApiPortProvider } from "../../context/ApiPortContext";
import { NeuroSanProvider } from "../../context/NeuroSanContext";
import { ChatProvider } from "../../context/ChatContext";
import { getInitialTheme } from "../../utils/theme";

const Home: React.FC = () => {
  const [selectedNetwork, setSelectedNetwork] = useState<string>("");

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

              <PanelGroup direction="horizontal">
                <Panel defaultSize={12} minSize={10} maxSize={25}>
                  {/* Sidebar */}
                  <Sidebar onSelectNetwork={setSelectedNetwork} />
                </Panel>
                <PanelResizeHandle className="w-1 bg-gray-700 cursor-ew-resize" />
                <Panel defaultSize={56} minSize={40}>
                  <PanelGroup direction="vertical">
                    <Panel defaultSize={60} minSize={50} maxSize={85}>
                      {/* AgentFlow */}
                      <AgentFlow selectedNetwork={selectedNetwork} />
                    </Panel>
                    <PanelResizeHandle className="h-1 bg-gray-700 cursor-ns-resize" />

                    <Panel defaultSize={30} minSize={20} maxSize={40}>
                      <PanelGroup direction="horizontal">
                        <Panel defaultSize={50} minSize={30} maxSize={70}>
                          {/* LogsPanel */}
                          <LogsPanel />
                        </Panel>
                        <PanelResizeHandle className="w-1 bg-gray-700 cursor-ew-resize" />
                        <Panel defaultSize={20} minSize={15} maxSize={30}>
                          {/* InfoPanel */}
                          <InfoPanel />
                        </Panel>
                      </PanelGroup>
                    </Panel>
                  </PanelGroup>
                </Panel>
                <PanelResizeHandle className="w-1 bg-gray-700 cursor-ew-resize" />
                <Panel defaultSize={32} minSize={15} maxSize={40}>
                  {/* Pass selectedNetwork to ChatPanel */}
                  {/* TabbedChatPanel */}
                  <TabbedChatPanel />
                </Panel>
              </PanelGroup>
            </div>
          </NeuroSanProvider>
        </ApiPortProvider>
      </ReactFlowProvider>
    </ChatProvider>
  );
};

export default Home;
