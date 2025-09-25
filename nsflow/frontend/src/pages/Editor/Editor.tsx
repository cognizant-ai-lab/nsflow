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
import EditorAgentFlow from "../../components/EditorAgentFlow";
import EditorSidebar from "../../components/EditorSidebar";
import TabbedChatPanel from "../../components/TabbedChatPanel";
import EditorLogsPanel from "../../components/EditorLogsPanel";
import Header from "../../components/Header";
import { ApiPortProvider } from "../../context/ApiPortContext";
import { NeuroSanProvider } from "../../context/NeuroSanContext";
import { ChatProvider } from "../../context/ChatContext";
import { getInitialTheme } from "../../utils/theme";

const Editor: React.FC = () => {
  const [selectedNetwork, setSelectedNetwork] = useState<string>("");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", getInitialTheme());
  }, []);

  return (
    <ChatProvider>
      <ReactFlowProvider>
        <ApiPortProvider>
          <NeuroSanProvider>
            <div className="h-screen w-screen bg-gray-900 flex flex-col">
              <div className="h-14">
                <Header selectedNetwork={selectedNetwork} isEditorPage={true} />
              </div>

              <PanelGroup direction="horizontal">
                <Panel defaultSize={15} minSize={10} maxSize={25}>
                  {/* Editor Sidebar */}
                  <EditorSidebar onSelectNetwork={setSelectedNetwork} />
                </Panel>
                <PanelResizeHandle className="w-1 bg-gray-700 cursor-ew-resize" />
                
                <Panel defaultSize={55} minSize={40}>
                  {/* Editable AgentFlow */}
                  <EditorAgentFlow selectedNetwork={selectedNetwork} />
                </Panel>
                
                <PanelResizeHandle className="w-1 bg-gray-700 cursor-ew-resize" />
                
                <Panel defaultSize={30} minSize={15} maxSize={40}>
                  {/* TabbedChatPanel with Chat and SlyData */}
                  <TabbedChatPanel isEditorMode={true} />
                </Panel>
              </PanelGroup>

              {/* Expandable Logs Panel in bottom left */}
              <EditorLogsPanel />
            </div>
          </NeuroSanProvider>
        </ApiPortProvider>
      </ReactFlowProvider>
    </ChatProvider>
  );
};

export default Editor;
