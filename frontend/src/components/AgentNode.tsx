// import React from "react";
// import { Handle, Position } from "reactflow";
// import {
//   FaRobot,
//   FaCogs,
//   FaBrain,
//   FaMicrochip,
//   FaNetworkWired,
//   FaUserSecret,
// } from "react-icons/fa";

// // List of icons to choose from
// const icons = [FaRobot, FaCogs, FaBrain, FaMicrochip, FaNetworkWired, FaUserSecret];

// const getRandomIcon = () => {
//   const Icon = icons[Math.floor(Math.random() * icons.length)];
//   return <Icon className="text-white text-lg mr-2" />;
// };

// const AgentNode = ({ data }) => {
//   return (
//     <div className="bg-blue-600 text-white rounded-lg shadow-md w-40">
//       {/* Title Bar */}
//       <div className="flex items-center justify-center bg-blue-700 px-2 py-1 rounded-t-md">
//         {getRandomIcon()}
//         <span className="text-sm font-bold">{data.label}</span>
//       </div>

//       {/* Node Body */}
//       <div className="p-3 text-center">
//         {/* Target Handles - For Incoming Edges */}
//         <Handle type="target" position={Position.Top} id="top" />
//         <Handle type="target" position={Position.Bottom} id="bottom" />
//         <Handle type="target" position={Position.Left} id="left" />
//         <Handle type="target" position={Position.Right} id="right" />

//         {/* Source Handles - For Outgoing Edges */}
//         <Handle type="source" position={Position.Top} id="top-source" />
//         <Handle type="source" position={Position.Bottom} id="bottom-source" />
//         <Handle type="source" position={Position.Left} id="left-source" />
//         <Handle type="source" position={Position.Right} id="right-source" />
//       </div>
//     </div>
//   );
// };

// export default AgentNode;


import React from "react";
import { Handle, Position } from "reactflow";
import {
  FaRobot,
  FaCogs,
  FaBrain,
  FaMicrochip,
  FaNetworkWired,
  FaUserSecret,
} from "react-icons/fa";

// Randomly select an icon
const icons = [FaRobot, FaCogs, FaBrain, FaMicrochip, FaNetworkWired, FaUserSecret];
const getRandomIcon = () => {
  const Icon = icons[Math.floor(Math.random() * icons.length)];
  return <Icon className="text-white text-lg mr-2" />;
};

const AgentNode = ({ data }) => {
  return (
    <div className="bg-blue-600 text-white rounded-lg shadow-md w-40">
      <div className="flex items-center justify-center bg-blue-700 px-2 py-1 rounded-t-md">
        {getRandomIcon()}
        <span className="text-sm font-bold">{data.label}</span>
      </div>

      {/* Node Body */}
      <div className="p-3 text-center">
        {/* Target Handles - For Incoming Edges */}
        <Handle type="target" position={Position.Top} id="top" />
        <Handle type="target" position={Position.Bottom} id="bottom" />
        <Handle type="target" position={Position.Left} id="left" />
        <Handle type="target" position={Position.Right} id="right" />

        {/* Source Handles - For Outgoing Edges */}
        <Handle type="source" position={Position.Top} id="top" />
        <Handle type="source" position={Position.Bottom} id="bottom" />
        <Handle type="source" position={Position.Left} id="left" />
        <Handle type="source" position={Position.Right} id="right" />
      </div>
    </div>
  );
};

export default AgentNode;
