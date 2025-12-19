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

import React, { useState, useEffect, useRef } from "react";
import { ReactFlowProvider } from "reactflow";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import AgentFlow from "../../components/AgentFlow";
import Sidebar from "../../components/Sidebar";
// import ChatPanel from "./components/ChatPanel";
import TabbedChatPanel from "../../components/TabbedChatPanel";
import LogsPanel from "../../components/LogsPanel";
import InfoPanel from "../../components/InfoPanel";
import Header from "../../components/Header";
import ZenModeOverlay from "../../components/ZenModeOverlay";
import { ApiPortProvider } from "../../context/ApiPortContext";
import { NeuroSanProvider } from "../../context/NeuroSanContext";
import { ChatProvider, useChatContext } from "../../context/ChatContext";
import { useZenMode } from "../../hooks/useZenMode";
import { getInitialTheme } from "../../utils/theme";

// Inner component that has access to ChatContext
const HomeContent: React.FC = () => {
  const [selectedNetwork, setSelectedNetwork] = useState<string>("");
  const { setActiveNetwork } = useChatContext();
  const { isZenMode } = useZenMode();
  const [agentFlowKey, setAgentFlowKey] = useState(0);
  const prevZenModeRef = useRef(isZenMode);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", getInitialTheme());
  }, []);

  // Handle URL parameters to set the active network
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const networkParam = urlParams.get('network');
    if (networkParam) {
      setSelectedNetwork(networkParam);
      setActiveNetwork(networkParam);
    }
  }, [setActiveNetwork]);

  // Force AgentFlow to re-render when exiting Zen Mode to load cached positions
  useEffect(() => {
    if (prevZenModeRef.current === true && isZenMode === false) {
      setAgentFlowKey(prev => prev + 1);
    }
    prevZenModeRef.current = isZenMode;
  }, [isZenMode]);

  return (
    <ReactFlowProvider>
      <ApiPortProvider>
        <NeuroSanProvider>
          {/* NeuroSanProvider is used to manage the host and port for the NeuroSan server */}
          <div className="h-screen w-screen bg-gray-900 flex flex-col">
            <div className="h-14">
              <Header selectedNetwork={selectedNetwork} isEditorPage={false}/>
            </div>

            <PanelGroup direction="horizontal">
              <Panel defaultSize={12} minSize={10} maxSize={25}>
                {/* Sidebar */}
                <Sidebar onSelectNetwork={setSelectedNetwork} />
              </Panel>
              <PanelResizeHandle className="w-1 bg-gray-700 cursor-ew-resize" />
              <Panel defaultSize={55} minSize={40}>
                <PanelGroup direction="vertical">
                  <Panel defaultSize={66} minSize={50} maxSize={85}>
                    {/* AgentFlow */}
                    <AgentFlow key={agentFlowKey} selectedNetwork={selectedNetwork} />
                  </Panel>
                  <PanelResizeHandle className="h-1 bg-gray-700 cursor-ns-resize" />

                  <Panel defaultSize={34} minSize={20} maxSize={40}>
                    <PanelGroup direction="horizontal">
                      <Panel defaultSize={70} minSize={30} maxSize={70}>
                        {/* LogsPanel */}
                        <LogsPanel />
                      </Panel>
                      <PanelResizeHandle className="w-1 bg-gray-700 cursor-ew-resize" />
                      <Panel defaultSize={30} minSize={15} maxSize={30}>
                        {/* InfoPanel */}
                        <InfoPanel />
                      </Panel>
                    </PanelGroup>
                  </Panel>
                </PanelGroup>
              </Panel>
              <PanelResizeHandle className="w-1 bg-gray-700 cursor-ew-resize" />
              <Panel defaultSize={33} minSize={15} maxSize={40}>
                {/* Pass selectedNetwork to ChatPanel */}
                {/* TabbedChatPanel */}
                <TabbedChatPanel />
              </Panel>
            </PanelGroup>

            {/* Zen Mode Overlay - renders on top when activated */}
            <ZenModeOverlay />
          </div>
        </NeuroSanProvider>
      </ApiPortProvider>
    </ReactFlowProvider>
  );
};

const Home: React.FC = () => {
  return (
    <ChatProvider>
      <HomeContent />
    </ChatProvider>
  );
};

export default Home;