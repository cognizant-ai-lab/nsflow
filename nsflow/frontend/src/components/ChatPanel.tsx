import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Clipboard } from "lucide-react"; // Small copy icon
import { useApiPort } from "../context/ApiPortContext";
import { useChatContext } from "../context/ChatContext";

// Global WebSocket storage to persist connections
const activeSockets: Record<string, WebSocket> = {};

const ChatPanel = ({ selectedNetwork, title = "Chat" }: { selectedNetwork: string; title?: string }) => {
  const { apiPort } = useApiPort();
  const { chatMessages, addChatMessage } = useChatContext();
  const [newMessage, setNewMessage] = useState("");
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null); // Reference for auto-scroll

  useEffect(() => {
    if (!selectedNetwork) return;

    const socketKey = `${apiPort}-${selectedNetwork}`;

    // If socket already exists and is open, use it
    if (activeSockets[socketKey] && activeSockets[socketKey].readyState === WebSocket.OPEN) {
      console.log("Using existing WebSocket connection:", socketKey);
      return;
    }

    const wsUrl = `ws://localhost:${apiPort}/api/v1/ws/chat/${selectedNetwork}`;
    console.log(`Creating new WebSocket connection: ${wsUrl}`);

    const ws = new WebSocket(wsUrl);
    activeSockets[socketKey] = ws; // Store socket globally

    ws.onopen = () => console.log("WebSocket Connected:", socketKey);
    ws.onmessage = (event) => {
      console.log("WebSocket Message Received:", event.data);
      try {
        const data = JSON.parse(event.data);
        if (data.message && typeof data.message === "object" && data.message.type === "AI") {
          const aiText = data.message.text;
          addChatMessage({ sender: "agent", text: aiText, network: selectedNetwork });
        }
      } catch (err) {
        console.error("Error parsing WebSocket message:", err);
      }
    };

    ws.onerror = (err) => console.error("WebSocket Error:", err);
    ws.onclose = () => console.log("WebSocket Disconnected:", socketKey);

    return () => {
      console.log("WebSocket remains active:", socketKey);
    };
  }, [selectedNetwork, apiPort]);

  useEffect(() => {
    // Auto-scroll to latest message
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const sendMessage = () => {
    if (!newMessage.trim()) return;
    const socketKey = `${apiPort}-${selectedNetwork}`;
    const ws = activeSockets[socketKey];

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error("WebSocket not connected. Unable to send message.");
      return;
    }

    addChatMessage({ sender: "user", text: newMessage, network: selectedNetwork });

    console.log(`Sending message: ${newMessage}`);
    ws.send(JSON.stringify({ message: newMessage }));
    setNewMessage("");
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMessage(index);
      setTimeout(() => setCopiedMessage(null), 1000);
    });
  };

  return (
    <div className="chat-panel flex flex-col h-full p-4">
      <h2 className="text-lg font-bold">{title}</h2>

      {/* Chat messages container (Scrollable) */}
      <div className="flex-grow overflow-y-auto p-2 space-y-2 bg-gray-900 rounded-md max-h-[70vh]">
        {chatMessages.map((msg, index) => (
          <div
            key={index}
            className={`relative p-2 rounded-md text-sm ${
              msg.sender === "user"
                ? "bg-blue-600 text-white self-end"
                : msg.sender === "agent"
                ? "bg-gray-700 text-gray-100"
                : "bg-gray-800 text-gray-400"
            }`}
          >
            {/* Sender Header */}
            <div className="font-bold mb-1 flex justify-between items-center">
              <span>
                {msg.sender === "user"
                  ? "User"
                  : msg.sender === "agent"
                  ? msg.network || "Unknown Agent"
                  : "System"}
              </span>

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
                // Headings (H1 - H6)
                h1: ({ children }) => <h1 className="text-2xl font-bold mt-4 mb-2">{children}</h1>,
                h2: ({ children }) => <h2 className="text-xl font-semibold mt-3 mb-2">{children}</h2>,
                h3: ({ children }) => <h3 className="text-lg font-semibold mt-2 mb-1">{children}</h3>,
                // Lists
                ul: ({ children }) => <ul className="list-disc ml-6">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal ml-6">{children}</ol>,
                li: ({ children }) => <li className="ml-2">{children}</li>,
                // Paragraphs
                p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
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

      {/* Chat Input (Fixed) */}
      <div className="chat-input mt-2 flex gap-2">
        <input
          type="text"
          placeholder="Type a message..."
          className="chat-input-box bg-gray-700 text-white p-2 rounded-md flex-grow"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />
        <button onClick={sendMessage} className="chat-send-btn bg-blue-600 text-white p-2 rounded-md">
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatPanel;
