import React, { useState } from "react";
import { ReactFlowProvider } from "reactflow";
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
} from "react-resizable-panels";
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
        {/* Top Header Bar (Fixed Height) */}
        <div className="h-14">
          <Header />
        </div>

        {/* Main Layout (Horizontal Split) */}
        <PanelGroup direction="horizontal">
          {/* Left Sidebar (Resizable) */}
          <Panel defaultSize={20} minSize={15} maxSize={30}>
            <Sidebar onSelectNetwork={setSelectedNetwork} />
          </Panel>

          {/* Vertical Separator */}
          <PanelResizeHandle className="w-1 bg-gray-700 cursor-ew-resize" />

          {/* Middle Content (AgentFlow & LogsPanel) */}
          <Panel defaultSize={60} minSize={40}>
            <PanelGroup direction="vertical">
              {/* AgentFlow (Resizable with LogsPanel below) */}
              <Panel defaultSize={75} minSize={50}>
                <AgentFlow selectedNetwork={selectedNetwork} />
              </Panel>

              {/* Horizontal Separator */}
              <PanelResizeHandle className="h-1 bg-gray-700 cursor-ns-resize" />

              {/* LogsPanel (Resizable) */}
              <Panel defaultSize={25} minSize={15} maxSize={40}>
                <LogsPanel />
              </Panel>
            </PanelGroup>
          </Panel>

          {/* Vertical Separator */}
          <PanelResizeHandle className="w-1 bg-gray-700 cursor-ew-resize" />

          {/* Chat Panel (Resizable) */}
          <Panel defaultSize={20} minSize={15} maxSize={30}>
            <ChatPanel />
          </Panel>
        </PanelGroup>
      </div>
    </ReactFlowProvider>
  );
};

export default App;
