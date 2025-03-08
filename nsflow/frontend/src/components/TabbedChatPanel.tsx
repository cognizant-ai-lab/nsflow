import { useState } from "react";
import ChatPanel from "./ChatPanel";
import InternalChatPanel from "./InternalChatPanel";
import ConfigPanel from "./ConfigPanel";

const TabbedChatPanel = ({ selectedNetwork }: { selectedNetwork: string }) => {
  const [activeTab, setActiveTab] = useState<"chat" | "internal" | "config">("chat");

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
        {activeTab === "chat" && <ChatPanel selectedNetwork={selectedNetwork} />}
        {activeTab === "internal" && <InternalChatPanel selectedNetwork={selectedNetwork} />}
        {activeTab === "config" && <ConfigPanel />}
      </div>
    </div>
  );
};

export default TabbedChatPanel;
