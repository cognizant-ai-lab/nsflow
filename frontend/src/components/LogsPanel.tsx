import React, { useState, useEffect } from "react";
import { FaDownload } from "react-icons/fa";

const LogsPanel = () => {
  const [logs, setLogs] = useState<string[]>([
    "System initialized.",
    "Agent network loaded successfully.",
  ]);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8000/api/v1/ws/logs");

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.log) {
        setLogs((prev) => [...prev, data.log]);
      }
    };

    ws.onclose = () => console.log("Logs WebSocket disconnected.");

    return () => {
      ws.close();
    };
  }, []);

  const downloadLogs = () => {
    const logText = logs.join("\n");
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
      <div className="logs-messages">
        {logs.map((log, index) => (
          <p key={index}>{log}</p>
        ))}
      </div>
    </div>
  );
};

export default LogsPanel;
