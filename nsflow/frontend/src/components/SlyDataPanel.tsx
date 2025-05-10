
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
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { FaDownload } from "react-icons/fa";
import { Clipboard } from "lucide-react";
import { useChatContext } from "../context/ChatContext";

const SlyDataPanel = ({ title = "Sly Data" }: { title?: string }) => {
  const { slyDataMessages } = useChatContext();
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null); // Auto-scroll reference

  useEffect(() => {
    // Auto-scroll to latest message
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [slyDataMessages]);

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMessage(index);
      setTimeout(() => setCopiedMessage(null), 1000);
    });
  };

  const downloadMessages = () => {
    const logText = slyDataMessages
      .map((msg) => `${msg.sender}: ${msg.text}`)
      .join("\n");

    const blob = new Blob([logText], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "slydata_logs.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="chat-panel flex flex-col h-full p-4">
      {/* Title with Download Button */}
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
      <div className="chat-messages-container">
        {slyDataMessages.map((msg, index) => (
          <div key={index} className="chat-msg chat-msg-agent">
            {/* Sender Header */}
            <div className="font-bold mb-1 flex justify-between items-center">
              <span>{msg.sender}</span> {/* Fix Otrace display */}

              {/* Copy Icon */}
              <button
                onClick={() => copyToClipboard(msg.text, index)}
                className="text-gray-400 hover:text-white ml-2 p-1"
                title="Copy to clipboard"
              >
                <Clipboard size={10} />
              </button>
            </div>

            {/* Message Content */}
            <div className="chat-markdown">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                components={{
                  p: ({ children }) => <p className="mb-2 leading-relaxed text-[var(--chat-message-text-color)]">{children}</p>,
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-gray-400 pl-4 italic text-gray-300">
                      {children}
                    </blockquote>
                  ),
                  code: ({ children }) => (
                    <code className="bg-gray-400 text-yellow-300 px-1 rounded">{children}</code>
                  ),
                  pre: ({ children }) => (
                    <pre className="bg-gray-900 text-gray-300 p-3 rounded-md overflow-x-auto">{children}</pre>
                  ),
                  strong: ({ children }) => <strong className="font-bold text-[var(--chat-message-text-color)]">{children}</strong>,
                  em: ({ children }) => <em className="italic text-[var(--chat-message-text-color)]">{children}</em>,
                }}
              >
                {msg.text}
              </ReactMarkdown>
            </div>
            
            {/* Copied Tooltip */}
            {copiedMessage === index && (
              <div className="absolute top-0 right-6 bg-gray-800 text-white text-xs p-1 rounded-md">
                Copied!
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} /> {/* Auto-scroll reference */}
      </div>
    </div>
  );
};

export default SlyDataPanel;