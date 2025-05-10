
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
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";

import { FaDownload, FaRegStopCircle, FaCopy } from "react-icons/fa";
import { ImBin2 } from "react-icons/im";
import { Clipboard } from "lucide-react";
import { useChatControls } from "../hooks/useChatControls";
import { useChatContext } from "../context/ChatContext";


const ChatPanel = ({ title = "Chat" }: { title?: string }) => {
  const { activeNetwork, chatMessages, addChatMessage, chatWs } = useChatContext();
  const { stopWebSocket, clearChat } = useChatControls();
  const [newMessage, setNewMessage] = useState("");
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

    addChatMessage({ sender: "user", text: newMessage, network: activeNetwork });
    chatWs.send(JSON.stringify({ message: newMessage, sly_data: enableSlyData ? newSlyData : undefined }));
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

  return (
    <div className="chat-panel flex flex-col h-full p-4">
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

      {/* Message List */}
      <div className="chat-messages-container">
        {chatMessages.map((msg, index) => (
          <div
            key={index}
            className={`chat-msg ${
              msg.sender === "user"
                ? "chat-msg-user"
                : msg.sender === "agent"
                ? "chat-msg-agent"
                : "chat-msg-system"
            }`}
          >
            {/* Sender header + Copy icon */}
            <div className="font-bold mb-1 flex justify-between items-center">
              <span>
                {msg.sender === "user"
                  ? "User"
                  : msg.sender === "agent"
                  ? msg.network || "Unknown Agent"
                  : "System"}
              </span>
              <button
                onClick={() => copyToClipboard(msg.text, index)}
                className="text-gray-400 hover:text-white ml-2 p-1"
                title="Copy to clipboard"
              >
                <Clipboard size={10} />
              </button>
            </div>

            {/* Markdown with syntax highlighting & custom code block */}
            <div className="chat-markdown">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                // rehypePlugins={[rehypeHighlight]}
                components={{
                  // Headings (H1 - H6)
                  h1: ({ children }) => <h1 className="text-2xl font-bold mt-4 mb-2 text-[var(--chat-message-text-color)]">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-xl font-semibold mt-3 mb-2 text-[var(--chat-message-text-color)]">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-lg font-semibold mt-2 mb-1 text-[var(--chat-message-text-color)]">{children}</h3>,
                  // Lists
                  ul: ({ children }) => <ul className="list-disc ml-6 text-[var(--chat-message-text-color)]">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal ml-6 text-[var(--chat-message-text-color)]">{children}</ol>,
                  li: ({ children }) => <li className="ml-2 text-[var(--chat-message-text-color)]">{children}</li>,
                  // Paragraphs
                  p: ({ children }) => <p className="mb-2 leading-relaxed text-[var(--chat-message-text-color)]">{children}</p>,
                  strong: ({ children }) => <strong className="font-bold text-[var(--chat-message-text-color)]">{children}</strong>,
                  em: ({ children }) => <em className="italic text-gray-300 text-[var(--chat-message-text-color)]">{children}</em>,
                  // Links should open in a new tab
                  a: ({ children, href }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                      {children}
                    </a>
                  ),
                  code: ({ className = "", children, ...props }) => {
                    const isBlock = className?.includes("language-");
                    const codeContent = String(children).trim();
                  
                    if (isBlock) {
                      return (
                        <div className="relative group my-2">
                          <pre
                            className="rounded p-3 overflow-x-auto text-sm"
                            style={{
                              backgroundColor: "var(--code-block-bg)",
                              color: "var(--code-block-text)"
                            }}
                          >
                            <code className={className} {...props}>
                              {codeContent}
                            </code>
                          </pre>
                          <button
                            onClick={() => copyToClipboard(msg.text, index)}
                            className="copy-button"
                            title="Copy to clipboard"
                          >
                            <FaCopy size={10} />
                          </button>
                        </div>
                      );
                    }
                  
                    // Inline code
                    return (
                      <code
                        className="px-1 py-0.5 rounded"
                        style={{
                          backgroundColor: "var(--code-inline-bg)",
                          color: "var(--code-inline-text)"
                        }}
                      >
                        {codeContent}
                      </code>
                    );
                  }
                }}
              >
                {msg.text}
              </ReactMarkdown>
            </div>

            {/* Copied popup */}
            {copiedMessage === index && (
              <div className="absolute top-0 right-6 bg-gray-800 text-white text-xs p-1 rounded-md">
                Copied!
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Chat controls */}
      <div className="flex justify-end space-x-4 mt-1">
        <label className="sly-data-btn flex items-center text-xs gap-1 text-white">
          <input
            type="checkbox"
            checked={enableSlyData}
            onChange={() => setEnableSlyData(!enableSlyData)}
            className="accent-orange-400"
          />
          sly_data
        </label>
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

      {/* Sly Data*/}
      {enableSlyData && (
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
      )}

    </div>
  );
};

export default ChatPanel;
