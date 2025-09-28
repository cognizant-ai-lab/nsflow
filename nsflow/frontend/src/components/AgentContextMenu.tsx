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

import React, { useEffect, useRef } from "react";
import { FaEdit, FaTrash, FaPlus, FaCopy } from "react-icons/fa";

interface AgentContextMenuProps {
  visible: boolean;
  x: number;
  y: number;
  nodeId: string;
  onEdit: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onAdd: (x: number, y: number) => void;
  onClose: () => void;
}

const AgentContextMenu: React.FC<AgentContextMenuProps> = ({
  visible,
  x,
  y,
  nodeId,
  onEdit,
  onDelete,
  onAdd,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (visible) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [visible, onClose]);

  // Close menu on escape key
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    if (visible) {
      document.addEventListener("keydown", handleEscapeKey);
      return () => {
        document.removeEventListener("keydown", handleEscapeKey);
      };
    }
  }, [visible, onClose]);

  if (!visible) return null;

  // Adjust position to keep menu within viewport
  const adjustedX = Math.min(x, window.innerWidth - 200);
  const adjustedY = Math.min(y, window.innerHeight - 200);

  const menuItems = [
    {
      icon: FaEdit,
      label: "Edit Agent",
      onClick: () => onEdit(nodeId),
      className: "hover:bg-blue-600",
    },
    {
      icon: FaCopy,
      label: "Duplicate",
      onClick: () => console.log("Duplicate agent:", nodeId),
      className: "hover:bg-green-600",
    },
    {
      icon: FaPlus,
      label: "Add Child Agent",
      onClick: () => onAdd(x, y),
      className: "hover:bg-purple-600",
    },
    {
      icon: FaTrash,
      label: "Delete Agent",
      onClick: () => onDelete(nodeId),
      className: "hover:bg-red-600 text-red-300",
      divider: true,
    },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl min-w-[160px]"
      style={{
        left: adjustedX,
        top: adjustedY,
      }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-600 bg-gray-750">
        <div className="text-xs text-gray-300 font-medium">Agent Actions</div>
        {nodeId && (
          <div className="text-xs text-gray-400 truncate">{nodeId}</div>
        )}
      </div>

      {/* Menu Items */}
      <div className="py-1">
        {menuItems.map((item, index) => (
          <React.Fragment key={index}>
            {item.divider && (
              <div className="border-t border-gray-600 my-1" />
            )}
            <button
              onClick={item.onClick}
              className={`
                w-full flex items-center px-3 py-2 text-sm text-white transition-colors
                ${item.className || "hover:bg-gray-700"}
              `}
            >
              <item.icon className="mr-3 text-sm" />
              {item.label}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Footer tip */}
      <div className="px-3 py-2 border-t border-gray-600 bg-gray-750">
        <div className="text-xs text-gray-400">
          Right-click for context menu
        </div>
      </div>
    </div>
  );
};

export default AgentContextMenu;
