import React, { useState, useEffect } from "react";
import { FaDownload } from "react-icons/fa";

type LogEntry = {
  timestamp: string;
  message: string;
  source: string; // Identifies log source: FastAPI, Neuro-SAN, or Frontend
};

const getCurrentTimestamp = () => new Date().toISOString().replace("T", " ").split(".")[0];

const LogsPanel = () => {
  const [logs, setLogs] = useState<LogEntry[]>([
    { timestamp: getCurrentTimestamp(), source: "Frontend", message: "System initialized." },
    { timestamp: getCurrentTimestamp(), source: "Frontend", message: "Frontend app loaded successfully." },
  ]);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8000/api/v1/ws/logs");

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

    return () => {
      ws.close();
    };
  }, []);

  const downloadLogs = () => {
    const logText = logs
      .map((log) => `[${log.timestamp}] (${log.source}) ${log.message}`)
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
    <div className="logs-panel">
      <div className="logs-header">
        <h2>Logs</h2>
        <button onClick={downloadLogs} className="logs-download-btn">
          <FaDownload />
        </button>
      </div>
      <div className="logs-messages overflow-y-auto max-h-96 p-2 bg-gray-900 border border-gray-700">
        {logs.map((log, index) => (
          <p key={index} className="text-sm text-gray-300">
            <span className="text-gray-400">[{log.timestamp}]</span>
            <span className="text-blue-500"> ({log.source})</span>: {log.message}
          </p>
        ))}
      </div>
    </div>
  );
};

export default LogsPanel;
