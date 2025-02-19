import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm"; // Enables GitHub-Flavored Markdown (tables, checklists, etc.)

const ChatPanel = ({ selectedNetwork }: { selectedNetwork: string }) => {
  const [messages, setMessages] = useState<{ sender: string; text: string }[]>([
    { sender: "system", text: "Welcome to the chat!" },
    { sender: "system", text: "How can I assist you?" },
  ]);
  const [newMessage, setNewMessage] = useState("");
  const [socket, setSocket] = useState<WebSocket | null>(null);

  useEffect(() => {
    if (!selectedNetwork) return;

    setMessages((prev) => [...prev, { sender: "system", text: `Connected to Agent: **${selectedNetwork}**` }]);

    const wsUrl = `ws://localhost:8000/api/v1/ws/chat/${selectedNetwork}`;
    console.log(`Connecting to WebSocket: ${wsUrl}`);

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => console.log("WebSocket Connected");
    ws.onmessage = (event) => {
      console.log("WebSocket Message Received:", event.data);
      const data = JSON.parse(event.data);
      if (data.message) {
        setMessages((prev) => [...prev, { sender: "agent", text: data.message }]);
      }
    };

    ws.onerror = (err) => console.error("WebSocket Error:", err);
    ws.onclose = () => console.log("WebSocket Disconnected");

    setSocket(ws);

    return () => {
      console.log("🔌 Closing WebSocket...");
      ws.close();
    };
  }, [selectedNetwork]);

  const sendMessage = () => {
    if (!newMessage.trim() || !socket) return;
    setMessages((prev) => [...prev, { sender: "user", text: newMessage }]);

    console.log(`📤 Sending message: ${newMessage}`);
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
              msg.sender === "user" ? "bg-blue-600 text-white self-end" :
              msg.sender === "agent" ? "bg-gray-700 text-gray-100" :
              "bg-gray-800 text-gray-400"
            }`}
          >
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
        <button onClick={sendMessage} className="chat-send-btn bg-blue-600 text-white p-2 rounded-md">
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatPanel;
