import React, { useState } from "react";
import { ReactFlowProvider } from "reactflow";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import AgentFlow from "./components/AgentFlow";
import Sidebar from "./components/Sidebar";
// import ChatPanel from "./components/ChatPanel";
import TabbedChatPanel from "./components/TabbedChatPanel";
import LogsPanel from "./components/LogsPanel";
import ConfigsPanel from "./components/ConfigsPanel";
import Header from "./components/Header";
import { ApiPortProvider } from "./context/ApiPortContext"; // Import the provider
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

                  <Panel defaultSize={25} minSize={15} maxSize={30}>
                    <PanelGroup direction="horizontal">
                      <Panel defaultSize={50} minSize={30} maxSize={70}>
                        <LogsPanel />
                      </Panel>
                      <PanelResizeHandle className="w-1 bg-gray-700 cursor-ew-resize" />
                      <Panel defaultSize={50} minSize={30} maxSize={70}>
                        <ConfigsPanel />
                      </Panel>
                    </PanelGroup>
                  </Panel>
                </PanelGroup>
              </Panel>
              <PanelResizeHandle className="w-1 bg-gray-700 cursor-ew-resize" />
              <Panel defaultSize={25} minSize={15} maxSize={40}>
                {/* Pass selectedNetwork to ChatPanel */}
                <TabbedChatPanel selectedNetwork={selectedNetwork} />
              </Panel>
            </PanelGroup>
          </div>
        </ApiPortProvider>
      </ReactFlowProvider>
    </ChatProvider>
  );
};

export default App;
