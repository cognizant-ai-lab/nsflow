
/*
Copyright 2025 Cognizant Technology Solutions Corp, www.cognizant.com.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

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
