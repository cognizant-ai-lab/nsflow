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
  setChatMessages: (messages: Message[]) => void;
  setInternalChatMessages: (messages: Message[]) => void;
  activeNetwork: string;
  setActiveNetwork: (network: string) => void;
  chatWs: WebSocket | null;
  internalChatWs: WebSocket | null;
  setChatWs: (ws: WebSocket) => void;
  setInternalChatWs: (ws: WebSocket) => void;
};

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const [chatMessages, setChatMessages] = useState<Message[]>([
    { sender: "system", text: "Welcome to the chat!" },
  ]);
  const [internalChatMessages, setInternalChatMessages] = useState<Message[]>([
    { sender: "system", text: "Internal Chat Logs" },
  ]);
  const [activeNetwork, setActiveNetwork] = useState<string>("");
  const [chatWs, setChatWs] = useState<WebSocket | null>(null);
  const [internalChatWs, setInternalChatWs] = useState<WebSocket | null>(null);


  const addChatMessage = (msg: Message) => setChatMessages((prev) => [...prev, msg]);
  const addInternalChatMessage = (msg: Message) => {
    setInternalChatMessages((prev) => [...prev, { ...msg}]);
  };

  return (
    <ChatContext.Provider value={{ 
      chatMessages, 
      internalChatMessages, 
      addChatMessage, 
      addInternalChatMessage,
      setChatMessages, 
      setInternalChatMessages,
      activeNetwork, 
      setActiveNetwork,
      chatWs,
      setChatWs,
      internalChatWs,
      setInternalChatWs,
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
