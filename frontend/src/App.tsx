import React, { useState } from "react";
import { ReactFlowProvider } from "reactflow"; // Correct import
import AgentFlow from "./components/AgentFlow";
import Sidebar from "./components/Sidebar";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

const App: React.FC = () => {
  const [selectedNetwork, setSelectedNetwork] = useState<string>("");

  return (
    <ReactFlowProvider>
      <DndProvider backend={HTML5Backend}>
        <div className="flex h-screen w-screen bg-gray-900">
          <Sidebar onSelectNetwork={setSelectedNetwork} />
          <AgentFlow selectedNetwork={selectedNetwork} />
        </div>
      </DndProvider>
    </ReactFlowProvider>
  );
};

export default App;
