import React, { useState, useEffect } from "react";

const ChatPanel = () => {
  const [messages, setMessages] = useState<string[]>([
    "Welcome to the chat!",
    "How can I assist you?",
  ]);
  const [newMessage, setNewMessage] = useState("");
  const [socket, setSocket] = useState<WebSocket | null>(null);

  useEffect(() => {
    // Establish WebSocket connection
    const ws = new WebSocket("ws://localhost:8000/api/v1/ws/chat");

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.message) {
        setMessages((prev) => [...prev, `Agent: ${data.message}`]);
      }
    };

    ws.onclose = () => console.log("Chat WebSocket disconnected.");

    setSocket(ws);

    return () => {
      ws.close();
    };
  }, []);

  const sendMessage = () => {
    if (!newMessage.trim() || !socket) return;
    setMessages((prev) => [...prev, `You: ${newMessage}`]);

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
        <button onClick={sendMessage} className="chat-send-btn">
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatPanel;
