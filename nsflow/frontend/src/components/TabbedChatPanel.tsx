import { useState, useRef, useEffect } from "react";
import ChatPanel from "./ChatPanel";
import InternalChatPanel from "./InternalChatPanel";
import ConfigPanel from "./ConfigPanel";
import { useApiPort } from "../context/ApiPortContext";
import { useChatContext } from "../context/ChatContext";
import { FaRegStopCircle } from "react-icons/fa";
import { useChatControls } from "../hooks/useChatControls";

// Global WebSocket storage to persist connections
// const activeSockets: Record<string, WebSocket> = {};

const TabbedChatPanel = () => {
  const [activeTab, setActiveTab] = useState<"chat" | "internal" | "config">("chat");
  const { apiPort } = useApiPort();
  const { 
    activeNetwork,
    addChatMessage,
    addInternalChatMessage,
    setChatWs,
    setInternalChatWs,
    chatWs,
    internalChatWs,
   } = useChatContext();
  const { stopWebSocket, clearChat } = useChatControls();
  const lastActiveNetworkRef = useRef<string | null>(null);
  const lastMessageRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeNetwork) return;

    // Close old WebSockets before creating new ones
    if (chatWs) {
      console.log("Closing previous Chat WebSocket...");
      chatWs.close();
    }
    if (internalChatWs) {
      console.log("Closing previous Internal Chat WebSocket...");
      internalChatWs.close();
    }

    // Send system message for network switch only once
    if (lastActiveNetworkRef.current !== activeNetwork) {
      addChatMessage({
        sender: "system",
        text: `Connected to Agent: **${activeNetwork}**`,
        network: activeNetwork,
      });
      lastActiveNetworkRef.current = activeNetwork;
    }

    // Setup WebSocket for Chat Panel
    const chatWsUrl = `ws://localhost:${apiPort}/api/v1/ws/chat/${activeNetwork}`;
    console.log("Connecting Chat WebSocket:", chatWsUrl);
    const newChatWs = new WebSocket(chatWsUrl);

    newChatWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.message && typeof data.message === "object" && data.message.type === "AI") {
          addChatMessage({ sender: "agent", text: data.message.text, network: activeNetwork });
        }
      } catch (err) {
        console.error("Error parsing Chat WebSocket message:", err);
      }
    };

    newChatWs.onopen = () => console.log(">> Chat WebSocket Connected");
    newChatWs.onclose = () => console.log(">> Chat WebSocket Disconnected");
    setChatWs(newChatWs);

    // Setup WebSocket for Internal Chat Panel
    const internalWsUrl = `ws://localhost:${apiPort}/api/v1/ws/internalchat/${activeNetwork}`;
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
          addInternalChatMessage({ sender: otrace.join(" : "), text: chatText, network: activeNetwork });
        }
      } catch (err) {
        console.error("Error parsing Internal Chat WebSocket message:", err);
      }
    };

    newInternalWs.onopen = () => console.log(">> Internal Chat WebSocket Connected");
    newInternalWs.onclose = () => console.log(">> Internal Chat WebSocket Disconnected");
    setInternalChatWs(newInternalWs);

    return () => {
      console.log("WebSockets for old network are closed.");
    };
  }, [activeNetwork, apiPort]);

  const handleClearChat = () => {
    stopWebSocket();  // Close current WebSocket connections
    clearChat();      // Reset chat history
  };

  return (
    <div className="tabbed-chat-panel flex flex-col h-full p-4">
      {/* Tabs */}
      <div className="tabs flex border-b border-gray-700 h-10">
        {["chat", "internal", "config"].map((tab) => (
          <button
            key={tab}
            title={tab === "chat" ? "Chat" : tab === "internal" ? "Internal Chat" : "Configuration"}
            onClick={() => setActiveTab(tab as "chat" | "internal" | "config")}
            className={`p-2 px-4 transition-all duration-200 ${
                activeTab === tab
                  ? "bg-gray-800 text-white font-bold border-t-2 border-l-2 border-r-2 border-gray-700 rounded-t-lg"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
          >
            {tab === "chat" ? "Chat" : tab === "internal" ? "Internal Chat" : "Config"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-grow">
        {activeTab === "chat" && <ChatPanel />}
        {/* Stop Chat Button (Bottom Right) */}
        {(activeTab === "chat" || activeTab === "internal") && (
          <div className="fixed right-9 bottom-56 z-10">
            <button
              onClick={handleClearChat}
              className="bg-white-700 hover:bg-orange-500 text-white p-1 rounded-md"
              title="Stop Chat"
            >
              <FaRegStopCircle size={14} />
            </button>
          </div>
        )}
        {activeTab === "internal" && <InternalChatPanel />}
        {activeTab === "config" && <ConfigPanel selectedNetwork={activeNetwork} />}
      </div>
    </div>
  );
};

export default TabbedChatPanel;
