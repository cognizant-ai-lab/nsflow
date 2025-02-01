import React from "react";
import { Handle, Position } from "reactflow";

const AgentNode = ({ data }) => {
  return (
    <div className="p-3 bg-blue-600 text-white rounded-lg shadow-md text-center w-36">
      {data.label}

      {/* Target Handles - For Incoming Edges */}
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="target" position={Position.Bottom} id="bottom" />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="target" position={Position.Right} id="right" />

      {/* Source Handles - For Outgoing Edges */}
      <Handle type="source" position={Position.Top} id="top-source" />
      <Handle type="source" position={Position.Bottom} id="bottom-source" />
      <Handle type="source" position={Position.Left} id="left-source" />
      <Handle type="source" position={Position.Right} id="right-source" />
    </div>
  );
};

export default AgentNode;
