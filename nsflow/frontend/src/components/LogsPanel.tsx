
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

import { useState, useEffect, useRef } from "react";
import { 
  Box, 
  Typography, 
  Paper, 
  IconButton, 
  Tooltip, 
  useTheme,
  alpha
} from "@mui/material";
import { 
  Download as DownloadIcon 
} from "@mui/icons-material";
import { useApiPort } from "../context/ApiPortContext";
import { useChatContext } from "../context/ChatContext";

type LogEntry = {
  timestamp: string;
  agent: string;
  message: string;
  source: string; // Identifies log source: FastAPI, NeuroSan, or Frontend
};

// Get formatted timestamp
const getCurrentTimestamp = () => new Date().toISOString().replace("T", " ").split(".")[0];

// localStorage keys and constants
const LOGS_STORAGE_PREFIX = 'nsflow-logs-';
const LOGS_METADATA_KEY = 'nsflow-logs-metadata';
const MAX_LOGS_PER_SESSION = 1000;
const MAX_SESSIONS = 2;

interface LogsMetadata {
  sessions: Array<{
    sessionId: string;
    timestamp: number;
    logCount: number;
  }>;
}

// Helper functions for localStorage management
const getLogsStorageKey = (sessionId: string): string => `${LOGS_STORAGE_PREFIX}${sessionId}`;

const loadLogsFromStorage = (sessionId: string): LogEntry[] => {
  try {
    const key = getLogsStorageKey(sessionId);
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Failed to load logs from localStorage:', error);
    return [];
  }
};

const saveLogsToStorage = (sessionId: string, logs: LogEntry[]): void => {
  const key = getLogsStorageKey(sessionId);
  try {
    const logsToSave = logs.slice(-MAX_LOGS_PER_SESSION);
    localStorage.setItem(key, JSON.stringify(logsToSave));
    updateLogsMetadata(sessionId, logsToSave.length);
    cleanupOldSessions();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn('localStorage quota exceeded, cleaning up old sessions...');
      cleanupOldSessions(true);
      try {
        const reducedLogs = logs.slice(-Math.floor(MAX_LOGS_PER_SESSION * 0.8));
        localStorage.setItem(key, JSON.stringify(reducedLogs));
        updateLogsMetadata(sessionId, reducedLogs.length);
      } catch (retryError) {
        console.error('Failed to save logs after cleanup:', retryError);
      }
    } else {
      console.error('Failed to save logs to localStorage:', error);
    }
  }
};

const updateLogsMetadata = (sessionId: string, logCount: number): void => {
  try {
    const stored = localStorage.getItem(LOGS_METADATA_KEY);
    const metadata: LogsMetadata = stored ? JSON.parse(stored) : { sessions: [] };
    
    const existingIndex = metadata.sessions.findIndex(s => s.sessionId === sessionId);
    if (existingIndex >= 0) {
      metadata.sessions[existingIndex].timestamp = Date.now();
      metadata.sessions[existingIndex].logCount = logCount;
    } else {
      metadata.sessions.push({
        sessionId,
        timestamp: Date.now(),
        logCount,
      });
    }
    
    // Sort by timestamp (newest first)
    metadata.sessions.sort((a, b) => b.timestamp - a.timestamp);
    
    localStorage.setItem(LOGS_METADATA_KEY, JSON.stringify(metadata));
  } catch (error) {
    console.warn('Failed to update logs metadata:', error);
  }
};

const cleanupOldSessions = (forceCleanup = false): void => {
  try {
    const stored = localStorage.getItem(LOGS_METADATA_KEY);
    if (!stored) return;
    
    const metadata: LogsMetadata = JSON.parse(stored);
    
    if (metadata.sessions.length > MAX_SESSIONS || forceCleanup) {
      const sessionsToKeep = metadata.sessions.slice(0, MAX_SESSIONS);
      const sessionsToRemove = metadata.sessions.slice(MAX_SESSIONS);
      
      // Remove old session logs from localStorage
      sessionsToRemove.forEach(session => {
        const key = getLogsStorageKey(session.sessionId);
        localStorage.removeItem(key);
      });
      
      // Update metadata with new sessions array
      const updatedMetadata: LogsMetadata = {
        sessions: sessionsToKeep,
      };
      localStorage.setItem(LOGS_METADATA_KEY, JSON.stringify(updatedMetadata));
    }
  } catch (error) {
    console.warn('Failed to cleanup old sessions:', error);
  }
};

