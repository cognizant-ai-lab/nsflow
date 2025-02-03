import React, { useState } from "react";
import { ReactFlowProvider } from "reactflow";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import AgentFlow from "./components/AgentFlow";
import Sidebar from "./components/Sidebar";
import ChatPanel from "./components/ChatPanel";
import LogsPanel from "./components/LogsPanel";
import Header from "./components/Header";

const App: React.FC = () => {
  const [selectedNetwork, setSelectedNetwork] = useState<string>("");

  return (
    <ReactFlowProvider>
      <div className="h-screen w-screen bg-gray-900 flex flex-col">
        <div className="h-14">
          <Header selectedNetwork={selectedNetwork}/>
        </div>

        <PanelGroup direction="horizontal">
          <Panel defaultSize={20} minSize={15} maxSize={30}>
            <Sidebar onSelectNetwork={setSelectedNetwork} />
          </Panel>
          <PanelResizeHandle className="w-1 bg-gray-700 cursor-ew-resize" />
          <Panel defaultSize={60} minSize={40}>
            <PanelGroup direction="vertical">
              <Panel defaultSize={75} minSize={50}>
                <AgentFlow selectedNetwork={selectedNetwork} />
              </Panel>
              <PanelResizeHandle className="h-1 bg-gray-700 cursor-ns-resize" />
              <Panel defaultSize={25} minSize={15} maxSize={40}>
                <LogsPanel />
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle className="w-1 bg-gray-700 cursor-ew-resize" />
          <Panel defaultSize={20} minSize={15} maxSize={30}>
            {/* ✅ Pass selectedNetwork to ChatPanel */}
            <ChatPanel selectedNetwork={selectedNetwork} />
          </Panel>
        </PanelGroup>
      </div>
    </ReactFlowProvider>
  );
};

export default App;
