
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
import { createContext, useContext, useState, ReactNode } from "react";

type Message = {
  sender: "system" | "internal" | "user" | "agent";
  text: string;
  network?: string;
  otrace?: string[];
};

type ChatContextType = {
  chatMessages: Message[];
  internalChatMessages: Message[];
  slyDataMessages: Message[];
  addChatMessage: (msg: Message) => void;
  addInternalChatMessage: (msg: Message) => void;
  addSlyDataMessage: (msg: Message) => void;
  setChatMessages: (messages: Message[]) => void;
  setInternalChatMessages: (messages: Message[]) => void;
  setSlyDataMessages: (messages: Message[]) => void;
  activeNetwork: string;
  setActiveNetwork: (network: string) => void;
  chatWs: WebSocket | null;
  internalChatWs: WebSocket | null;
  slyDataWs: WebSocket | null;
  setChatWs: (ws: WebSocket | null) => void;
  setInternalChatWs: (ws: WebSocket | null) => void;
  setSlyDataWs: (ws: WebSocket | null) => void;
  newSlyData: string;
  setNewSlyData: (data: string) => void;
};

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const [chatMessages, setChatMessages] = useState<Message[]>([
    { sender: "system", text: "Welcome to the chat!" },
  ]);
  const [internalChatMessages, setInternalChatMessages] = useState<Message[]>([
    { sender: "system", text: "Welcome to internal chat logs." },
  ]);
  const [slyDataMessages, setSlyDataMessages] = useState<Message[]>([
    { sender: "system", text: "Welcome to sly_data logs." },
  ]);
  const [activeNetwork, setActiveNetwork] = useState<string>("");
  const [chatWs, setChatWs] = useState<WebSocket | null>(null);
  const [internalChatWs, setInternalChatWs] = useState<WebSocket | null>(null);
  const [slyDataWs, setSlyDataWs] = useState<WebSocket | null>(null);
  const [newSlyData, setNewSlyData] = useState<string>("");


  const addChatMessage = (msg: Message) => setChatMessages((prev) => [...prev, msg]);
  const addInternalChatMessage = (msg: Message) => {
    setInternalChatMessages((prev) => [...prev, { ...msg}]);
  };
  const addSlyDataMessage = (msg: Message) => {
    setSlyDataMessages((prev) => [...prev, { ...msg}]);
  };

  return (
    <ChatContext.Provider value={{ 
      chatMessages, 
      internalChatMessages,
      slyDataMessages,
      addChatMessage, 
      addInternalChatMessage,
      addSlyDataMessage,
      setChatMessages, 
      setInternalChatMessages,
      setSlyDataMessages,
      activeNetwork, 
      setActiveNetwork,
      chatWs,
      setChatWs,
      internalChatWs,
      setInternalChatWs,
      slyDataWs,
      setSlyDataWs,
      newSlyData,
      setNewSlyData
     }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChatContext = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return context;
};
