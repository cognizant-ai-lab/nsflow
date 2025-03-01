import React, { useState, useEffect } from "react";
import { FaDownload } from "react-icons/fa";
import { useApiPort } from "../context/ApiPortContext";

type LogEntry = {
  timestamp: string;
  message: string;
  source: string; // Identifies log source: FastAPI, NeuroSan, or Frontend
};

// Get formatted timestamp
const getCurrentTimestamp = () => new Date().toISOString().replace("T", " ").split(".")[0];

const LogsPanel = () => {
  const { apiPort } = useApiPort();
  const [logs, setLogs] = useState<LogEntry[]>([
    { timestamp: getCurrentTimestamp(), source: "Frontend", message: "System initialized." },
    { timestamp: getCurrentTimestamp(), source: "Frontend", message: "Frontend app loaded successfully." },
  ]);

  useEffect(() => {
    // WebSocket for real-time logs
    const ws = new WebSocket(`ws://localhost:${apiPort}/api/v1/ws/logs`);

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
    <div className="logs-panel p-4 bg-gray-900 border border-gray-700 rounded-md">
      <div className="logs-header flex justify-between items-center mb-2">
        <h2 className="text-white text-lg">Logs</h2>
        <button onClick={downloadLogs} className="logs-download-btn">
          <FaDownload />
        </button>
      </div>
      <div className="logs-messages overflow-y-auto max-h-96 p-2 bg-gray-800 border border-gray-600 rounded-md">
        {logs.length > 0 ? (
          logs.map((log, index) => (
            <p key={index} className="text-sm text-gray-300">
              <span className="text-gray-400">[{log.timestamp}]</span>
              <span className={`font-semibold ${log.source === "NeuroSan" ? "text-yellow-500" : "text-blue-500"}`}>
                {" "}
                ({log.source})
              </span>
              : {log.message}
            </p>
          ))
        ) : (
          <p className="text-gray-400">No logs available.</p>
        )}
      </div>
    </div>
  );
};

export default LogsPanel;
