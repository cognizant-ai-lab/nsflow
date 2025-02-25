import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
            const aiText = data.message.text; // ✅ Extract AI response text

            setMessages((prev) => {
              // ✅ Prevent duplicate AI messages
              if (
                prev.length > 0 &&
                prev[prev.length - 1].sender === "agent" &&
                prev[prev.length - 1].text === aiText &&
                prev[prev.length - 1].network === selectedNetwork
              ) {
                return prev;
              }

              return [
                ...prev,
                { sender: "agent", text: aiText, network: selectedNetwork },
              ];
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

  return (
    <div className="chat-panel flex flex-col h-full p-4">
      <h2 className="text-lg font-bold">Chat</h2>
      <div className="chat-messages flex-grow overflow-y-auto p-2 space-y-2 bg-gray-900 rounded-md">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`p-2 rounded-md text-sm ${
              msg.sender === "user"
                ? "bg-blue-600 text-white self-end"
                : msg.sender === "agent"
                ? "bg-gray-700 text-gray-100"
                : "bg-gray-800 text-gray-400"
            }`}
          >
            {/* Sender Header */}
            <div className="font-bold mb-1">
              {msg.sender === "user"
                ? "User"
                : msg.sender === "agent"
                ? msg.network || "Unknown Agent"
                : "System"}
            </div>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
          </div>
        ))}
      </div>
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
