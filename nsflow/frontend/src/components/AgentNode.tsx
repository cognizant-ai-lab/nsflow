
// Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
// All Rights Reserved.
// Issued under the Academic Public License.
//
// You can be released from the terms, and requirements of the Academic Public
// License by purchasing a commercial license.
// Purchase of a commercial license is mandatory for any use of the
// nsflow SDK Software in commercial settings.
//
// END COPYRIGHT
import React, { useState, useMemo, useEffect } from "react";
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
  FaRegCopy
} from "react-icons/fa";
import { useApiPort } from "../context/ApiPortContext";

// Define the structure of the `data` prop
interface AgentNodeData {
  id: string;
  label: string;
  isActive?: boolean;
  dropdown_tools?: string[];
  selectedNetwork: string;
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
  const { apiUrl } = useApiPort();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [agentDetails, setAgentDetails] = useState<any>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [hoveringTooltip, setHoveringTooltip] = useState(false);
  
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

  useEffect(() => {
    if (!showTooltip || agentDetails) return;
    // Fetch agent details when the tooltip is shown
    fetch(`${apiUrl}/api/v1/networkconfig/${data.selectedNetwork}/agent/${data.label}`)
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) {
            setAgentDetails({
              name: data.label,
              error: "This agent is managed by a remote NeuroSan server. Detailed configuration is not available locally."
            });
          } else {
            throw new Error(`HTTP error! Status: ${res.status}`);
          }
        } else {
          return res.json();
        }
      })
      .then((json) => {
        if (json) setAgentDetails(json);
      })
      .catch((err) => {
        console.error("Failed to load agent details:", err);
      });
  }, [showTooltip, agentDetails, apiUrl, data.selectedNetwork, data.label]);
  

  const handleMouseEnter = () => setShowTooltip(true);
  const handleMouseLeave = () => setTimeout(() => {
    if (!hoveringTooltip) setShowTooltip(false);
  }, 250); // small delay to allow tooltip hover to register

  const handleTooltipEnter = () => setHoveringTooltip(true);
  const handleTooltipLeave = () => {
    setHoveringTooltip(false);
    setShowTooltip(false);
  };

  return (
    <div className="relative w-fit h-fit">
      {/* Node Container */}
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`p-3 rounded-lg shadow-md w-48 transition-all ${
          data.isActive
            ? "border-2 scale-105 shadow-xl"
            : ""
        }`}
        style={{
          background: data.isActive ? "var(--agentflow-node-active-bg)" : "var(--agentflow-node-bg)",
          color: "var(--agentflow-node-text)",
          borderColor: data.isActive ? "var(--agentflow-node-active-border)" : "var(--agentflow-edge)",
        }}
      >
        {/* Title Bar */}
        <div className="flex items-center justify-center bg-blue-700 px-2 py-1 rounded-t-md"
            style={{ backgroundColor: "var(--agentflow-node-header-bg)", color: "var(--agentflow-node-text)" }}
        >
          {/* Icon */}
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
          {/* Correctly render handles with unique keys */}
          {Object.entries(handlePositions).map(([key, position]) => (
            <React.Fragment key={key}>
              <Handle type="target" position={position} id={`${key}-target`} />
              <Handle type="source" position={position} id={`${key}-source`} />
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Tooltip on hover */}
      {showTooltip && agentDetails && (
        <div className="agent-tooltip nodrag absolute left-52 top-0 w-[340px]"
            onMouseEnter={handleTooltipEnter}
            onMouseLeave={handleTooltipLeave}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-2">
            <div className="tooltip-title font-bold text-sm">{agentDetails.name}</div>
            {agentDetails.error === undefined && (
              <button
                className="text-gray-400 hover:text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(JSON.stringify(agentDetails, null, 2));
                }}
                title="Copy details"
              >
                <FaRegCopy size={14} />
              </button>
            )}
          </div>

          {agentDetails.error ? (
            <div className="tooltip-section italic text-gray-400 text-sm">
              {agentDetails.error}
            </div>
          ) : (
            <>
              {agentDetails.llm_config && (
                <div className="tooltip-section">
                  <span className="tooltip-label">LLM Config:</span>{" "}
                  {Object.entries(agentDetails.llm_config)
                    .map(([key, val]) => `${key}: ${val}`)
                    .join(", ")}
                </div>
              )}
              {agentDetails.function && (
                <div className="tooltip-section">
                  <span className="tooltip-label">Function:</span>{" "}
                  {typeof agentDetails.function === "string"
                    ? agentDetails.function
                    : agentDetails.function.description}
                </div>
              )}
              {agentDetails.command && (
                <div className="tooltip-section">
                  <span className="tooltip-label">Command:</span> {agentDetails.command}
                </div>
              )}
              {agentDetails.instructions && (
                <div className="tooltip-section">
                  <span className="tooltip-label">Instructions:</span>
                  <div className="mt-1">{agentDetails.instructions}</div>
                </div>
              )}
              {agentDetails.tools?.length > 0 && (
                <div className="tooltip-section">
                  <span className="tooltip-label">Tools:</span> {agentDetails.tools.join(", ")}
                </div>
              )}
            </>
          )}

          {/* {agentDetails.common_defs && (
            <div className="tooltip-section">
              <div className="tooltip-label mb-1">Common Defs:</div>

              {agentDetails.common_defs.replacement_strings && (
                <div className="mb-1">
                  <span className="tooltip-italic-label">Strings:</span>
                  <ul>
                    {Object.entries(agentDetails.common_defs.replacement_strings).map(
                      ([key, val]) => (
                        <li key={key}>
                          <strong>{key}:</strong> {val}
                        </li>
                      )
                    )}
                  </ul>
                </div>
              )}

              {agentDetails.common_defs.replacement_values && (
                <div>
                  <span className="tooltip-italic-label">Values:</span>
                  <ul>
                    {Object.entries(agentDetails.common_defs.replacement_values).map(
                      ([key, val]) => (
                        <li key={key}>
                          <strong>{key}:</strong>{" "}
                          {typeof val === "string" ? val : JSON.stringify(val)}
                        </li>
                      )
                    )}
                  </ul>
                </div>
              )}
            </div>
          )} */}
        </div>
      )}

    </div>
  );
};

export default AgentNode;
