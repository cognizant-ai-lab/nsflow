
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
import { useState, useEffect, useRef } from "react";
import { PanelGroup, Panel, PanelResizeHandle, ImperativePanelHandle } from "react-resizable-panels";

import { FaDownload, FaRegStopCircle } from "react-icons/fa";
import { ImBin2 } from "react-icons/im";
import { useChatControls } from "../hooks/useChatControls";
import { useChatContext } from "../context/ChatContext";
import ScrollableMessageContainer from "./ScrollableMessageContainer";


const ChatPanel = ({ title = "Chat" }: { title?: string }) => {
  const { activeNetwork, chatMessages, addChatMessage, addSlyDataMessage, chatWs } = useChatContext();
  const { stopWebSocket, clearChat } = useChatControls();
  const [newMessage, setNewMessage] = useState("");
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputPanelRef = useRef<ImperativePanelHandle>(null);
  const messagePanelRef = useRef<ImperativePanelHandle>(null);


  // sly_data enablers
  const [enableSlyData, setEnableSlyData] = useState(false);
  const [newSlyData, setNewSlyData] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-scroll to latest message
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const sendMessage = () => {
    if (!newMessage.trim()) return;
    if (!chatWs || chatWs.readyState !== WebSocket.OPEN) {
      console.error("WebSocket not connected. Unable to send message.");
      return;
    }
    let parsedSlyData: Record<string, any> | undefined;

    if (newSlyData.trim()) {
      try {
        const parsed = JSON.parse(newSlyData);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.keys(parsed).length > 0) {
          parsedSlyData = parsed;
        }
      } catch (err) {
        console.warn("Invalid sly_data JSON. It will not be sent.");
      }
    }

    addChatMessage({ sender: "user", text: newMessage, network: activeNetwork });
    addSlyDataMessage({ sender: "user", text: String(parsedSlyData), network: activeNetwork });
    chatWs.send(JSON.stringify({
      message: newMessage,
      ...(parsedSlyData ? { sly_data: parsedSlyData } : {})
    }));
    setNewMessage("");
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMessage(index);
      setTimeout(() => setCopiedMessage(null), 1000);
    });
  };

  const downloadMessages = () => {
    const logText = chatMessages.map((msg) => `${msg.sender}: ${msg.text}`).join("\n");
    const blob = new Blob([logText], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "chat_logs.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const toggleSlyData = () => {
    const isEnabling = !enableSlyData;
    setEnableSlyData(isEnabling);
  
    if (isEnabling) {
      requestAnimationFrame(() => {
        // Expand the input panel to 40%
        inputPanelRef.current?.resize(40);
        messagePanelRef.current?.resize(60);
      })
    } else {
      // Collapse back to original layout
      inputPanelRef.current?.resize(25);
      messagePanelRef.current?.resize(75);
    }
  };
  

  return (
    <div className="chat-panel h-full w-full">
      <PanelGroup direction="vertical">
        {/* Panel 1: Header + Message List */}
        <Panel ref={messagePanelRef} defaultSize={75} minSize={30}>
          <div className="flex flex-col h-full p-4 overflow-hidden">
            {/* Header */}
            <div className="logs-header flex justify-between items-center mb-2">
              <h2 className="text-lg font-bold">{title}</h2>
              <button
                onClick={downloadMessages}
                className="logs-download-btn hover:text-white p-1"
                title="Download Messages"
              >
                <FaDownload size={18} />
              </button>
            </div>

            {/* Scrollable Message Container */}
            <ScrollableMessageContainer
              messages={chatMessages}
              copiedMessage={copiedMessage}
              onCopy={copyToClipboard}
            />

          </div>
        </Panel>

        {/* Resize Handle */}
        <PanelResizeHandle className="bg-gray-700 h-1 cursor-row-resize" />

        {/* Panel 2: Inputs (chat + sly_data) */}
        <Panel ref={inputPanelRef} defaultSize={25} minSize={15}>
          <div className="p-4 space-y-2 bg-[var(--chat-bg)]">
            {/* Chat controls */}
            <div className="flex justify-end space-x-4 mt-1">
              <button
                onClick={clearChat}
                className="logs-download-btn bg-white-700 hover:bg-orange-400 text-white p-1 rounded-md"
                title="Clear Chat"
              >
                <ImBin2 size={12} />
              </button>
              <button
                onClick={stopWebSocket}
                className="chat-stop-btn bg-white-700 hover:bg-red-500 text-white p-1 rounded-md"
                title="Stop Chat"
              >
                <FaRegStopCircle size={12} />
              </button>
            </div>

            {/* Message input */}
            <div className="chat-input mt-2 flex gap-2 items-end">
              <textarea
                placeholder="Type a message..."
                className="chat-input-box"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <button
                onClick={sendMessage}
                className="chat-send-btn"
              >
                Send
              </button>
            </div>
            <div
              onClick={toggleSlyData}
              className="sly-data-btn flex items-center cursor-pointer text-sm text-white mb-1"
            >
              <span className="mr-1 hover:text-orange-400 transition-colors duration-100">
                {enableSlyData ? "▼" : "▶"} sly_data
              </span>
            </div>

            {/* Sly Data*/}
            <div
              className={`collapsible ${enableSlyData ? "open" : "closed"}`}
            >
              <div className="sly-data-section mt-2 w-full">
                <hr className="my-1 border-t border-gray-600" />
                <div className="flex items-center gap-2 mb-1">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="sly-data-attach-btn"
                  >
                    Attach sly_data
                  </button>
                  <span className="text-xs text-gray-400">Supported: .json, .txt, .hocon</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.txt,.hocon"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        setNewSlyData(ev.target?.result as string);
                      };
                      reader.readAsText(file);
                    }}
                  />
                </div>

                <textarea
                  className="w-full h-32 p-2 bg-gray-800 text-white rounded-md text-sm font-mono"
                  placeholder="Enter or edit sly_data here..."
                  value={newSlyData}
                  onChange={(e) => setNewSlyData(e.target.value)}
                />
              </div>
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
};

export default ChatPanel;
