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
import type { CruseThread } from '../../types/cruse';

interface CruseTabbedChatPanelProps {
  currentThread: CruseThread | null;
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
const CruseTabbedChatPanel: React.FC<CruseTabbedChatPanelProps> = ({ currentThread, onSaveMessage }) => {
  const { apiUrl, wsUrl } = useApiPort();
  const { theme } = useTheme();
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

      // One-time theme agent call for new agent using oneshot endpoint
      const requestTheme = async () => {
        try {
          const payload = JSON.stringify({
            agent_name: activeNetwork,
            request: 'generate_theme',
          });

          console.log('[CRUSE] Sending theme request to oneshot endpoint for agent:', activeNetwork);

          const response = await fetch(`${apiUrl}/api/v1/oneshot/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agent_name: 'cruse_theme_agent',
              message: payload,
            }),
          });

          if (!response.ok) {
            console.error('[CRUSE] Theme request failed:', response.statusText);
            return;
          }

          const data = await response.json();
          console.log('[CRUSE] Theme agent response:', data);

          // Parse the raw_response.message
          if (data.raw_response && data.raw_response.message) {
            const themeResponse = data.raw_response.message;
            if (themeResponse.theme) {
              console.log('[CRUSE] Theme received:', themeResponse.theme);
              // TODO: Apply theme to chat interface
              // For now, just log it
            } else {
              console.log('[CRUSE] No theme to apply');
            }
          } else {
            console.log('[CRUSE] No theme in response');
          }
        } catch (error) {
          console.error('[CRUSE] Failed to request theme:', error);
        }
      };

      requestTheme();
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
      {/* Only Chat Panel - no tabs needed */}
      <CruseChatPanel currentThread={currentThread} onSaveMessage={onSaveMessage} />
    </Paper>
  );
};

export default CruseTabbedChatPanel;
