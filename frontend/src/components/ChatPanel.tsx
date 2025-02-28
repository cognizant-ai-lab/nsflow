import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Clipboard } from "lucide-react"; // Small copy icon
import { useApiPort } from "../context/ApiPortContext";

type Message = {
  sender: "user" | "agent" | "system";
  text: string;
  network?: string; // Preserve network for each message
};

const ChatPanel = ({ selectedNetwork }: { selectedNetwork: string }) => {
  const { apiPort } = useApiPort();
  const [messages, setMessages] = useState<Message[]>([
    { sender: "system", text: "Welcome to the chat!" },
    { sender: "system", text: "How can I assist you?" },
  ]);
  const [newMessage, setNewMessage] = useState("");
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null); // Stores index of copied message

  useEffect(() => {
    if (!selectedNetwork) return;

    setMessages((prev) => [
      ...prev,
      { sender: "system", text: `Connected to Agent: **${selectedNetwork}**`, network: selectedNetwork },
    ]);

    const wsUrl = `ws://localhost:${apiPort}/api/v1/ws/chat/${selectedNetwork}`;
    console.log(`Connecting to WebSocket: ${wsUrl}`);

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => console.log("WebSocket Connected");
    ws.onmessage = (event) => {
      console.log("WebSocket Message Received:", event.data);
      try {
        const data = JSON.parse(event.data);

        if (data.message && typeof data.message === "object") {
          if (data.message.type === "AI") {
            const aiText = data.message.text; // Extract AI response text

            setMessages((prev) => {
              if (
                prev.length > 0 &&
                prev[prev.length - 1].sender === "agent" &&
                prev[prev.length - 1].text === aiText &&
                prev[prev.length - 1].network === selectedNetwork
              ) {
                return prev; // Prevent duplicates
              }

              return [...prev, { sender: "agent", text: aiText, network: selectedNetwork }];
            });
          } else {
            console.log("Ignoring non-final message:", data.message);
          }
        } else {
          console.error("Invalid message format:", data);
        }
      } catch (err) {
        console.error("Error parsing WebSocket message:", err);
      }
    };

    ws.onerror = (err) => console.error("WebSocket Error:", err);
    ws.onclose = () => console.log("WebSocket Disconnected");

    setSocket(ws);

    return () => {
      console.log("Closing WebSocket...");
      ws.close();
    };
  }, [selectedNetwork, apiPort]);

  const sendMessage = () => {
    if (!newMessage.trim() || !socket) return;
    setMessages((prev) => [...prev, { sender: "user", text: newMessage, network: selectedNetwork }]);

    console.log(`Sending message: ${newMessage}`);
    socket.send(JSON.stringify({ message: newMessage }));
    setNewMessage("");
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMessage(index);
      setTimeout(() => setCopiedMessage(null), 1000); // Show "Copied!" for 1 second
    });
  };

  return (
    <div className="chat-panel flex flex-col h-full p-4">
      <h2 className="text-lg font-bold">Chat</h2>
      <div className="chat-messages flex-grow overflow-y-auto p-2 space-y-2 bg-gray-900 rounded-md">
        {messages.map((msg, index) => (
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
                ul: ({ children }) => <ul className="list-disc ml-4">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal ml-4">{children}</ol>,
                li: ({ children }) => <li className="ml-2">{children}</li>,
                p: ({ children }) => <p className="mb-2">{children}</p>,
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
      </div>

      {/* Chat Input */}
      <div className="chat-input mt-2 flex gap-2">
        <input
          type="text"
          placeholder="Type a message..."
          className="chat-input-box bg-gray-700 text-white p-2 rounded-md flex-grow"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />
        <button
          onClick={sendMessage}
          className="chat-send-btn bg-blue-600 text-white p-2 rounded-md"
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatPanel;
