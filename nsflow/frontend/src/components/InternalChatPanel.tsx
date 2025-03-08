import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Clipboard } from "lucide-react";
import { useApiPort } from "../context/ApiPortContext";
import { useChatContext } from "../context/ChatContext";

const InternalChatPanel = ({ selectedNetwork }: { selectedNetwork: string }) => {
  const { apiPort } = useApiPort();
  const { internalChatMessages, addInternalChatMessage } = useChatContext();
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null); // Auto-scroll reference

  useEffect(() => {
    if (!selectedNetwork) return;

    const wsUrl = `ws://localhost:${apiPort}/api/v1/ws/internalchat/${selectedNetwork}`;
    console.log(`Connecting to WebSocket: ${wsUrl}`);

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => console.log("Internal Chat WebSocket Connected.");
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.message && typeof data.message === "object") {
          const { otrace } = data.message;
          const chatText = data.text || "No message text.";

          // Add message only if it's new
          addInternalChatMessage({ sender: "internal", text: chatText, otrace });
        } else {
          console.error("Invalid internal chat message format:", data);
        }
      } catch (err) {
        console.error("Error parsing WebSocket message:", err);
      }
    };

    ws.onerror = (err) => console.error("WebSocket Error:", err);
    ws.onclose = () => console.log("Internal Chat WebSocket Disconnected.");

    setSocket(ws);
    return () => ws.close();
  }, [selectedNetwork, apiPort]);

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
      <h2 className="text-lg font-bold">Internal Chat</h2>

      {/* Scrollable chat messages container */}
      <div className="flex-grow overflow-y-auto p-2 space-y-2 bg-gray-900 rounded-md max-h-[70vh]">
        {internalChatMessages.map((msg, index) => (
          <div key={index} className="relative p-2 rounded-md text-sm bg-gray-700 text-gray-100">
            {/* Sender Header */}
            <div className="font-bold mb-1 flex justify-between items-center">
              <span>Internal Chat</span>

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
                  <blockquote className="border-l-4 border-gray-400 pl-4 italic text-gray-300">{children}</blockquote>
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

            {/* Display OTRACE (Agent Path) */}
            {msg.otrace && (
              <div className="text-xs text-gray-400 italic mt-1">
                {`OTrace: ${msg.otrace.join(" → ")}`}
              </div>
            )}

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
