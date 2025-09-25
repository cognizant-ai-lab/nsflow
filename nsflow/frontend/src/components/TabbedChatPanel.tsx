
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
import { useState, useRef, useEffect } from "react";
import ChatPanel from "./ChatPanel";
import InternalChatPanel from "./InternalChatPanel";
import SlyDataPanel from "./SlyDataPanel";
import EditorSlyDataPanel from "./EditorSlyDataPanel";
import ConfigPanel from "./ConfigPanel";
import { useApiPort } from "../context/ApiPortContext";
import { useChatContext } from "../context/ChatContext";
interface TabbedChatPanelProps {
  isEditorMode?: boolean;
}

const TabbedChatPanel = ({ isEditorMode = false }: TabbedChatPanelProps) => {
  const [activeTab, setActiveTab] = useState<"chat" | "internal" | "slydata" | "config">("chat");
  const { wsUrl } = useApiPort();
  const { 
    activeNetwork,
    addChatMessage,
    addInternalChatMessage,
    addSlyDataMessage,
    setChatWs,
    setInternalChatWs,
    setSlyDataWs,
    chatWs,
    internalChatWs,
    slyDataWs
   } = useChatContext();
  const lastActiveNetworkRef = useRef<string | null>(null);
  const lastMessageRef = useRef<string | null>(null);

  useEffect(() => {
    // In editor mode, default to agent_network_editor
    const targetNetwork = isEditorMode ? "agent_network_editor" : activeNetwork;
    
    if (!targetNetwork) return;

    // Close old WebSockets before creating new ones
    if (chatWs) {
      console.log("Closing previous Chat WebSocket...");
      chatWs.close();
    }
    if (internalChatWs) {
      console.log("Closing previous Internal Chat WebSocket...");
      internalChatWs.close();
    }
    if (slyDataWs) {
      console.log("Closing previous Sly Data WebSocket...");
      slyDataWs.close();
    }

    // Send system message for network switch only once
    if (lastActiveNetworkRef.current !== targetNetwork) {
      addChatMessage({
        sender: "system",
        text: `Connected to Agent: **${targetNetwork}**`,
        network: targetNetwork,
      });
      lastActiveNetworkRef.current = targetNetwork;
    }

    // Setup WebSocket for Chat Panel
    const chatWsUrl = `${wsUrl}/api/v1/ws/chat/${targetNetwork}`;
    console.log("Connecting Chat WebSocket:", chatWsUrl);
    const newChatWs = new WebSocket(chatWsUrl);

    newChatWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.message && typeof data.message === "object" && data.message.type === "AI") {
          addChatMessage({ sender: "agent", text: data.message.text, network: targetNetwork });
        }
      } catch (err) {
        console.error("Error parsing Chat WebSocket message:", err);
      }
    };

    newChatWs.onopen = () => console.log(">> Chat WebSocket Connected");
    newChatWs.onclose = () => console.log(">> Chat WebSocket Disconnected");
    setChatWs(newChatWs);

     // Setup WebSocket for Internal Chat Panel (skip in editor mode)
    if (!isEditorMode) {
      const internalWsUrl = `${wsUrl}/api/v1/ws/internalchat/${targetNetwork}`;
      console.log("Connecting Internal Chat WebSocket:", internalWsUrl);
      const newInternalWs = new WebSocket(internalWsUrl);

      newInternalWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.message && typeof data.message === "object") {
            const otrace = data.message.otrace;
            const chatText = data.message.text?.trim();
            if (!chatText || !otrace.length) return;
            if (lastMessageRef.current === chatText) {
              console.log("Duplicate message ignored");
              return;
            }
            lastMessageRef.current = chatText;
            addInternalChatMessage({ sender: otrace.join(" : "), text: chatText, network: targetNetwork });
          }
        } catch (err) {
          console.error("Error parsing Internal Chat WebSocket message:", err);
        }
      };

      newInternalWs.onopen = () => console.log(">> Internal Chat WebSocket Connected");
      newInternalWs.onclose = () => console.log(">> Internal Chat WebSocket Disconnected");
      setInternalChatWs(newInternalWs);
    }

    // Setup WebSocket for Sly Data Panel
    const slyDataWsUrl = `${wsUrl}/api/v1/ws/slydata/${targetNetwork}`;
    console.log("Connecting Sly Data WebSocket:", slyDataWsUrl);
    const newSlyDataWs = new WebSocket(slyDataWsUrl);

    newSlyDataWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.message && typeof data.message === "object") {
          // const otrace = data.message.otrace;
          const chatTextRaw = data.message.text;
          // Check if it's a non-empty object
          const isEmptyObject =
            typeof chatTextRaw === "object" &&
            chatTextRaw !== null &&
            Object.keys(chatTextRaw).length === 0;

            let slyText = "";
            
            if (typeof chatTextRaw === "string") {
              slyText = chatTextRaw;
            } else if (!isEmptyObject) {
              // Format as markdown code block
              slyText = `\`\`\`json\n${JSON.stringify(chatTextRaw, null, 2).replace(/\\n/g, '\n')}\n\`\`\``;
            }
          if (slyText.trim().length > 0) {
            // lastMessageRef.current = chatText;
            addSlyDataMessage({
              sender: targetNetwork,
              text: slyText,
              network: targetNetwork,
            });
          }
        }
      } catch (err) {
        console.error("Error parsing Sly Data WebSocket message:", err);
      }
    };

    newSlyDataWs.onopen = () => console.log(">>Sly Data WebSocket Connected");
    newSlyDataWs.onclose = () => console.log(">> Sly Data WebSocket Disconnected");
    setSlyDataWs(newSlyDataWs);

    return () => {
      console.log("WebSockets for old network are closed.");
    };
  }, [activeNetwork, wsUrl, isEditorMode]);

  return (
    <div className="tabbed-chat-panel">
      {/* Tabs */}
      <div className="tabbed-tabs">
        {(isEditorMode ? ["chat", "slydata"] : ["chat", "internal", "slydata", "config"]).map((tab) => (
          <button
            key={tab}
            title={tab === "chat" ? "Chat" : tab === "internal" ? "Internal Chat" : tab === "slydata" ? "SlyData" : "Configuration"}
            onClick={() => setActiveTab(tab as "chat" | "internal" | "slydata" | "config")}
            className={`tabbed-tab ${
                activeTab === tab ? "tabbed-tab-active" : "tabbed-tab-inactive"
              }`}
          >
            {tab === "chat" ? "Chat" : tab === "internal" ? "InternalChat" : tab === "slydata" ? "SlyData" : "Config"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="tabbed-content">
        {activeTab === "chat" && <ChatPanel />}
        {activeTab === "internal" && !isEditorMode && <InternalChatPanel />}
        {activeTab === "slydata" && (isEditorMode ? <EditorSlyDataPanel /> : <SlyDataPanel />)}
        {activeTab === "config" && !isEditorMode && <ConfigPanel selectedNetwork={activeNetwork} />}
      </div>
    </div>
  );
};

export default TabbedChatPanel;
