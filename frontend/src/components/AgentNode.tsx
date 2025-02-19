import React, { useState, useMemo } from "react";
import { Handle, Position } from "reactflow";
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

// Available icons
const icons = [FaRobot, FaCogs, FaBrain, FaMicrochip, FaNetworkWired, FaUserSecret];

// Function to get a persistent icon
const getPersistentIcon = (data) => {
  if (data.iconIndex !== undefined) {
    return icons[data.iconIndex]; // Use the stored index
  }
  const randomIndex = Math.floor(Math.random() * icons.length);
  data.iconIndex = randomIndex; // Store the index for persistence
  return icons[randomIndex];
};

const AgentNode = ({ data }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedTools, setSelectedTools] = useState(
    data.dropdown_tools?.reduce((acc, tool) => ({ ...acc, [tool]: true }), {}) || {}
  );

  const toggleToolSelection = (tool) => {
    setSelectedTools((prev) => ({ ...prev, [tool]: !prev[tool] }));
  };

  // Use useMemo to avoid re-selecting the icon on every render
  const Icon = useMemo(() => getPersistentIcon(data), [data]);

  return (
    <div className="bg-blue-600 text-white rounded-lg shadow-md w-48">
      {/* Title Bar */}
      <div className="flex items-center justify-center bg-blue-700 px-2 py-1 rounded-t-md">
        <Icon className="text-white text-lg mr-2" />
        <span className="text-sm font-bold ml-2">{data.label}</span>
      </div>

      {/* Coded Tools Section */}
      {data.dropdown_tools && data.dropdown_tools.length > 0 && (
        <div className="coded-tools-section">
          {/* Toggle Button */}
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="coded-tools-toggle"
          >
            <span>Coded Tools</span>
            <FaChevronDown className={`transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {/* Dropdown List - Multi-select checkboxes */}
          {dropdownOpen && (
            <ul className="coded-tools-list">
              {data.dropdown_tools.map((tool) => (
                <li
                  key={tool}
                  className="coded-tools-item"
                  onClick={() => toggleToolSelection(tool)}
                >
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
        <Handle type="target" position={Position.Top} id="top" />
        <Handle type="target" position={Position.Bottom} id="bottom" />
        <Handle type="target" position={Position.Left} id="left" />
        <Handle type="target" position={Position.Right} id="right" />

        <Handle type="source" position={Position.Top} id="top" />
        <Handle type="source" position={Position.Bottom} id="bottom" />
        <Handle type="source" position={Position.Left} id="left" />
        <Handle type="source" position={Position.Right} id="right" />
      </div>
    </div>
  );
};

export default AgentNode;
