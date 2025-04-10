
# Copyright (C) 2019-2021 Cognizant Digital Business, Evolutionary AI.
# All Rights Reserved.
# Issued under the Academic Public License.
#
# You can be released from the terms, and requirements of the Academic Public
# License by purchasing a commercial license.
# Purchase of a commercial license is mandatory for any use of the
# ENN-release SDK Software in commercial settings.
#
# END COPYRIGHT
import React, { useState } from "react";
import { ReactFlowProvider } from "reactflow";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import AgentFlow from "./components/AgentFlow";
import Sidebar from "./components/Sidebar";
// import ChatPanel from "./components/ChatPanel";
import TabbedChatPanel from "./components/TabbedChatPanel";
import LogsPanel from "./components/LogsPanel";
import InfoPanel from "./components/InfoPanel";
import Header from "./components/Header";
import { ApiPortProvider } from "./context/ApiPortContext";
import { ChatProvider } from "./context/ChatContext";

const App: React.FC = () => {
  const [selectedNetwork, setSelectedNetwork] = useState<string>("");

  return (
    <ChatProvider>
      <ReactFlowProvider>
        <ApiPortProvider>
          <div className="h-screen w-screen bg-gray-900 flex flex-col">
            <div className="h-14">
              <Header selectedNetwork={selectedNetwork}/>
            </div>

            <PanelGroup direction="horizontal">
              <Panel defaultSize={10} minSize={5} maxSize={30}>
                <Sidebar onSelectNetwork={setSelectedNetwork} />
              </Panel>
              <PanelResizeHandle className="w-1 bg-gray-700 cursor-ew-resize" />
              <Panel defaultSize={60} minSize={40}>
                <PanelGroup direction="vertical">
                  <Panel defaultSize={75} minSize={50} maxSize={85}>
                    <AgentFlow selectedNetwork={selectedNetwork} />
                  </Panel>
                  <PanelResizeHandle className="h-1 bg-gray-700 cursor-ns-resize" />

                  <Panel defaultSize={30} minSize={20} maxSize={40}>
                    <PanelGroup direction="horizontal">
                      <Panel defaultSize={50} minSize={30} maxSize={70}>
                        <LogsPanel />
                      </Panel>
                      <PanelResizeHandle className="w-1 bg-gray-700 cursor-ew-resize" />
                      <Panel defaultSize={20} minSize={15} maxSize={30}>
                        <InfoPanel />
                      </Panel>
                    </PanelGroup>
                  </Panel>
                </PanelGroup>
              </Panel>
              <PanelResizeHandle className="w-1 bg-gray-700 cursor-ew-resize" />
              <Panel defaultSize={25} minSize={15} maxSize={40}>
                {/* Pass selectedNetwork to ChatPanel */}
                <TabbedChatPanel />
              </Panel>
            </PanelGroup>
          </div>
        </ApiPortProvider>
      </ReactFlowProvider>
    </ChatProvider>
  );
};

export default App;
