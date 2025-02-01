import React, { useState } from "react";

const ChatPanel = () => {
  const [messages, setMessages] = useState<string[]>([
    "Welcome to the chat!",
    "How can I assist you?",
  ]);
  const [newMessage, setNewMessage] = useState("");

  const sendMessage = () => {
    if (!newMessage.trim()) return;
    setMessages([...messages, newMessage]);
    setNewMessage("");
  };

  return (
    <div className="chat-panel flex flex-col h-full p-4">
      {/* Chat Header */}
      <h2 className="text-lg font-bold">Chat</h2>

      {/* Chat Messages */}
      <div className="chat-messages flex-grow overflow-y-auto">
        {messages.map((msg, index) => (
          <p key={index} className="text-sm text-gray-200">{msg}</p>
        ))}
      </div>

      {/* Input Field and Send Button */}
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
