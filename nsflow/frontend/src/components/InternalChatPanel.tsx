import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Clipboard } from "lucide-react";
import { useApiPort } from "../context/ApiPortContext";
import { useChatContext } from "../context/ChatContext";

// Global WebSocket storage to persist connections
const activeSockets: Record<string, WebSocket> = {};

const InternalChatPanel = ({ title = "Internal Chat" }: { title?: string }) => {
  const { apiPort } = useApiPort();
  const { activeNetwork, internalChatMessages, addInternalChatMessage } = useChatContext();
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null); // Auto-scroll reference
  const lastMessageRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeNetwork) return;

    const socketKey = `internal-${apiPort}-${activeNetwork}`;

    // If socket already exists and is open, use it
    if (activeSockets[socketKey] && activeSockets[socketKey].readyState === WebSocket.OPEN) {
      console.log("Using existing Internal Chat WebSocket:", socketKey);
      return;
    }

    const wsUrl = `ws://localhost:${apiPort}/api/v1/ws/internalchat/${activeNetwork}`;
    console.log(`Creating new Internal Chat WebSocket: ${wsUrl}`);

    const ws = new WebSocket(wsUrl);
    activeSockets[socketKey] = ws; // Store WebSocket globally

    ws.onopen = () => console.log("Internal Chat WebSocket Connected:", socketKey);
    ws.onmessage = (event) => {
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
        console.error("Error parsing WebSocket message:", err);
      }
    };

    ws.onerror = (err) => console.error("WebSocket Error:", err);
    ws.onclose = () => console.log("Internal Chat WebSocket Disconnected:", socketKey);

    return () => {
      console.log("Internal Chat WebSocket remains active:", socketKey);
    };
  }, [activeNetwork, apiPort]);

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

  return (
    <div className="chat-panel flex flex-col h-full p-4">
      <h2 className="text-lg font-bold">{title}</h2>

      {/* Scrollable chat messages container */}
      <div className="flex-grow overflow-y-auto p-2 space-y-2 bg-gray-900 rounded-md max-h-[70vh]">
        {internalChatMessages.map((msg, index) => (
          <div key={index} className="relative p-2 rounded-md text-sm bg-gray-700 text-gray-100">
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
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              components={{
                p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-gray-400 pl-4 italic text-gray-300">
                    {children}
                  </blockquote>
                ),
                code: ({ children }) => (
                  <code className="bg-gray-800 text-yellow-300 px-1 rounded">{children}</code>
                ),
                pre: ({ children }) => (
                  <pre className="bg-gray-900 text-gray-300 p-3 rounded-md overflow-x-auto">{children}</pre>
                ),
                strong: ({ children }) => <strong className="font-bold text-gray-200">{children}</strong>,
                em: ({ children }) => <em className="italic text-gray-300">{children}</em>,
              }}
            >
              {msg.text}
            </ReactMarkdown>

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

export default InternalChatPanel;