
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

const LogsPanel = () => {
  const { wsUrl } = useApiPort();
  const [logs, setLogs] = useState<LogEntry[]>([
    { timestamp: getCurrentTimestamp(), agent: "None", source: "Frontend", message: "System initialized." },
    { timestamp: getCurrentTimestamp(), agent: "None", source: "Frontend", message: "Frontend app loaded successfully." },
  ]);
  const { targetNetwork} = useChatContext();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();

  useEffect(() => {
    // Auto-scroll to latest message
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    if (!wsUrl || !targetNetwork) return; // Prevents WebSocket from connecting before port is set

    setLogs((prevLogs) => [
      ...prevLogs,
      { timestamp: getCurrentTimestamp(), agent: `${targetNetwork}`, source: "Frontend", message: `Connected to ${wsUrl}` },
    ]);

    // WebSocket for real-time logs
    const ws = new WebSocket(`${wsUrl}/api/v1/ws/logs/${targetNetwork}`);
    
    ws.onopen = () => console.log("Logs WebSocket Connected.");
    ws.onmessage = (event) => {
      try {
        const data: LogEntry = JSON.parse(event.data);
        if (data.timestamp && data.message) {
          setLogs((prev) => [...prev, data]);
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };
    ws.onclose = () => console.log("Logs WebSocket Disconnected");

    // Cleanup function
    return () => {
      ws.close();
    };
  }, [targetNetwork, wsUrl]);

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
