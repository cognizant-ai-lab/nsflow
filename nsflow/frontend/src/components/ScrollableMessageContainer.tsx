
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
import React, { useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { FaCopy } from "react-icons/fa";
import { Clipboard, Volume2 } from "lucide-react";

import { Message } from "../types/chat";

// type Message = {
//   sender: "user" | "agent" | "system";
//   text: string;
//   network?: string;
// };

type Props = {
  messages: Message[];
  copiedMessage: number | null;
  onCopy: (text: string, index: number) => void;
  onTextToSpeech?: (text: string, index: number) => void;
  renderSenderLabel?: (msg: Message) => string;
  getMessageClass?: (msg: Message) => string;
  useSpeech?: boolean;
};

const ScrollableMessageContainer: React.FC<Props> = ({
  messages,
  copiedMessage,
  onCopy,
  onTextToSpeech,
  useSpeech,
  renderSenderLabel = (msg) =>
    msg.sender === "user"
      ? "User"
      : msg.sender === "agent"
      ? msg.network || "Unknown Agent"
      : "System",
  getMessageClass = (msg) =>
    `chat-msg ${
      msg.sender === "user"
        ? "chat-msg-user"
        : msg.sender === "agent"
        ? "chat-msg-agent"
        : "chat-msg-system"
    }`
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto pr-1">
      <div className="chat-messages-container">
        {messages.map((msg, index) => (
          <div key={index} className={getMessageClass(msg)}>
            <div className="font-bold mb-1 flex justify-between items-center">
              <span>{renderSenderLabel(msg)}</span>
              <div className="flex items-center space-x-1">
                {useSpeech && onTextToSpeech && (
                  <button
                    onClick={() => onTextToSpeech(msg.text, index)}
                    className="text-gray-400 hover:text-white p-1"
                    title="Text to speech"
                  >
                    <Volume2 size={10} />
                  </button>
                )}
                <button
                  onClick={() => onCopy(msg.text, index)}
                  className="text-gray-400 hover:text-white p-1"
                  title="Copy to clipboard"
                >
                  <Clipboard size={10} />
                </button>
              </div>
            </div>

            <div className="chat-markdown">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                components={{
                  h1: ({ children }) => <h1 className="text-2xl font-bold mt-4 mb-2 text-[var(--chat-message-text-color)]">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-xl font-semibold mt-3 mb-2 text-[var(--chat-message-text-color)]">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-lg font-semibold mt-2 mb-1 text-[var(--chat-message-text-color)]">{children}</h3>,
                  ul: ({ children }) => <ul className="list-disc ml-6 text-[var(--chat-message-text-color)]">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal ml-6 text-[var(--chat-message-text-color)]">{children}</ol>,
                  li: ({ children }) => <li className="ml-2 text-[var(--chat-message-text-color)]">{children}</li>,
                  p: ({ children }) => <p className="mb-2 leading-relaxed text-[var(--chat-message-text-color)]">{children}</p>,
                  strong: ({ children }) => <strong className="font-bold text-[var(--chat-message-text-color)]">{children}</strong>,
                  em: ({ children }) => <em className="italic text-gray-300 text-[var(--chat-message-text-color)]">{children}</em>,
                  a: ({ children, href }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                      {children}
                    </a>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-gray-400 pl-4 italic text-gray-300">
                      {children}
                    </blockquote>
                  ),
                  pre: ({ children }) => (
                    <pre className="bg-gray-900 text-gray-300 p-3 rounded-md overflow-x-auto">{children}</pre>
                  ),
                  code: ({ className = "", children, ...props }) => {
                    const isBlock = className.includes("language-");
                    const codeContent = String(children).trim();

                    if (isBlock) {
                      return (
                        <div className="relative group my-2">
                          <pre
                            className="rounded p-3 overflow-x-auto text-sm"
                            style={{
                              backgroundColor: "var(--code-block-bg)",
                              color: "var(--code-block-text)",
                            }}
                          >
                            <code className={className} {...props}>
                              {codeContent}
                            </code>
                          </pre>
                          <button
                            onClick={() => onCopy(codeContent, index)}
                            className="copy-button"
                            title="Copy to clipboard"
                          >
                            <FaCopy size={10} />
                          </button>
                        </div>
                      );
                    }

                    return (
                      <code
                        className="px-1 py-0.5 rounded"
                        style={{
                          backgroundColor: "var(--code-inline-bg)",
                          color: "var(--code-inline-text)",
                        }}
                      >
                        {codeContent}
                      </code>
                    );
                  },
                }}
              >
                {msg.text}
              </ReactMarkdown>
            </div>

            {copiedMessage === index && (
              <div className="absolute top-0 right-6 bg-gray-800 text-white text-xs p-1 rounded-md">
                Copied!
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default ScrollableMessageContainer;
