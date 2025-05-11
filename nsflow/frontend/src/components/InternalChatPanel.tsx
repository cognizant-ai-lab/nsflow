
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
import { useEffect, useRef, useState } from "react";
import { FaDownload } from "react-icons/fa";
import { useChatContext } from "../context/ChatContext";
import { PanelGroup, Panel } from "react-resizable-panels";
import ScrollableMessageContainer from "./ScrollableMessageContainer";

const InternalChatPanel = ({ title = "Internal Chat" }: { title?: string }) => {
  const { internalChatMessages } = useChatContext();
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null); // Auto-scroll reference

  useEffect(() => {
    // Auto-scroll to latest message
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [internalChatMessages]);

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMessage(index);
      setTimeout(() => setCopiedMessage(null), 1000);
    });
  };

  const downloadMessages = () => {
    const logText = internalChatMessages
      .map((msg) => `${msg.sender}: ${msg.text}`)
      .join("\n");

    const blob = new Blob([logText], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "internal_chat_logs.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="chat-panel h-full w-full">
      <PanelGroup direction="vertical">
        {/* Panel 1: Header + Message List */}
        <Panel defaultSize={75} minSize={30}>
          {/* Title with Download Button */}
          <div className="flex flex-col h-full p-4 overflow-hidden">
            {/* Header */}
            <div className="logs-header flex justify-between items-center mb-2">
              <h2 className="text-lg font-bold">{title}</h2>
              <button
                onClick={downloadMessages}
                className="logs-download-btn text-gray-400 hover:text-white p-1"
                title="Download Messages"
              >
                <FaDownload size={18} />
              </button>
            </div>

            {/* Scrollable chat messages container */}
            <ScrollableMessageContainer
              messages={internalChatMessages}
              copiedMessage={copiedMessage}
              onCopy={copyToClipboard}
              renderSenderLabel={(msg) => msg.sender} // Raw label
              getMessageClass={() => "chat-msg chat-msg-agent"} 
            />
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
};

export default InternalChatPanel;