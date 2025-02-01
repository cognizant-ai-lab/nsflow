import React, { useState } from "react";

const LogsPanel = () => {
  const [logs, setLogs] = useState<string[]>([
    "System initialized.",
    "Agent network loaded successfully.",
  ]);

  return (
    <div className="bg-gray-900 text-white p-4 h-full flex flex-col">
      <h2 className="text-lg font-bold">Logs</h2>
      <div className="flex-grow bg-gray-800 p-2 rounded overflow-y-auto">
        {logs.map((log, index) => (
          <p key={index} className="text-sm text-gray-400">{log}</p>
        ))}
      </div>
    </div>
  );
};

export default LogsPanel;
