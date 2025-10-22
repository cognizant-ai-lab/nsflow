
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
import { createContext, useContext, useState, ReactNode, useRef } from "react";
import { getWandName } from "../utils/config";

type Message = {
  sender: "system" | "internal" | "user" | "agent" | string;
  text: string | object; // Allow objects for SlyData messages;
  network?: string;
  otrace?: string[];
  connectionId?: string;
};

type ChatContextType = {
  chatMessages: Message[];
  internalChatMessages: Message[];
  slyDataMessages: Message[];
  logMessages: Message[];
  progressMessages: Message[];

  addChatMessage: (msg: Message) => void;
  addInternalChatMessage: (msg: Message) => void;
  addSlyDataMessage: (msg: Message) => void;
  addLogMessage: (msg: Message) => void;
  addProgressMessage: (msg: Message) => void;

  setChatMessages: (messages: Message[]) => void;
  setInternalChatMessages: (messages: Message[]) => void;
  setSlyDataMessages: (messages: Message[]) => void;
  setLogMessages: (messages: Message[]) => void;
  setProgressMessages: (messages: Message[]) => void;

  activeNetwork: string;
  setActiveNetwork: (network: string) => void;
  isEditorMode: boolean;
  setIsEditorMode: (isEditor: boolean) => void;
  targetNetwork: string; // Computed network based on mode

  chatWs: WebSocket | null;
  internalChatWs: WebSocket | null;
  slyDataWs: WebSocket | null;
  logWs: WebSocket | null;
  progressWs: WebSocket | null;
  
  setChatWs: (ws: WebSocket | null) => void;
  setInternalChatWs: (ws: WebSocket | null) => void;
  setSlyDataWs: (ws: WebSocket | null) => void;
  setLogWs: (ws: WebSocket | null) => void;
  setProgressWs: (ws: WebSocket | null) => void;
  
  newSlyData: string;
  newLog: string;
  newProgress: string;
  setNewSlyData: (data: string) => void;
  setNewLog: (data: string) => void;
  setNewProgress: (data: string) => void;

  getLastSlyDataMessage: (opts?: { network?: string; connectionId?: string }) => Message | undefined;
  getLastLogMessage: (opts?: { network?: string; connectionId?: string }) => Message | undefined;
  getLastProgressMessage: (opts?: { network?: string; connectionId?: string }) => Message | undefined;

  makeSlyDataConnectionId: () => string;
  makeLogConnectionId: () => string;
  makeProgressConnectionId: () => string;

  progressTick: number;
  slyDataTick: number;
  lastProgressAt: number;
  lastSlyDataAt: number;
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
  const [logMessages, setLogMessages] = useState<Message[]>([
    { sender: "system", text: "Welcome to agent logs." },
  ]);
  const [progressMessages, setProgressMessages] = useState<Message[]>([
    { sender: "system", text: "Welcome to agent progress." },
  ]);
  const [activeNetwork, setActiveNetwork] = useState<string>("");
  const [isEditorMode, setIsEditorMode] = useState<boolean>(false);

  const [chatWs, setChatWs] = useState<WebSocket | null>(null);
  const [internalChatWs, setInternalChatWs] = useState<WebSocket | null>(null);
  const [slyDataWs, setSlyDataWs] = useState<WebSocket | null>(null);
  const [logWs, setLogWs] = useState<WebSocket | null>(null);
  const [progressWs, setProgressWs] = useState<WebSocket | null>(null);

  const [newSlyData, setNewSlyData] = useState<string>("");
  const [newLog, setNewLog] = useState<string>("");
  const [newProgress, setNewProgress] = useState<string>("");

  const [progressTick, setProgressTick] = useState(0);
  const [slyDataTick, setSlyDataTick] = useState(0);
  const [lastProgressAt, setLastProgressAt] = useState<number>(0);
  const [lastSlyDataAt, setLastSlyDataAt] = useState<number>(0);
  // define Workflow Agent Network Designer Name coming in from env variable
  const { wandName } = getWandName();

  // Centralized network logic
  const targetNetwork = isEditorMode ? wandName : activeNetwork;

  const addChatMessage = (msg: Message) => setChatMessages((prev) => [...prev, msg]);
  const addInternalChatMessage = (msg: Message) => { setInternalChatMessages((prev) => [...prev, { ...msg}]); };

  const [lastSlyDataByNetwork, setLastSlyDataByNetwork] = useState<Record<string, Message | undefined>>({});
  const [lastSlyDataByConn, setLastSlyDataByConn] = useState<Record<string, Message | undefined>>({});
  const [lastLogByNetwork, setLastLogByNetwork] = useState<Record<string, Message | undefined>>({});
  const [lastLogByConn, setLastLogByConn] = useState<Record<string, Message | undefined>>({});
  const [lastProgressByNetwork, setLastProgressByNetwork] = useState<Record<string, Message | undefined>>({});
  const [lastProgressByConn, setLastProgressByConn] = useState<Record<string, Message | undefined>>({});

  // Connection-id generator (no crypto)
  const connSeq = useRef(0);
  const makeSlyDataConnectionId = () => `logws_${Date.now()}_${++connSeq.current}`;
  const makeLogConnectionId = () => `logws_${Date.now()}_${++connSeq.current}`;
  const makeProgressConnectionId = () => `progressws_${Date.now()}_${++connSeq.current}`;

  const addSlyDataMessage = (msg: Message) => {
    setSlyDataMessages(prev => [...prev, { ...msg }]);
    if (msg.network) {
      setLastSlyDataByNetwork(prev => ({ ...prev, [msg.network!]: msg }));
    }
    if (msg.connectionId) {
      setLastSlyDataByConn(prev => ({ ...prev, [msg.connectionId!]: msg }));
    }
    setSlyDataTick((n) => n + 1);
    setLastSlyDataAt(Date.now());
  };

  const getLastSlyDataMessage = (opts?: { network?: string; connectionId?: string }) => {
    if (opts?.connectionId) return lastSlyDataByConn[opts.connectionId];
    if (opts?.network) return lastSlyDataByNetwork[opts.network];
    return slyDataMessages[slyDataMessages.length - 1]; // global latest
  };

  const addLogMessage = (msg: Message) => {
    setLogMessages(prev => [...prev, { ...msg }]);
    if (msg.network) {
      setLastLogByNetwork(prev => ({ ...prev, [msg.network!]: msg }));
    }
    if (msg.connectionId) {
      setLastLogByConn(prev => ({ ...prev, [msg.connectionId!]: msg }));
    }
  };

  const getLastLogMessage = (opts?: { network?: string; connectionId?: string }) => {
    if (opts?.connectionId) return lastLogByConn[opts.connectionId];
    if (opts?.network) return lastLogByNetwork[opts.network];
    return logMessages[logMessages.length - 1]; // global latest
  };

  const addProgressMessage = (msg: Message) => {
    setProgressMessages(prev => [...prev, { ...msg }]);
    if (msg.network) {
      setLastProgressByNetwork(prev => ({ ...prev, [msg.network!]: msg }));
    }
    if (msg.connectionId) {
      setLastProgressByConn(prev => ({ ...prev, [msg.connectionId!]: msg }));
    }
    setProgressTick((n) => n + 1);
    setLastProgressAt(Date.now());
  };

  const getLastProgressMessage = (opts?: { network?: string; connectionId?: string }) => {
    if (opts?.connectionId) return lastProgressByConn[opts.connectionId];
    if (opts?.network) return lastProgressByNetwork[opts.network];
    return progressMessages[progressMessages.length - 1]; // global latest
  };
  

  return (
    <ChatContext.Provider value={{ 
      chatMessages, internalChatMessages, slyDataMessages, logMessages, progressMessages,

      addChatMessage, addInternalChatMessage, addSlyDataMessage, addLogMessage, addProgressMessage,

      setChatMessages, setInternalChatMessages, setSlyDataMessages, setLogMessages, setProgressMessages,

      activeNetwork, setActiveNetwork, isEditorMode, setIsEditorMode, targetNetwork,

      chatWs, setChatWs, internalChatWs, setInternalChatWs, slyDataWs, setSlyDataWs, logWs, setLogWs, progressWs, setProgressWs,

      newSlyData, setNewSlyData, newLog, setNewLog, newProgress, setNewProgress,

      getLastSlyDataMessage, getLastLogMessage, getLastProgressMessage,

      makeSlyDataConnectionId, makeLogConnectionId, makeProgressConnectionId,
      progressTick, slyDataTick, lastProgressAt, lastSlyDataAt
     }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChatContext = (): ChatContextType => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return context;
};
