
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

import { useState, useRef, useEffect } from "react";
import { Box, Tabs, Tab, Paper, alpha } from "@mui/material";
import { Chat as ChatIcon, BugReport as InternalIcon,
  DataObject as SlyDataIcon, Settings as ConfigIcon } from "@mui/icons-material";
import ChatPanel from "./ChatPanel";
import InternalChatPanel from "./InternalChatPanel";
import EditorSlyDataPanel from "./slydata/EditorSlyDataPanel";
import ConfigPanel from "./ConfigPanel";
import { useApiPort } from "../context/ApiPortContext";
import { useChatContext } from "../context/ChatContext";
import { useTraceContext } from "../context/TraceContext";
import { useTheme } from '../context/ThemeContext';
import TracePanel from "./trace/TracePanel";
import { Timeline as TraceIcon } from "@mui/icons-material";
interface TabbedChatPanelProps {
  isEditorMode?: boolean;
}

const TabbedChatPanel = ({ isEditorMode = false }: TabbedChatPanelProps) => {
  const [activeTab, setActiveTab] = useState<"chat" | "internal" | "trace" | "slydata" | "config">("chat");
  const { wsUrl } = useApiPort();
  const { theme } = useTheme();
  const { sessionId, activeNetwork, targetNetwork, isEditorMode: contextIsEditorMode, setIsEditorMode,
    addChatMessage, addInternalChatMessage, addSlyDataMessage, addProgressMessage,
    setChatWs, setInternalChatWs, setSlyDataWs, setProgressWs, chatWs, internalChatWs,
    slyDataWs, progressWs, setNewSlyData, setNewProgress } = useChatContext();
  const { addTraceStep, traceWs, setTraceWs } = useTraceContext();
  const lastActiveNetworkRef = useRef<string | null>(null);
  const lastMessageRef = useRef<string | null>(null);

  // Set editor mode in context when prop changes
  useEffect(() => {
    if (contextIsEditorMode !== isEditorMode) {
      setIsEditorMode(isEditorMode);
    }
  }, [isEditorMode, contextIsEditorMode, setIsEditorMode]);

  useEffect(() => {
    if (!targetNetwork) return;

    // Close any sockets from the previous render before opening new ones.
    chatWs?.close();
    internalChatWs?.close();
    slyDataWs?.close();
    progressWs?.close();
    traceWs?.close();
    // Trace data is kept across network switches for the Analysis page.

    // Send system message for network switch only once
    if (lastActiveNetworkRef.current !== targetNetwork) {
      addChatMessage({
        sender: "system",
        text: `Connected to Agent: **${targetNetwork}**`,
        network: targetNetwork,
      });
      lastActiveNetworkRef.current = targetNetwork;
    }

    // Setup WebSocket for Chat Panel
    const chatWsUrl = `${wsUrl}/api/v1/ws/chat/${targetNetwork}/${sessionId}`;
    const newChatWs = new WebSocket(chatWsUrl);

    newChatWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.message && typeof data.message === "object" && data.message.type === "AI") {
          addChatMessage({ sender: "agent", text: data.message.text, network: targetNetwork });
        }
      } catch (err) {
        console.error("Error parsing Chat WebSocket message:", err);
      }
    };

    setChatWs(newChatWs);

    // Setup WebSocket for Internal Chat Panel (skip in editor mode)
    let newInternalWs: WebSocket | null = null;
    if (!isEditorMode) {
      const internalWsUrl = `${wsUrl}/api/v1/ws/internalchat/${targetNetwork}/${sessionId}`;
      newInternalWs = new WebSocket(internalWsUrl);

      newInternalWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.message && typeof data.message === "object") {
            const otrace = data.message.otrace;
            const chatText = data.message.text?.trim();
            if (!chatText || !otrace.length) return;
            if (lastMessageRef.current === chatText) {
              return;
            }
            lastMessageRef.current = chatText;
            addInternalChatMessage({ sender: otrace.join(" : "), text: chatText, network: targetNetwork });
          }
        } catch (err) {
          console.error("Error parsing Internal Chat WebSocket message:", err);
        }
      };

      setInternalChatWs(newInternalWs);
    }

    // Setup WebSocket for Sly Data Panel
    const slyDataWsUrl = `${wsUrl}/api/v1/ws/slydata/${targetNetwork}/${sessionId}`;
    const newSlyDataWs = new WebSocket(slyDataWsUrl);

    newSlyDataWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.message && typeof data.message === "object") {
          const chatTextRaw = data.message.text;
          // Check if it's a non-empty object
          const isEmptyObject =
            typeof chatTextRaw === "object" &&
            chatTextRaw !== null &&
            Object.keys(chatTextRaw).length === 0;

            let slyText = "";

            if (typeof chatTextRaw === "string") {
              slyText = chatTextRaw;
            } else if (!isEmptyObject) {
              // Format as markdown code block
              slyText = `\`\`\`json\n${JSON.stringify(chatTextRaw, null, 2)}\n\`\`\``;
            }
          if (slyText.trim().length > 0) {
            addSlyDataMessage({ sender: targetNetwork, text: slyText, network: targetNetwork });
            setNewSlyData(String(Date.now())); // tick for listeners
          }
        }
      } catch (err) {
        console.error("Error parsing Sly Data WebSocket message:", err);
      }
    };

    setSlyDataWs(newSlyDataWs);

    // Setup WebSocket for Progress
    const progressWsUrl = `${wsUrl}/api/v1/ws/progress/${targetNetwork}/${sessionId}`;
    const newProgressWs = new WebSocket(progressWsUrl);

    newProgressWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Expect a shape like { message: { text: string | object, ... } } OR other
        const msg = data?.message ?? data;

        // normalize to an object if possible
        let payload: any = undefined;
        if (msg && typeof msg === "object") {
          const raw = ("text" in msg ? msg.text : msg); // some servers put the payload into text, others directly on message
          if (typeof raw === "object" && raw !== null) {
            payload = raw;
          } else if (typeof raw === "string") {
            try {
              payload = JSON.parse(raw);
            } catch {
              // if not JSON, ignore for the Sidebar (we only use JSON payloads there)
              payload = undefined;
            }
          }
        } else if (typeof msg === "string") {
          // AGENT_PROGRESS events arrive as a JSON string: '{"progress": {...}}'
          try {
            const parsed = JSON.parse(msg);
            payload = "progress" in parsed ? parsed.progress : parsed;
          } catch {
            payload = undefined;
          }
        }

        if (payload) {
          // Store RAW object for robust downstream parsing
          addProgressMessage({ sender: targetNetwork, text: payload, network: targetNetwork });
          setNewProgress(String(Date.now())); // tick for listeners
        }
      } catch (err) {
        console.error("Error parsing Progress WebSocket message:", err);
      }
    };

    setProgressWs(newProgressWs);

    // Setup WebSocket for Trace
    const traceWsUrl = `${wsUrl}/api/v1/ws/trace/${targetNetwork}/${sessionId}`;
    const newTraceWs = new WebSocket(traceWsUrl);

    newTraceWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const step = data?.message;
        if (step && typeof step === "object" && Array.isArray(step.otrace)) {
          addTraceStep(step);
        }
      } catch (err) {
        console.error("Error parsing Trace WebSocket message:", err);
      }
    };

    setTraceWs(newTraceWs);

    // Close every socket opened by this effect run on unmount or re-render.
    return () => {
      newChatWs.close();
      newInternalWs?.close();
      newSlyDataWs.close();
      newProgressWs.close();
      newTraceWs.close();
    };
  }, [targetNetwork, wsUrl, sessionId]);

  const tabConfig = [
    { id: "chat", label: "Chat", icon: <ChatIcon />, component: <ChatPanel /> },
    ...(!isEditorMode ? [{ id: "internal", label: "Internal Chat", icon: <InternalIcon />, component: <InternalChatPanel /> }] : []),
    ...(!isEditorMode ? [{ id: "trace", label: "Trace", icon: <TraceIcon />, component: <TracePanel /> }] : []),
    { id: "slydata", label: "SlyData", icon: <SlyDataIcon />, component: <EditorSlyDataPanel /> },
    ...(!isEditorMode ? [{ id: "config", label: "Config", icon: <ConfigIcon />, component: <ConfigPanel selectedNetwork={activeNetwork} /> }] : []),
  ];

  const activeTabIndex = tabConfig.findIndex(tab => tab.id === activeTab);

  return (
    <Paper 
      elevation={1}
      sx={{ 
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        overflow: 'hidden'
      }}
    >
      {/* MUI Tabs */}
      <Box sx={{ 
        borderBottom: `1px solid ${theme.palette.divider}`,
        backgroundColor: theme.palette.background.paper
      }}>
        <Tabs
          value={activeTabIndex}
          onChange={(_, newValue) => setActiveTab(tabConfig[newValue].id as any)}
          variant="fullWidth"
          sx={{
            minHeight: 48,
            '& .MuiTab-root': {
              minHeight: 48,
              fontSize: '0.875rem',
              fontWeight: 500,
              textTransform: 'none',
              color: theme.palette.text.secondary,
              '&.Mui-selected': {
                color: theme.palette.primary.main,
                fontWeight: 600,
              },
              '&:hover': {
                color: theme.palette.primary.main,
                backgroundColor: alpha(theme.palette.primary.main, 0.04),
              }
            },
            '& .MuiTabs-indicator': {
              backgroundColor: theme.palette.primary.main,
              height: 3,
            }
          }}
        >
          {tabConfig.map((tab) => (
            <Tab
              key={tab.id}
              icon={tab.icon}
              label={tab.label}
              iconPosition="start"
              sx={{
                gap: 1,
                '& .MuiSvgIcon-root': {
                  fontSize: '1.125rem'
                }
              }}
            />
          ))}
        </Tabs>
      </Box>

      {/* Content - Keep all tabs mounted to preserve state */}
      <Box sx={{
        flexGrow: 1,
        overflow: 'hidden',
        backgroundColor: theme.palette.background.default,
        position: 'relative'
      }}>
        {tabConfig.map((tab, index) => (
          <Box
            key={tab.id}
            sx={{
              display: index === activeTabIndex ? 'flex' : 'none',
              flexDirection: 'column',
              height: '100%',
              width: '100%'
            }}
          >
            {tab.component}
          </Box>
        ))}
      </Box>
    </Paper>
  );
};

export default TabbedChatPanel;
