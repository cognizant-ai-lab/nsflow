import React, { useState, useEffect } from "react";

const ChatPanel = ({ selectedNetwork }: { selectedNetwork: string }) => {
  const [messages, setMessages] = useState<string[]>([
    "Welcome to the chat!",
    "How can I assist you?",
  ]);
  const [newMessage, setNewMessage] = useState("");
  const [socket, setSocket] = useState<WebSocket | null>(null);

  useEffect(() => {
    if (!selectedNetwork) return;

    const wsUrl = `ws://localhost:8000/api/v1/ws/chat/${selectedNetwork}`;
    console.log(`Connecting to WebSocket: ${wsUrl}`);

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => console.log("WebSocket Connected");
    ws.onmessage = (event) => {
      console.log("WebSocket Message Received:", event.data);
      const data = JSON.parse(event.data);
      if (data.message) {
        setMessages((prev) => [...prev, `Agent: ${data.message}`]);
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
    setMessages((prev) => [...prev, `You: ${newMessage}`]);

    console.log(`📤 Sending message: ${newMessage}`);
    socket.send(JSON.stringify({ message: newMessage }));

    setNewMessage("");
  };

  return (
    <div className="chat-panel flex flex-col h-full p-4">
      <h2 className="text-lg font-bold">Chat</h2>
      <div className="chat-messages flex-grow overflow-y-auto">
        {messages.map((msg, index) => (
          <p key={index} className="text-sm text-gray-200">{msg}</p>
        ))}
      </div>
      <div className="chat-input mt-2 flex gap-2">
        <input 
          type="text"
          placeholder="Type a message..."
          className="chat-input-box"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />
        <button onClick={sendMessage} className="chat-send-btn">Send</button>
      </div>
    </div>
  );
};

export default ChatPanel;