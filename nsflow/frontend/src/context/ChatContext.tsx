/*
Copyright © 2025 Cognizant Technology Solutions Corp, www.cognizant.com.

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

import { createContext, useContext, useState, ReactNode, useRef } from "react";
import { getWandName } from "../utils/config";
import { getCruseAgentNames } from "../utils/config";
import {
  ProgressPayload,
  asObjectText,
  latestNetworkPayload,
  overlayNetworkPayload,
} from "../utils/progressHelper";

// Generate a unique session ID for this browser session
// const generateSessionId = (): string => {
//   return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
// };

const generateSessionId = (): string => {
  const prefix = "session_";                 // 8
  const ts = Date.now().toString();          // 13
  const randomLen = 36 - (prefix.length + 1 + ts.length); // -> 14
  const bytes = new Uint8Array(Math.ceil(randomLen / 2));
  crypto.getRandomValues(bytes);
  const randHex = Array.from(bytes, b => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, randomLen);
  return `${prefix}${ts}_${randHex}`;
};

export type Message = {
  sender: "system" | "internal" | "user" | "agent" | string;
  text: string | object; // Allow objects for SlyData messages;
  network?: string;
  otrace?: string[];
  connectionId?: string;

  // Optional fields for CRUSE and message tracking
  id?: string; // Message ID from database
  ts?: number; // Timestamp
  widget?: any; // For CRUSE dynamic widgets
  origin?: Array<{ tool: string; instantiation_index: number }>; // Origin from AI messages
  
  // NEW: For file attachments
  attachedFiles?: Array<{
    file: File;
    content: string;
  }>;
};

type ChatContextType = {
  sessionId: string; // Unique session identifier for WebSocket connections
  regenerateSessionId: () => void; // Function to regenerate sessionId for new threads
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
  widgetAgentName: string;
  themeAgentName: string;

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

  getLatestNetworkPayload: (network?: string) => ProgressPayload | undefined;
  getEditorOutgoingSlyData: (network?: string) => Record<string, any>;
  clearNetworkPayloadState: () => void;

  makeSlyDataConnectionId: () => string;
  makeLogConnectionId: () => string;
  makeProgressConnectionId: () => string;

  progressTick: number;
  slyDataTick: number;
  lastProgressAt: number;
  lastSlyDataAt: number;

  waitingForAgent: boolean;
  setWaitingForAgent: (waiting: boolean) => void;
};

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  // Generate a unique session ID - can be regenerated for new threads/conversations
  const [sessionId, setSessionId] = useState<string>(() => generateSessionId());

  // Function to regenerate session ID (for new threads/conversations)
  const regenerateSessionId = () => {
    const newSessionId = generateSessionId();
    console.log('[ChatContext] Regenerating sessionId:', newSessionId);
    setSessionId(newSessionId);
  };

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
  const [waitingForAgent, setWaitingForAgent] = useState<boolean>(false);

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
  const { widgetAgentName, themeAgentName } = getCruseAgentNames();

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
  // Per-network arrival times. Freshness between the progress and slydata streams is
  // decided with these, never with the global lastProgressAt/lastSlyDataAt: the globals
  // are bumped by messages that skip the byNetwork maps (e.g. clearChat's network:""
  // welcome), which would otherwise flip the preference toward a staler frame.
  const [lastProgressAtByNetwork, setLastProgressAtByNetwork] = useState<Record<string, number>>({});
  const [lastSlyDataAtByNetwork, setLastSlyDataAtByNetwork] = useState<Record<string, number>>({});

  // Connection-id generator (no crypto)
  const connSeq = useRef(0);
  const makeSlyDataConnectionId = () => `logws_${Date.now()}_${++connSeq.current}`;
  const makeLogConnectionId = () => `logws_${Date.now()}_${++connSeq.current}`;
  const makeProgressConnectionId = () => `progressws_${Date.now()}_${++connSeq.current}`;

  const addSlyDataMessage = (msg: Message) => {
    setSlyDataMessages(prev => [...prev, { ...msg }]);
    if (msg.network) {
      setLastSlyDataByNetwork(prev => ({ ...prev, [msg.network!]: msg }));
      setLastSlyDataAtByNetwork(prev => ({ ...prev, [msg.network!]: Date.now() }));
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
      setLastProgressAtByNetwork(prev => ({ ...prev, [msg.network!]: Date.now() }));
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

  // The freshest {agent_network_definition, agent_network_name} payload for a network,
  // taken from whichever stream (progress vs slydata) delivered a frame last. This is
  // what the editor canvas renders in view mode and what outgoing sly_data derives
  // from. NOTE: in the manual-editor plugin mode the canvas renders from the andeditor
  // session instead, and manual edits never reach these streams — this selector cannot
  // see them. (When editor state moves into a store, reimplement this selector and
  // getEditorOutgoingSlyData; all consumers follow.)
  const getLatestNetworkPayload = (network?: string): ProgressPayload | undefined => {
    const net = network ?? targetNetwork;
    if (!net) return undefined;
    const preferProgress =
      (lastProgressAtByNetwork[net] ?? 0) > (lastSlyDataAtByNetwork[net] ?? 0);
    return latestNetworkPayload(lastProgressByNetwork[net], lastSlyDataByNetwork[net], preferProgress);
  };

  // The sly_data blob an editor-mode chat message should carry: the newest parseable
  // sly_data blob recorded for that network as the base (non-definition keys
  // round-trip unchanged), with the freshest definition/name pair overlaid
  // atomically — unless the newest sly_data frame is user-authored (a Sly Data
  // panel edit or a send echo) and no fresher progress frame exists, in which case
  // the user's blob is authoritative as-is (deliberate key deletions must not be
  // resurrected from older frames).
  const getEditorOutgoingSlyData = (network?: string): Record<string, any> => {
    const net = network ?? targetNetwork;
    let base: Record<string, any> = {};
    for (let i = slyDataMessages.length - 1; i >= 0; i--) {
      const msg = slyDataMessages[i];
      // Scope the base to the target network's own stream: blobs recorded for a
      // different network must not leak their keys into this send. (Also keeps the
      // user-authored guard below consistent — it reads the same per-network stream.)
      if (net && msg?.network !== net) continue;
      const obj = asObjectText(msg?.text as any);
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        base = JSON.parse(JSON.stringify(obj)); // clone: stream state must never be mutated
        break;
      }
    }
    if (!net) return base;
    const preferProgress =
      (lastProgressAtByNetwork[net] ?? 0) > (lastSlyDataAtByNetwork[net] ?? 0);
    if (lastSlyDataByNetwork[net]?.sender === "user" && !preferProgress) return base;
    return overlayNetworkPayload(base, getLatestNetworkPayload(net));
  };

  // Forget every recorded network payload. Without this, clearing a chat session
  // leaves the byNetwork maps/timestamps populated and the next send resurrects the
  // abandoned network's definition.
  const clearNetworkPayloadState = () => {
    setProgressMessages([]);
    setLastSlyDataByNetwork({});
    setLastProgressByNetwork({});
    setLastSlyDataByConn({});
    setLastProgressByConn({});
    setLastProgressAtByNetwork({});
    setLastSlyDataAtByNetwork({});
    setLastProgressAt(0);
    setLastSlyDataAt(0);
  };


  return (
    <ChatContext.Provider value={{
      sessionId, // Unique session ID for WebSocket connections
      regenerateSessionId, // Function to regenerate sessionId for new threads
      chatMessages, internalChatMessages, slyDataMessages, logMessages, progressMessages,

      addChatMessage, addInternalChatMessage, addSlyDataMessage, addLogMessage, addProgressMessage,

      setChatMessages, setInternalChatMessages, setSlyDataMessages, setLogMessages, setProgressMessages,

      activeNetwork, setActiveNetwork, isEditorMode, setIsEditorMode, targetNetwork,
      widgetAgentName, themeAgentName,

      chatWs, setChatWs, internalChatWs, setInternalChatWs, slyDataWs, setSlyDataWs, logWs, setLogWs, progressWs, setProgressWs,

      newSlyData, setNewSlyData, newLog, setNewLog, newProgress, setNewProgress,

      getLastSlyDataMessage, getLastLogMessage, getLastProgressMessage,

      getLatestNetworkPayload, getEditorOutgoingSlyData, clearNetworkPayloadState,

      makeSlyDataConnectionId, makeLogConnectionId, makeProgressConnectionId,
      progressTick, slyDataTick, lastProgressAt, lastSlyDataAt,
      waitingForAgent, setWaitingForAgent
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
