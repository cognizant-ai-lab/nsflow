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
    <div className="bg-gray-900 text-white p-4 flex flex-col h-full">
      <h2 className="text-lg font-bold">Chat</h2>
      <div className="flex-grow bg-gray-800 p-2 rounded overflow-y-auto">
        {messages.map((msg, index) => (
          <p key={index} className="text-sm text-gray-400">{msg}</p>
        ))}
      </div>
      <div className="flex mt-2 gap-2">
        <input
          type="text"
          placeholder="Type a message..."
          className="flex-grow p-2 bg-gray-700 text-white rounded"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && sendMessage()}
        />
        <button onClick={sendMessage} className="bg-blue-600 hover:bg-blue-700 p-2 rounded">
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatPanel;
