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

/**
 * Right-click actions for an agent on the editor canvas.
 *
 * Styled from the MUI theme rather than with fixed colours. It used to hardcode dark
 * Tailwind greys and white text, which is unreadable under the light theme.
 */

import { useEffect, useRef } from "react";
import {
  Box,
  Divider,
  ListItemIcon,
  ListItemText,
  MenuItem,
  MenuList,
  Paper,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import DuplicateIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import AddChildIcon from "@mui/icons-material/Add";

/** Roughly the menu's own size, used to keep it inside the viewport. */
const MENU_WIDTH = 200;
const MENU_HEIGHT = 210;

interface AgentContextMenuProps {
  visible: boolean;
  x: number;
  y: number;
  nodeId: string;
  onEdit: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onDuplicate: (nodeId: string) => void;
  onAddChild: (nodeId: string) => void;
  onClose: () => void;
  /**
   * Whether this agent may be given a down-chain agent. False for a toolbox tool or
   * an external reference, which cannot have children: such a network fails
   * validation and the designer LLM is summoned to repair it, so hiding the action is
   * what keeps a new user from building that by accident.
   */
  canAddChild?: boolean;
  /**
   * Whether this agent may be duplicated. False for the frontman: a copy inherits the
   * original's parents, and the frontman has none, so the copy would be a second root.
   */
  canDuplicate?: boolean;
  /**
   * Whether this agent may be deleted. False for the frontman, which is the network's
   * entry point and has no parent to promote its children to.
   */
  canDelete?: boolean;
}

const AgentContextMenu = ({
  visible,
  x,
  y,
  nodeId,
  onEdit,
  onDelete,
  onDuplicate,
  onAddChild,
  onClose,
  canAddChild = true,
  canDuplicate = true,
  canDelete = true,
}: AgentContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();

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

  // The frontman is checked first: it is the more specific case, and saying "cannot
  // have down-chain agents" about it would be wrong as well as unhelpful.
  const hint = !canDelete
    ? "The frontman is the network's entry point, so it cannot be removed or copied."
    : !canAddChild
      ? "This agent cannot have down-chain agents."
      : undefined;

  // Keep the menu within the viewport
  const adjustedX = Math.min(x, window.innerWidth - MENU_WIDTH);
  const adjustedY = Math.min(y, window.innerHeight - MENU_HEIGHT);

  const actions = [
    { icon: <EditIcon fontSize="small" />, label: "Edit Agent", onClick: () => onEdit(nodeId) },
    ...(canDuplicate
      ? [
          {
            icon: <DuplicateIcon fontSize="small" />,
            label: "Duplicate",
            onClick: () => onDuplicate(nodeId),
          },
        ]
      : []),
    ...(canAddChild
      ? [
          {
            icon: <AddChildIcon fontSize="small" />,
            label: "Add Child Agent",
            onClick: () => onAddChild(nodeId),
          },
        ]
      : []),
  ];

  return (
    <Paper
      ref={menuRef}
      elevation={8}
      sx={{
        position: "fixed",
        left: adjustedX,
        top: adjustedY,
        zIndex: theme.zIndex.tooltip,
        minWidth: MENU_WIDTH,
        borderRadius: 2,
        border: `1px solid ${theme.palette.divider}`,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          px: 1.5,
          py: 1,
          borderBottom: `1px solid ${theme.palette.divider}`,
          backgroundColor: alpha(theme.palette.primary.main, 0.08),
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: 600, display: "block" }}>
          Agent Actions
        </Typography>
        {nodeId && (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
            {nodeId}
          </Typography>
        )}
      </Box>

      <MenuList dense disablePadding sx={{ py: 0.5 }}>
        {actions.map((action) => (
          <MenuItem key={action.label} onClick={action.onClick}>
            <ListItemIcon sx={{ color: theme.palette.text.secondary }}>{action.icon}</ListItemIcon>
            <ListItemText primary={action.label} />
          </MenuItem>
        ))}

        {canDelete && (
          <>
            <Divider sx={{ my: 0.5 }} />
            <MenuItem
              onClick={() => onDelete(nodeId)}
              sx={{
                color: theme.palette.error.main,
                "&:hover": { backgroundColor: alpha(theme.palette.error.main, 0.12) },
              }}
            >
              <ListItemIcon sx={{ color: theme.palette.error.main }}>
                <DeleteIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="Delete Agent" />
            </MenuItem>
          </>
        )}
      </MenuList>

      {hint && (
        <Box sx={{ px: 1.5, py: 1, borderTop: `1px solid ${theme.palette.divider}` }}>
          <Typography variant="caption" color="text.secondary">
            {hint}
          </Typography>
        </Box>
      )}
    </Paper>
  );
};

export default AgentContextMenu;
