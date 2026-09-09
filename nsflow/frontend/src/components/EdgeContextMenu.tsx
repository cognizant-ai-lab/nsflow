/*
Copyright © 2026 Cognizant Technology Solutions Corp, www.cognizant.com.

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
 * Right-click actions for a connection between two agents.
 *
 * Deleting a connection is how a network gets rearranged, so it needs to be as
 * reachable as deleting an agent. This is separate from the node menu because the
 * two share no actions.
 */

import { useEffect, useRef } from "react";
import {
  Box,
  ListItemIcon,
  ListItemText,
  MenuItem,
  MenuList,
  Paper,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import DisconnectIcon from "@mui/icons-material/LinkOff";

const MENU_WIDTH = 220;
const MENU_HEIGHT = 120;

interface EdgeContextMenuProps {
  visible: boolean;
  x: number;
  y: number;
  source: string;
  target: string;
  onDelete: (source: string, target: string) => void;
  onClose: () => void;
}

const EdgeContextMenu = ({
  visible,
  x,
  y,
  source,
  target,
  onDelete,
  onClose,
}: EdgeContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();

  useEffect(() => {
    if (!visible) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
    };
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscapeKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscapeKey);
    };
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <Paper
      ref={menuRef}
      elevation={8}
      sx={{
        position: "fixed",
        left: Math.min(x, window.innerWidth - MENU_WIDTH),
        top: Math.min(y, window.innerHeight - MENU_HEIGHT),
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
          Connection
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
          {source} → {target}
        </Typography>
      </Box>

      <MenuList dense disablePadding sx={{ py: 0.5 }}>
        <MenuItem
          onClick={() => onDelete(source, target)}
          sx={{
            color: theme.palette.error.main,
            "&:hover": { backgroundColor: alpha(theme.palette.error.main, 0.12) },
          }}
        >
          <ListItemIcon sx={{ color: theme.palette.error.main }}>
            <DisconnectIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Delete connection" />
        </MenuItem>
      </MenuList>
    </Paper>
  );
};

export default EdgeContextMenu;
