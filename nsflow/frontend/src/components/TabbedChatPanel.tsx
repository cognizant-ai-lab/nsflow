import { useState, useRef, useEffect } from "react";
import ChatPanel from "./ChatPanel";
import InternalChatPanel from "./InternalChatPanel";
import ConfigPanel from "./ConfigPanel";
import { useApiPort } from "../context/ApiPortContext";
import { useChatContext } from "../context/ChatContext";

// Global WebSocket storage to persist connections
const activeSockets: Record<string, WebSocket> = {};

const TabbedChatPanel = () => {
  const [activeTab, setActiveTab] = useState<"chat" | "internal" | "config">("chat");
  const { apiPort } = useApiPort();
  const { 
    activeNetwork,
    addChatMessage,
    addInternalChatMessage,
    setChatWs,
    setInternalChatWs,
   } = useChatContext();
  const lastMessageRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeNetwork) return;

    // 🔹 Setup WebSocket for Chat Panel
    const chatSocketKey = `chat-${apiPort}-${activeNetwork}`;
    if (!activeSockets[chatSocketKey] || activeSockets[chatSocketKey].readyState !== WebSocket.OPEN) {
      const chatWs = new WebSocket(`ws://localhost:${apiPort}/api/v1/ws/chat/${activeNetwork}`);
      activeSockets[chatSocketKey] = chatWs;
      setChatWs(chatWs)
      console.log("Connecting Chat WebSocket:", chatSocketKey);

      chatWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.message && typeof data.message === "object" && data.message.type === "AI") {
            addChatMessage({ sender: "agent", text: data.message.text, network: activeNetwork });
          }
        } catch (err) {
          console.error("Error parsing Chat WebSocket message:", err);
        }
      };

      chatWs.onopen = () => console.log(">> Chat WebSocket Connected");
      chatWs.onclose = () => console.log(">> Chat WebSocket Disconnected");
    }

    // 🔹 Setup WebSocket for Internal Chat Panel
    const internalSocketKey = `internal-${apiPort}-${activeNetwork}`;
    if (!activeSockets[internalSocketKey] || activeSockets[internalSocketKey].readyState !== WebSocket.OPEN) {
      const internalWs = new WebSocket(`ws://localhost:${apiPort}/api/v1/ws/internalchat/${activeNetwork}`);
      activeSockets[internalSocketKey] = internalWs;
      setInternalChatWs(internalWs);

      internalWs.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
    
            if (data.message && typeof data.message === "object") {
              const otrace = data.message.otrace;
              const chatText = data.message.text?.trim();
              // Ignore messages where otrace or text is null
              if (!chatText || !otrace.length) return;
              // Prevent duplicate messages (compare with lastMessageRef)
              if (lastMessageRef.current === chatText) {
                console.log("Duplicate message ignored");
                return;
              }
              // Update lastMessageRef to track last received message
              lastMessageRef.current = chatText;
              // Ensure the message updates UI
              addInternalChatMessage({ sender: otrace.join(" : "), text: chatText, network: activeNetwork });
              
            }
          } catch (err) {
            console.error("Error parsing Internal Chat WebSocket message:", err);
          }
      };

      internalWs.onopen = () => console.log(">> Internal Chat WebSocket Connected");
      internalWs.onclose = () => console.log(">> Internal Chat WebSocket Disconnected");
    }

    return () => {
      console.log("WebSockets remain active across all tabs.");
    };
  }, [activeNetwork, apiPort]);

  return (
    <div className="tabbed-chat-panel flex flex-col h-full p-4">
      {/* Tabs */}
      <div className="tabs flex border-b border-gray-700">
        {["chat", "internal", "config"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as "chat" | "internal" | "config")}
            className={`p-2 px-4 ${
              activeTab === tab ? "bg-gray-800 text-white font-bold" : "bg-gray-700 text-gray-300"
            }`}
          >
            {tab === "chat" ? "Chat" : tab === "internal" ? "Internal Chat" : "Config"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-grow">
        {activeTab === "chat" && <ChatPanel />}
        {activeTab === "internal" && <InternalChatPanel />}
        {activeTab === "config" && <ConfigPanel />}
      </div>
    </div>
  );
};

export default TabbedChatPanel;
