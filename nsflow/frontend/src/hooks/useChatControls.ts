import { useChatContext } from "../context/ChatContext";

export const useChatControls = () => {
  const { 
    chatWs, 
    internalChatWs, 
    setChatWs, 
    setInternalChatWs, 
    setChatMessages, 
    setInternalChatMessages,
    addInternalChatMessage,
    addChatMessage
  } = useChatContext();

  const stopWebSocket = () => {
    console.log("Stopping chat session...");

    if (chatWs) {
      chatWs.close();
      setChatWs(null);
    }
    if (internalChatWs) {
      internalChatWs.close();
      setInternalChatWs(null);
    }
  };

  const clearChat = () => {
    console.log("Clearing chat history...");
    setChatMessages([]);
    setInternalChatMessages([]);
    addChatMessage({ sender: "system", text: "Welcome to the chat", network: "" });
    addInternalChatMessage({ sender: "system", text: "Welcome to internal chat log", network: "" });
  };

  return { stopWebSocket, clearChat };
};
