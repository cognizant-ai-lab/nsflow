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

import { useEffect, useRef } from "react";
import { Paper } from "@mui/material";
import CruseChatPanel from "./CruseChatPanel";
import { useApiPort } from "../../context/ApiPortContext";
import { useChatContext } from "../../context/ChatContext";
import { useTheme } from '../../context/ThemeContext';
import { useGlassEffect } from '../../context/GlassEffectContext';
import type { CruseThread } from '../../types/cruse';

interface CruseTabbedChatPanelProps {
  currentThread: CruseThread | null;
  cruseThemeEnabled?: boolean;
  onSaveMessage: (messageRequest: any) => Promise<void>;
}

/**
 * CruseTabbedChatPanel
 *
 * Simplified version of TabbedChatPanel for CRUSE:
 * - Only shows Chat tab (no Internal/Config/SlyData)
 * - Connects ONLY to main agent (activeNetwork)
 * - NO persistent connections to widget/theme agents
 * - CruseChatPanel handles one-time widget/theme calls
 */
const CruseTabbedChatPanel: React.FC<CruseTabbedChatPanelProps> = ({ currentThread, cruseThemeEnabled = false, onSaveMessage }) => {
  const { wsUrl } = useApiPort();
  const { theme } = useTheme();
  const { getGlassStyles } = useGlassEffect();
  const { sessionId, activeNetwork, addChatMessage, setChatWs, chatWs } = useChatContext();
  const lastActiveNetworkRef = useRef<string | null>(null);

  // Setup WebSocket for main agent ONLY
  useEffect(() => {
    if (!activeNetwork) return;

    // Close old WebSocket before creating new one
    if (chatWs) {
      console.log("[CRUSE] Closing previous WebSocket...");
      chatWs.close();
    }

    // Send system message for network switch only once
    if (lastActiveNetworkRef.current !== activeNetwork) {
      addChatMessage({
        sender: "system",
        text: `Connected to Agent: **${activeNetwork}**`,
        network: activeNetwork,
      });
      lastActiveNetworkRef.current = activeNetwork;

      // NOTE: Theme generation is handled by Cruse.tsx via getOrGenerateTheme()
      // which only calls cruse_theme_agent if theme doesn't exist in DB or on refresh
    }

    // Setup WebSocket for MAIN AGENT ONLY (no widget/theme connections here)
    const chatWsUrl = `${wsUrl}/api/v1/ws/chat/${activeNetwork}/${sessionId}`;
    console.log("[CRUSE] Connecting to main agent:", chatWsUrl);
    const newChatWs = new WebSocket(chatWsUrl);

    newChatWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.message && typeof data.message === "object" && data.message.type === "AI") {
          addChatMessage({
            sender: "agent",
            text: data.message.text,
            network: activeNetwork
            // Note: origin will be constructed from connectivity response when saving to DB
          });
        }
      } catch (err) {
        console.error("[CRUSE] Error parsing WebSocket message:", err);
      }
    };

    newChatWs.onopen = () => console.log("[CRUSE] Main agent connected");
    newChatWs.onclose = () => console.log("[CRUSE] Main agent disconnected");
    newChatWs.onerror = (error) => console.error("[CRUSE] WebSocket error:", error);

    setChatWs(newChatWs);

    return () => {
      console.log("[CRUSE] Cleanup: closing WebSocket");
      if (newChatWs.readyState === WebSocket.OPEN) {
        newChatWs.close();
      }
    };
  }, [activeNetwork, wsUrl, sessionId]);

  const glassStyles = cruseThemeEnabled ? getGlassStyles() : {};

  return (
    <Paper
      elevation={1}
      sx={{
        height: 'calc(100% - 48px)',
        maxWidth: '1400px',
        ml: 10,
        mr: 10,
        my: 3,
        display: 'flex',
        flexDirection: 'column',
        ...(cruseThemeEnabled ? glassStyles : { backgroundColor: theme.palette.background.paper }),
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        border: `1px solid ${theme.palette.divider}`,
        overflow: 'hidden'
      }}
    >
      {/* Only Chat Panel - no tabs needed */}
      <CruseChatPanel currentThread={currentThread} cruseThemeEnabled={cruseThemeEnabled} onSaveMessage={onSaveMessage} />
    </Paper>
  );
};

export default CruseTabbedChatPanel;