const LogsPanel = () => {
  const { wsUrl } = useApiPort();
  const { sessionId, targetNetwork } = useChatContext();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const currentNetworkRef = useRef<string>("");
  const isInitializedRef = useRef<boolean>(false);
  const theme = useTheme();
  
  const [logs, setLogs] = useState<LogEntry[]>(() => {
    const stored = loadLogsFromStorage(sessionId);
    if (stored && stored.length > 0) {
      return stored;
    }
    // Only initialize with default messages if this is truly the first time
    const initialLogs = [
      { timestamp: getCurrentTimestamp(), agent: "None", source: "Frontend", message: "System initialized." },
      { timestamp: getCurrentTimestamp(), agent: "None", source: "Frontend", message: "Frontend app loaded successfully." },
    ];
    // Save initial logs to localStorage
    saveLogsToStorage(sessionId, initialLogs);
    return initialLogs;
  });

  // Persist logs to localStorage whenever they change (with debouncing to avoid excessive writes)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      saveLogsToStorage(sessionId, logs);
    }, 500); // Debounce: save 500ms after last change

    return () => clearTimeout(timeoutId);
  }, [logs, sessionId]);

  useEffect(() => {
    // Auto-scroll to latest message
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    if (!wsUrl || !targetNetwork) return; // Prevents WebSocket from connecting before port is set

    // Check if we need to create a new WebSocket connection
    const networkChanged = currentNetworkRef.current !== targetNetwork;
    const needsNewConnection = 
      !wsRef.current || 
      wsRef.current.readyState === WebSocket.CLOSED ||
      wsRef.current.readyState === WebSocket.CLOSING ||
      networkChanged;

    if (needsNewConnection) {
      // Close existing connection if switching networks or if connection is dead
      if (wsRef.current) {
        const oldWs = wsRef.current;
        // Remove event listeners to prevent memory leaks
        oldWs.onopen = null;
        oldWs.onmessage = null;
        oldWs.onclose = null;
        oldWs.onerror = null;
        if (oldWs.readyState === WebSocket.OPEN || oldWs.readyState === WebSocket.CONNECTING) {
          oldWs.close();
        }
        wsRef.current = null;
      }

      // Only add connection message if this is a new network
      if (networkChanged) {
        setLogs((prevLogs) => {
          // Avoid duplicate connection messages
          const lastLog = prevLogs[prevLogs.length - 1];
          const connectionMsg = `Connected to ${targetNetwork} via ${wsUrl}`;
          if (lastLog?.message !== connectionMsg) {
            return [
              ...prevLogs,
              { timestamp: getCurrentTimestamp(), agent: `${targetNetwork}`, source: "Frontend", message: connectionMsg },
            ];
          }
          return prevLogs;
        });
        currentNetworkRef.current = targetNetwork;
      }

      // Create new WebSocket connection
      const ws = new WebSocket(`${wsUrl}/api/v1/ws/logs/${targetNetwork}/${sessionId}`);
      
      ws.onopen = () => {
        console.log("Logs WebSocket Connected.");
        wsRef.current = ws;
      };

      ws.onmessage = (event) => {
        try {
          const data: LogEntry = JSON.parse(event.data);
          if (data.timestamp && data.message) {
            setLogs((prev) => {
              // Prevent duplicate messages
              const isDuplicate = prev.some(
                (log) => log.timestamp === data.timestamp && log.message === data.message && log.agent === data.agent
              );
              if (isDuplicate) return prev;
              return [...prev, data];
            });
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      ws.onclose = () => {
        console.log("Logs WebSocket Disconnected");
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
      };

      ws.onerror = (error) => {
        console.error("Logs WebSocket Error:", error);
      };

      wsRef.current = ws;
      isInitializedRef.current = true;
    }

    // Cleanup function - close WebSocket when dependencies change
    return () => {
      // Store the current network before cleanup
      const previousNetwork = currentNetworkRef.current;
      
      // If network is changing or component is unmounting, close the connection
      if (wsRef.current && (previousNetwork !== targetNetwork || !targetNetwork)) {
        const ws = wsRef.current;
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
        wsRef.current = null;
      }
    };
  }, [targetNetwork, wsUrl, sessionId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  const downloadLogs = () => {
    const logText = logs
      .map((log) => `[${log.timestamp}]:${log.agent}:${log.source}:${log.message}`)
      .join("\n");

    const blob = new Blob([logText], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "logs.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Paper
      elevation={1}
      sx={{
        p: 2,
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 2,
        height: '100%',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Header */}
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        mb: 1,
        borderBottom: `1px solid ${theme.palette.divider}`,
        pb: 0
      }}>
        <Typography variant="h6" sx={{ 
          color: theme.palette.text.primary,
          fontWeight: 600
        }}>
          Logs
        </Typography>
        <Tooltip title="Download Logs">
          <IconButton 
            onClick={downloadLogs}
            size="small"
            sx={{ 
              color: theme.palette.primary.main,
              '&:hover': {
                backgroundColor: alpha(theme.palette.primary.main, 0.1)
              }
            }}
          >
            <DownloadIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Logs Messages */}
      <Paper
        variant="outlined"
        sx={{
          flexGrow: 1,
          overflow: 'auto',
          maxHeight: '24rem',
          p: 1,
          backgroundColor: alpha(theme.palette.background.default, 0.5),
          border: `1px solid ${theme.palette.divider}`
        }}
      >
        {logs.length > 0 ? (
          logs.map((log, index) => (
            <Typography
              key={index}
              variant="body2"
              sx={{
                fontSize: '0.8rem',
                color: theme.palette.text.secondary,
                fontFamily: 'monospace',
                lineHeight: 1.4,
                mb: 0.25
              }}
            >
              <Box component="span" sx={{ color: theme.palette.text.disabled }}>
                [{log.timestamp}]
              </Box>
              <Box component="span" sx={{ color: theme.palette.success.main }}>
                : {log.agent}
              </Box>
              <Box 
                component="span" 
                sx={{ 
                  fontWeight: 600,
                  color: log.source === "NeuroSan" 
                    ? theme.palette.warning.main 
                    : theme.palette.info.main
                }}
              >
                {" "}({log.source})
              </Box>
              : {log.message}
            </Typography>
          ))
        ) : (
          <Typography variant="body2" sx={{ 
            color: theme.palette.text.disabled,
            textAlign: 'center',
            py: 2
          }}>
            No logs available.
          </Typography>
        )}
        <div ref={messagesEndRef} />
      </Paper>
    </Paper>
  );
};

export default LogsPanel;
