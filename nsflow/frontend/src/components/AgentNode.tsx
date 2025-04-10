
# Copyright (C) 2019-2021 Cognizant Digital Business, Evolutionary AI.
# All Rights Reserved.
# Issued under the Academic Public License.
#
# You can be released from the terms, and requirements of the Academic Public
# License by purchasing a commercial license.
# Purchase of a commercial license is mandatory for any use of the
# ENN-release SDK Software in commercial settings.
#
# END COPYRIGHT
import React, { useState, useMemo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import {
  FaRobot,
  FaCogs,
  FaBrain,
  FaMicrochip,
  FaNetworkWired,
  FaUserSecret,
  FaChevronDown,
  FaCheckSquare,
  FaRegSquare,
} from "react-icons/fa";

// Define the structure of the `data` prop
interface AgentNodeData {
  id: string;
  label: string;
  isActive?: boolean;
  dropdown_tools?: string[];
}

// Extend NodeProps to include AgentNodeData
interface AgentNodeProps extends NodeProps {
  data: AgentNodeData;
}

// Available icons
const icons = [FaRobot, FaCogs, FaBrain, FaMicrochip, FaNetworkWired, FaUserSecret];

// Simple hash function to select an icon
const getIconIndex = (key: string) => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % icons.length;
};

const handlePositions: { [key: string]: Position } = {
  top: Position.Top,
  bottom: Position.Bottom,
  left: Position.Left,
  right: Position.Right,
};

// Fix: Add type annotation for function props
const AgentNode: React.FC<AgentNodeProps> = ({ data }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  
  // Fix: Explicitly type the state object
  const [selectedTools, setSelectedTools] = useState<Record<string, boolean>>(
    data.dropdown_tools?.reduce<Record<string, boolean>>((acc, tool) => {
      acc[tool] = true;
      return acc;
    }, {}) || {}
  );

  // Fix: Add type for `tool` parameter
  const toggleToolSelection = (tool: string) => {
    setSelectedTools((prev: Record<string, boolean>) => ({
      ...prev,
      [tool]: !prev[tool],
    }));
  };

  // Use useMemo to avoid re-selecting the icon on every render
  const Icon = useMemo(() => {
    const index = getIconIndex(data.id || data.label);
    return icons[index];
  }, [data.id, data.label]);

  return (
    <div
      className={`p-3 rounded-lg shadow-md text-white w-48 transition-all ${
        data.isActive ? "bg-yellow-500 border-2 border-yellow-300 scale-105 shadow-xl" : "bg-blue-600"
      }`}
    >
      {/* Title Bar */}
      <div className="flex items-center justify-center bg-blue-700 px-2 py-1 rounded-t-md">
        <Icon className="text-white text-lg mr-2" />
        <span className="text-sm font-bold ml-2">{data.label}</span>
      </div>

      {/* Coded Tools Section */}
      {data.dropdown_tools && data.dropdown_tools.length > 0 && (
        <div className="coded-tools-section">
          {/* Toggle Button */}
          <button onClick={() => setDropdownOpen(!dropdownOpen)} className="coded-tools-toggle">
            <span>Coded Tools</span>
            <FaChevronDown className={`transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {/* Dropdown List - Multi-select checkboxes */}
          {dropdownOpen && (
            <ul className="coded-tools-list">
              {data.dropdown_tools.map((tool: string) => (
                <li key={tool} className="coded-tools-item" onClick={() => toggleToolSelection(tool)}>
                  {selectedTools[tool] ? <FaCheckSquare /> : <FaRegSquare />}
                  {tool}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Node Body */}
      <div className="p-3 text-center">
        {/* ✅ Correctly render handles with unique keys */}
        {Object.entries(handlePositions).map(([key, position]) => (
          <React.Fragment key={key}>
            <Handle type="target" position={position} id={`${key}-target`} />
            <Handle type="source" position={position} id={`${key}-source`} />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default AgentNode;
