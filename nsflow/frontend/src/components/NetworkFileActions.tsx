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
 * Getting an agent network in and out of nsflow as a file.
 *
 * These used to live in a dropdown in the app header, behind a feature flag that
 * defaulted to off, so no default install ever showed them. They belong on the canvas
 * instead: the thing being exported is the thing on screen, and on the Editor the
 * natural place to look is beside the other canvas actions.
 *
 * One component for both pages so the two cannot drift. What differs is only what each
 * page can offer, which the caller decides by passing handlers: the Editor exports the
 * network under design and can import; the Home page exports a network that already
 * exists in the registry, and its import hands over to the Editor, because Home has no
 * canvas to edit on.
 */

import { useRef, useState } from "react";
import {
  Box,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
  alpha,
  useTheme,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/FileDownloadTwoTone";
import HoconIcon from "@mui/icons-material/DataObjectTwoTone";
import NotebookIcon from "@mui/icons-material/ScienceTwoTone";
import UploadIcon from "@mui/icons-material/FileUploadTwoTone";

/** What a .hocon file may be called. Kept in step with the import endpoint. */
export const HOCON_ACCEPT = ".hocon,.json";

export interface NetworkFileActionsProps {
  /** Download the network as HOCON. Omitted or undefined disables export. */
  onExportHocon?: () => void;
  /** Download the network as a Jupyter notebook. Omitted hides the option. */
  onExportNotebook?: () => void;
  /** Open a chosen file. Omitted hides the import button. */
  onImport?: (file: File) => void;
  /** Why export is unavailable, for the tooltip. */
  exportDisabledReason?: string;
  /** Matches the surrounding buttons: the Editor uses 56, the Home canvas 40. */
  size?: number;
}

const NetworkFileActions = ({
  onExportHocon,
  onExportNotebook,
  onImport,
  exportDisabledReason,
  size = 56,
}: NetworkFileActionsProps) => {
  const theme = useTheme();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  // A menu only earns its place when there is a choice to make. With notebook export
  // absent, the export button just exports.
  const hasChoice = Boolean(onExportHocon && onExportNotebook);
  const exportDisabled = Boolean(exportDisabledReason) || !onExportHocon;

  const buttonSx = {
    width: size,
    height: size,
    backgroundColor: alpha(theme.palette.background.paper, 0.95),
    backdropFilter: "blur(8px)",
    border: `1px solid ${theme.palette.divider}`,
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    color: theme.palette.text.secondary,
    "&:hover": {
      backgroundColor: theme.palette.action.hover,
      color: theme.palette.primary.main,
    },
    "&.Mui-disabled": {
      backgroundColor: alpha(theme.palette.background.paper, 0.6),
      color: theme.palette.action.disabled,
      border: `1px solid ${theme.palette.divider}`,
    },
  } as const;

  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
      {onExportHocon && (
        <Tooltip
          title={
            exportDisabledReason ??
            (hasChoice ? "Export this agent network" : "Download this agent network as HOCON")
          }
        >
          {/* The span keeps the tooltip alive while the button is disabled. */}
          <span style={{ display: "inline-flex" }}>
            <IconButton
              disabled={exportDisabled}
              aria-label="Export agent network"
              onClick={(event) =>
                hasChoice ? setMenuAnchor(event.currentTarget) : onExportHocon()
              }
              sx={buttonSx}
            >
              <DownloadIcon />
            </IconButton>
          </span>
        </Tooltip>
      )}

      {hasChoice && (
        <Menu
          open={Boolean(menuAnchor)}
          anchorEl={menuAnchor}
          onClose={() => setMenuAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
        >
          <MenuItem
            dense
            onClick={() => {
              setMenuAnchor(null);
              onExportHocon?.();
            }}
          >
            <ListItemIcon>
              <HoconIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Download HOCON" secondary="The agent network file" />
          </MenuItem>
          <MenuItem
            dense
            onClick={() => {
              setMenuAnchor(null);
              onExportNotebook?.();
            }}
          >
            <ListItemIcon>
              <NotebookIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Download notebook" secondary="A Jupyter notebook that calls it" />
          </MenuItem>
        </Menu>
      )}

      {onImport && (
        <>
          <Tooltip title="Import an agent network from a .hocon file">
            <IconButton
              aria-label="Import agent network"
              onClick={() => inputRef.current?.click()}
              sx={buttonSx}
            >
              <UploadIcon />
            </IconButton>
          </Tooltip>
          <input
            ref={inputRef}
            type="file"
            accept={HOCON_ACCEPT}
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Cleared before the handler runs, so choosing the same file twice in a
              // row still fires a change event.
              event.target.value = "";
              if (file) onImport(file);
            }}
          />
        </>
      )}
    </Box>
  );
};

export default NetworkFileActions;
