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

import { useState, useEffect } from "react";

interface UseAgentHighlightingProps {
  selectedNetwork: string | null;
  wsUrl: string;
  sessionId: string;
}

/**
 * Hook to manage real-time agent highlighting via WebSocket
 * Tracks active agents and edges based on otrace data from logs
 */

// Shared state outside component to persist across mounts
let lastActiveAgents: Set<string> = new Set();
let lastActiveEdges: Set<string> = new Set();

export const useAgentHighlighting = ({
  selectedNetwork,
  wsUrl,
  sessionId,
}: UseAgentHighlightingProps) => {
  const [activeAgents, setActiveAgents] = useState<Set<string>>(lastActiveAgents);
  const [activeEdges, setActiveEdges] = useState<Set<string>>(lastActiveEdges);

  useEffect(() => {
    if (!selectedNetwork) return;

    const ws = new WebSocket(
      `${wsUrl}/api/v1/ws/logs/${selectedNetwork}/${sessionId}`
    );

    ws.onopen = () => {
      console.log("[useAgentHighlighting] Logs WebSocket Connected");
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.message) {
          let logMessage;
          try {
            logMessage =
              typeof data.message === "string"
                ? JSON.parse(data.message)
                : data.message;
          } catch {
            // Invalid message format, skip
            return;
          }

          if (logMessage.otrace && Array.isArray(logMessage.otrace)) {
            // Update active agents from otrace
            const newActiveAgents = new Set<string>(logMessage.otrace);
            setActiveAgents(newActiveAgents);
            lastActiveAgents = newActiveAgents; // Persist to shared state

            // Generate active edges from the agent sequence
            if (logMessage.otrace.length > 1) {
              const newActiveEdges = new Set<string>();
              for (let i = 0; i < logMessage.otrace.length - 1; i++) {
                newActiveEdges.add(
                  `${logMessage.otrace[i]}-${logMessage.otrace[i + 1]}`
                );
              }
              setActiveEdges(newActiveEdges);
              lastActiveEdges = newActiveEdges; // Persist to shared state
            } else {
              // Clear edges if no sequence
              setActiveEdges(new Set());
              lastActiveEdges = new Set();
            }
          }
        }
      } catch (error) {
        console.error("[useAgentHighlighting] Error parsing WebSocket message:", error);
      }
    };

    ws.onclose = () => {
      console.log("[useAgentHighlighting] Logs WebSocket Disconnected");
    };

    return () => {
      ws.close();
    };
  }, [selectedNetwork, wsUrl, sessionId]);

  return {
    activeAgents,
    activeEdges,
  };
};

