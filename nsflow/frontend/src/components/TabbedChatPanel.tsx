
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
import { useTheme } from '../context/ThemeContext';
interface TabbedChatPanelProps {
  isEditorMode?: boolean;
}

const TabbedChatPanel = ({ isEditorMode = false }: TabbedChatPanelProps) => {
  const [activeTab, setActiveTab] = useState<"chat" | "internal" | "slydata" | "config">("chat");
  const { wsUrl } = useApiPort();
  const { theme } = useTheme();
  const { activeNetwork, targetNetwork, isEditorMode: contextIsEditorMode, setIsEditorMode,
    addChatMessage, addInternalChatMessage, addSlyDataMessage, addProgressMessage,
    setChatWs, setInternalChatWs, setSlyDataWs, setProgressWs, chatWs, internalChatWs,
    slyDataWs, progressWs, setNewSlyData, setNewProgress } = useChatContext();
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

    // Close old WebSockets before creating new ones
    if (chatWs) {
      console.log("Closing previous Chat WebSocket...");
      chatWs.close();
    }
    if (internalChatWs) {
      console.log("Closing previous Internal Chat WebSocket...");
      internalChatWs.close();
    }
    if (slyDataWs) {
      console.log("Closing previous Sly Data WebSocket...");
      slyDataWs.close();
    }
    if (progressWs) {
      console.log("Closing previous Progress WebSocket...");
      progressWs.close();
    }

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
    const chatWsUrl = `${wsUrl}/api/v1/ws/chat/${targetNetwork}`;
    console.log("Connecting Chat WebSocket:", chatWsUrl);
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

    newChatWs.onopen = () => console.log(">> Chat WebSocket Connected");
    newChatWs.onclose = () => console.log(">> Chat WebSocket Disconnected");
    setChatWs(newChatWs);

    // Setup WebSocket for Internal Chat Panel (skip in editor mode)
    if (!isEditorMode) {
      const internalWsUrl = `${wsUrl}/api/v1/ws/internalchat/${targetNetwork}`;
      console.log("Connecting Internal Chat WebSocket:", internalWsUrl);
      const newInternalWs = new WebSocket(internalWsUrl);

      newInternalWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.message && typeof data.message === "object") {
            const otrace = data.message.otrace;
            const chatText = data.message.text?.trim();
            if (!chatText || !otrace.length) return;
            if (lastMessageRef.current === chatText) {
              console.log("Duplicate message ignored");
              return;
            }
            lastMessageRef.current = chatText;
            addInternalChatMessage({ sender: otrace.join(" : "), text: chatText, network: targetNetwork });
          }
        } catch (err) {
          console.error("Error parsing Internal Chat WebSocket message:", err);
        }
      };

      newInternalWs.onopen = () => console.log(">> Internal Chat WebSocket Connected");
      newInternalWs.onclose = () => console.log(">> Internal Chat WebSocket Disconnected");
      setInternalChatWs(newInternalWs);
    }

    // Setup WebSocket for Sly Data Panel
    const slyDataWsUrl = `${wsUrl}/api/v1/ws/slydata/${targetNetwork}`;
    console.log("Connecting Sly Data WebSocket:", slyDataWsUrl);
    const newSlyDataWs = new WebSocket(slyDataWsUrl);

    newSlyDataWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.message && typeof data.message === "object") {
          // const otrace = data.message.otrace;
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
              slyText = `\`\`\`json\n${JSON.stringify(chatTextRaw, null, 2).replace(/\\n/g, '\n')}\n\`\`\``;
            }
          if (slyText.trim().length > 0) {
            // lastMessageRef.current = chatText;
            addSlyDataMessage({ sender: targetNetwork, text: slyText, network: targetNetwork });
            setNewSlyData(String(Date.now())); // tick for listeners
          }
        }
      } catch (err) {
        console.error("Error parsing Sly Data WebSocket message:", err);
      }
    };

    newSlyDataWs.onopen = () => console.log(">>Sly Data WebSocket Connected");
    newSlyDataWs.onclose = () => console.log(">> Sly Data WebSocket Disconnected");
    setSlyDataWs(newSlyDataWs);

    // Setup WebSocket for Progress
    const progressWsUrl = `${wsUrl}/api/v1/ws/progress/${targetNetwork}`;
    console.log("Connecting Progress WebSocket:", progressWsUrl);
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
        }

        if (payload) {
          // Store RAW object for robust downstream parsing
          addProgressMessage({ sender: targetNetwork, text: payload, network: targetNetwork });
          console.log("progress text: ", payload)
          setNewProgress(String(Date.now())); // tick for listeners
        }
      } catch (err) {
        console.error("Error parsing Progress WebSocket message:", err);
      }
    };

    newProgressWs.onopen = () => console.log(">> Progress WebSocket Connected");
    newProgressWs.onclose = () => console.log(">> Progress WebSocket Disconnected");
    setProgressWs(newProgressWs);

    return () => {
      console.log("WebSockets for old network are closed.");
    };
   }, [targetNetwork, wsUrl]);

  const tabConfig = [
    { id: "chat", label: "Chat", icon: <ChatIcon />, component: <ChatPanel /> },
    ...(!isEditorMode ? [{ id: "internal", label: "Internal Chat", icon: <InternalIcon />, component: <InternalChatPanel /> }] : []),
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

      {/* Content */}
      <Box sx={{ 
        flexGrow: 1,
        overflow: 'hidden',
        backgroundColor: theme.palette.background.default
      }}>
        {tabConfig[activeTabIndex]?.component}
      </Box>
    </Paper>
  );
};

export default TabbedChatPanel;
