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
  addChatMessage: (msg: Message) => void;
  addInternalChatMessage: (msg: Message) => void;
};

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const [chatMessages, setChatMessages] = useState<Message[]>([
    { sender: "system", text: "Welcome to the chat!" },
  ]);
  const [internalChatMessages, setInternalChatMessages] = useState<Message[]>([
    { sender: "system", text: "Internal Chat Logs" },
  ]);

  const addChatMessage = (msg: Message) => setChatMessages((prev) => [...prev, msg]);
  const addInternalChatMessage = (msg: Message) => setInternalChatMessages((prev) => [...prev, msg]);

  return (
    <ChatContext.Provider value={{ chatMessages, internalChatMessages, addChatMessage, addInternalChatMessage }}>
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
