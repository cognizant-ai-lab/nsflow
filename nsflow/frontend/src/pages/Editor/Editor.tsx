/*
Copyright 2025 Cognizant Technology Solutions Corp, www.cognizant.com.

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

import * as React from "react";
import { useState, useEffect } from "react";
import { ReactFlowProvider } from "reactflow";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import EditorAgentFlow from "../../components/EditorAgentFlow";
import EditorSidebar from "../../components/EditorSidebar";
import TabbedChatPanel from "../../components/TabbedChatPanel";
import EditorLogsPanel from "../../components/EditorLogsPanel";
import Header from "../../components/Header";
import { ApiPortProvider } from "../../context/ApiPortContext";
import { NeuroSanProvider } from "../../context/NeuroSanContext";
import { ChatProvider, useChatContext } from "../../context/ChatContext";
import { getInitialTheme } from "../../utils/theme";

const EditorContent: React.FC = () => {
  const [selectedNetwork, setSelectedNetwork] = useState<string>("");
  const [selectedDesignId, setSelectedDesignId] = useState<string>("");
  const { setIsEditorMode } = useChatContext();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", getInitialTheme());
    // Set editor mode when component mounts
    setIsEditorMode(true);
    
    // Clean up on unmount (set back to false)
    return () => setIsEditorMode(false);
  }, [setIsEditorMode]);

  // Callback to refresh sidebar when new networks are created
  const handleNetworkCreated = () => {
    // Note: Current sidebar doesn't support refresh trigger
    // This is a placeholder for future enhancement
    console.log('Network created - sidebar refresh not implemented');
  };

  // Callback to select a network in sidebar
  const handleNetworkSelected = (networkName: string, designId?: string) => {
    console.log('Editor: Network selected:', { networkName, designId });
    setSelectedNetwork(networkName);
    setSelectedDesignId(designId || "");
  };

  return (
    <ReactFlowProvider>
      <ApiPortProvider>
        <NeuroSanProvider>
          <div className="h-screen w-screen bg-gray-900 flex flex-col">
            <Header selectedNetwork={selectedNetwork} isEditorPage={true} />

              <PanelGroup direction="horizontal">
                <Panel defaultSize={12} minSize={10} maxSize={25}>
                  {/* Editor Sidebar */}
                  <EditorSidebar onSelectNetwork={handleNetworkSelected} />
                </Panel>
                <PanelResizeHandle className="w-1 bg-gray-700 cursor-ew-resize" />
                
                <Panel defaultSize={55} minSize={40}>
                  {/* Editable AgentFlow */}
                  <EditorAgentFlow 
                    selectedNetwork={selectedNetwork}
                    selectedDesignId={selectedDesignId}
                    onNetworkCreated={handleNetworkCreated}
                    onNetworkSelected={handleNetworkSelected}
                  />
                </Panel>
                
                <PanelResizeHandle className="w-1 bg-gray-700 cursor-ew-resize" />
                
                <Panel defaultSize={33} minSize={15} maxSize={40}>
                  {/* TabbedChatPanel with Chat and SlyData */}
                  <TabbedChatPanel isEditorMode={true} />
                </Panel>
              </PanelGroup>

            {/* Expandable Logs Panel in bottom center-left */}
            <EditorLogsPanel />
          </div>
        </NeuroSanProvider>
      </ApiPortProvider>
    </ReactFlowProvider>
  );
};

const Editor: React.FC = () => {
  return (
    <ChatProvider>
      <EditorContent />
    </ChatProvider>
  );
};

export default Editor;
