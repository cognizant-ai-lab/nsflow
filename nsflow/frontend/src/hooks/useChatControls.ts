
// Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
// All Rights Reserved.
// Issued under the Academic Public License.
//
// You can be released from the terms, and requirements of the Academic Public
// License by purchasing a commercial license.
// Purchase of a commercial license is mandatory for any use of the
// nsflow SDK Software in commercial settings.
//
// END COPYRIGHT
import { useChatContext } from "../context/ChatContext";

export const useChatControls = () => {
  const { 
    chatWs, 
    internalChatWs, 
    setChatWs, 
    setInternalChatWs, 
    setChatMessages, 
    setInternalChatMessages,
    setSlyDataMessages,
    addInternalChatMessage,
    addChatMessage,
    addSlyDataMessage
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
    setSlyDataMessages([]);
    addChatMessage({ sender: "system", text: "Welcome to the chats", network: "" });
    addInternalChatMessage({ sender: "system", text: "Welcome to internal chat logs.", network: "" });
    addSlyDataMessage({ sender: "system", text: "Welcome to sly_data logs.", network: "" });
  };

  return { stopWebSocket, clearChat };
};
