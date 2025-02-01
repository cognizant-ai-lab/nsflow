import React, { useState } from "react";
import { FaDownload } from "react-icons/fa";

const LogsPanel = () => {
  const [logs, setLogs] = useState<string[]>([
    "System initialized.",
    "Agent network loaded successfully.",
    "Connection established with Agent A.",
    "Running task: Data Sync...",
    "Task completed successfully.",
    "Error: Failed to fetch data from external API.",
    "Retrying...",
  ]);

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
      {/* Logs Header (Fixed) */}
      <div className="logs-header">
        <h2>Logs</h2>

        {/* Small Download Icon */}
        <button onClick={downloadLogs} className="logs-download-btn">
          <FaDownload />
        </button>
      </div>

      {/* Logs Messages (Scrollable & fills remaining space) */}
      <div className="logs-messages">
        {logs.map((log, index) => (
          <p key={index}>{log}</p>
        ))}
      </div>
    </div>
  );
};

export default LogsPanel;
