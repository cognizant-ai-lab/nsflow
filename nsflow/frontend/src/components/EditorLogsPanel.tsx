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

import React, { useState, useRef, useEffect } from "react";
import { FaChevronUp, FaChevronDown, FaTerminal, FaBroom } from "react-icons/fa";
import LogsPanel from "./LogsPanel";

const EditorLogsPanel: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  // Handle clicking outside to collapse
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        if (isExpanded) {
          setIsExpanded(false);
        }
      }
    };

    if (isExpanded) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isExpanded]);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <div
      ref={panelRef}
      className={`
        fixed bottom-4 left-4 z-40 bg-gray-800 border border-gray-600 rounded-lg shadow-xl
        transition-all duration-300 ease-in-out
        ${isExpanded 
          ? 'w-96 h-80' 
          : 'w-20 h-10'
        }
      `}
    >
      {/* Header/Toggle Button */}
      <div
        className={`
          flex items-center justify-between p-2 cursor-pointer
          ${isExpanded ? 'border-b border-gray-600' : ''}
        `}
        onClick={toggleExpanded}
      >
        {isExpanded ? (
          <>
            <div className="flex items-center space-x-2">
              <FaTerminal className="text-green-400" size={14} />
              <span className="text-white text-sm font-medium">Logs</span>
            </div>
            <div className="flex items-center space-x-2">
              {logs.length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    clearLogs();
                  }}
                  className="text-gray-400 hover:text-white p-1"
                  title="Clear logs"
                >
                  <FaBroom size={12} />
                </button>
              )}
              <FaChevronDown className="text-gray-400" size={12} />
            </div>
          </>
        ) : (
          <div className="flex items-center space-x-2 w-full justify-center">
            <FaTerminal className="text-green-400" size={12} />
            <span className="text-white text-xs">Logs</span>
            <FaChevronUp className="text-gray-400" size={10} />
          </div>
        )}
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="h-full pb-10 overflow-hidden">
          {/* Use the existing LogsPanel component */}
          <div className="h-full">
            <LogsPanel />
          </div>
        </div>
      )}

      {/* Collapsed state indicator */}
      {!isExpanded && logs.length > 0 && (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
      )}
    </div>
  );
};

export default EditorLogsPanel;
