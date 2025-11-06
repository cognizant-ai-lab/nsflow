/*
Copyright 2025 Cognizant Technology Solutions Corp, www.cognizant.com.

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
import { Handle, Position, NodeProps } from "reactflow";
import { FaRobot, FaCog, FaQuestionCircle } from "react-icons/fa";

interface EditableAgentNodeData {
  label: string;
  instructions?: string;
  is_defined?: boolean;
  selected?: boolean;
  network_name?: string;
  depth?: number;
}

const EditableAgentNode: React.FC<NodeProps<EditableAgentNodeData>> = ({ data, selected }) => {
  const isSelected = data.selected || selected;
  const isDefined = data.is_defined !== false; // Default to true if not specified

  return (
    <div 
      className={`
        relative px-4 py-3 rounded-lg shadow-lg border-2 transition-all duration-200
        ${isSelected 
          ? 'border-blue-400 bg-blue-900/20 shadow-blue-400/50' 
          : 'border-gray-600 bg-gray-800 hover:border-gray-500'
        }
        ${isDefined ? '' : 'border-orange-500 bg-orange-900/20'}
        min-w-[150px] max-w-[250px]
      `}
    >
      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute -inset-1 bg-blue-400/20 rounded-lg animate-pulse" />
      )}

      {/* Node content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center space-x-2 mb-2">
          {isDefined ? (
            <FaRobot className="text-blue-400 flex-shrink-0" size={16} />
          ) : (
            <FaQuestionCircle className="text-orange-400 flex-shrink-0" size={16} />
          )}
          <h3 className="text-white font-medium text-sm truncate flex-1">
            {data.label}
          </h3>
          {!isDefined && (
            <FaCog className="text-orange-400 flex-shrink-0" size={12} />
          )}
        </div>

        {/* Instructions */}
        {data.instructions && (
          <p className="text-gray-300 text-xs leading-relaxed line-clamp-3">
            {data.instructions}
          </p>
        )}

        {/* Status indicators */}
        <div className="flex items-center justify-between mt-2">
          <span className={`text-xs px-2 py-1 rounded ${
            isDefined 
              ? 'bg-green-600/20 text-green-300 border border-green-600/30' 
              : 'bg-orange-600/20 text-orange-300 border border-orange-600/30'
          }`}>
            {isDefined ? 'Defined' : 'Referenced'}
          </span>
          
          {data.depth !== undefined && (
            <span className="text-xs text-gray-400">
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

export default EditableAgentNode;
