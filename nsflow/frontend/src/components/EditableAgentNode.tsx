/*
Copyright © 2025 Cognizant Technology Solutions Corp, www.cognizant.com.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import React from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { alpha, useTheme } from "@mui/material/styles";
import { FaRobot, FaCog, FaQuestionCircle } from "react-icons/fa";

// The index signature is what @xyflow/react 12 requires of a node's data
// (it must satisfy Record<string, unknown>).
interface EditableAgentNodeData extends Record<string, unknown> {
  label: string;
  instructions?: string;
  is_defined?: boolean;
  selected?: boolean;
  /** True while a drag is over this agent, so a drop would attach to it. */
  is_drop_target?: boolean;
  network_name?: string;
  depth?: number;
}

// In v12 the NodeProps generic is the NODE type, not the data type.
const EditableAgentNode: React.FC<NodeProps<Node<EditableAgentNodeData>>> = ({ data, selected }) => {
  const isSelected = data.selected || selected;
  const isDefined = data.is_defined !== false; // Default to true if not specified
  // Set while something from the palette is being dragged over this agent. It has to
  // outrank the selected styling: during a drag, what the drop will attach to is the
  // only thing the user is looking for.
  const isDropTarget = data.is_drop_target === true;
  const theme = useTheme();

  // Colours come from the theme rather than fixed Tailwind greys. The card used to be
  // dark-only — bg-gray-800 with text-white — and the selected state tinted it with a
  // near-transparent blue, so under the light theme a selected agent was white text
  // on a white canvas.
  const borderColor = isDropTarget
    ? theme.palette.success.main
    : !isDefined
      ? theme.palette.warning.main
      : isSelected
        ? theme.palette.primary.main
        : theme.palette.divider;
  const backgroundColor = isDropTarget
    ? alpha(theme.palette.success.main, 0.18)
    : !isDefined
      ? alpha(theme.palette.warning.main, 0.14)
      : isSelected
        ? alpha(theme.palette.primary.main, 0.14)
        : theme.palette.background.paper;

  return (
    <div 
      className={`
        relative px-4 py-3 rounded-lg shadow-lg border-2 transition-all duration-200
        ${isDropTarget ? 'scale-105' : ''}
        min-w-[150px] max-w-[250px]
      `}
      style={{ borderColor, backgroundColor, color: theme.palette.text.primary }}
    >
      {/* Drop target indicator, and selection when nothing is being dragged */}
      {isDropTarget ? (
        <div className="absolute -inset-1.5 rounded-lg ring-2 ring-emerald-400 bg-emerald-400/20 animate-pulse" />
      ) : isSelected ? (
        <div
          className="absolute -inset-1 rounded-lg animate-pulse"
          style={{ backgroundColor: alpha(theme.palette.primary.main, 0.2) }}
        />
      ) : null}

      {/* Node content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center space-x-2 mb-2">
          {isDefined ? (
            <FaRobot className="flex-shrink-0" size={16} style={{ color: theme.palette.primary.main }} />
          ) : (
            <FaQuestionCircle className="flex-shrink-0" size={16} style={{ color: theme.palette.warning.main }} />
          )}
          <h3
            className="font-medium text-sm truncate flex-1"
            style={{ color: theme.palette.text.primary }}
          >
            {data.label}
          </h3>
          {!isDefined && (
            <FaCog className="flex-shrink-0" size={12} style={{ color: theme.palette.warning.main }} />
          )}
        </div>

        {/* Instructions */}
        {data.instructions && (
          <p
            className="text-xs leading-relaxed line-clamp-3"
            style={{ color: theme.palette.text.secondary }}
          >
            {data.instructions}
          </p>
        )}

        {/* Status indicators */}
        <div className="flex items-center justify-between mt-2">
          <span
            className="text-xs px-2 py-1 rounded border"
            style={{
              backgroundColor: alpha(
                isDefined ? theme.palette.success.main : theme.palette.warning.main,
                0.18
              ),
              borderColor: alpha(
                isDefined ? theme.palette.success.main : theme.palette.warning.main,
                0.35
              ),
              color: isDefined ? theme.palette.success.main : theme.palette.warning.main,
            }}
          >
            {isDefined ? 'Defined' : 'Referenced'}
          </span>
          
          {data.depth !== undefined && (
            <span className="text-xs" style={{ color: theme.palette.text.secondary }}>
              L{data.depth}
            </span>
          )}
        </div>
      </div>

      {/* Connection handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 bg-blue-400 border-2 border-white"
        style={{ top: -6 }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 bg-blue-400 border-2 border-white"
        style={{ bottom: -6 }}
      />
      <Handle
        type="source"
        position={Position.Left}
        className="w-3 h-3 bg-blue-400 border-2 border-white"
        style={{ left: -6 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-blue-400 border-2 border-white"
        style={{ right: -6 }}
      />
    </div>
  );
};

// Memoized to avoid re-rendering every node when the nodes array is rebuilt by
// reference on each render (see large-graph performance, issue #55).
export default React.memo(EditableAgentNode);
