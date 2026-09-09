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
 * Getting an agent network in and out of nsflow as a .hocon file.
 *
 * These used to live in a dropdown in the app header, behind a feature flag that
 * defaulted to off, so no default install ever showed them. They belong on the canvas
 * instead: the thing being exported is the thing on screen.
 *
 * One component for both pages so the two cannot drift. What differs is only what each
 * page does with a file, which the caller decides by passing handlers.
 *
 * Arrows point the way the file moves relative to the machine: export sends it out and
 * up, import brings it in and down.
 */

import { useRef } from "react";
import { Box, IconButton, Tooltip, alpha, useTheme } from "@mui/material";
import ExportIcon from "@mui/icons-material/FileUploadOutlined";
import ImportIcon from "@mui/icons-material/FileDownloadOutlined";

/** What a .hocon file may be called. Kept in step with the import endpoint. */
export const HOCON_ACCEPT = ".hocon,.json";

export interface NetworkFileActionsProps {
  /** Export the network as a .hocon file. Omitted hides the button. */
  onExportHocon?: () => void;
  /** Open a chosen file. Omitted hides the button. */
  onImport?: (file: File) => void;
  /** Why export is unavailable, for the tooltip. Renders it disabled rather than gone. */
  exportDisabledReason?: string;
  /** What import does on this page, since it differs between the Editor and Home. */
  importTooltip?: string;
  /** Matches the surrounding buttons. */
  size?: number;
}

const NetworkFileActions = ({
  onExportHocon,
  onImport,
  exportDisabledReason,
  importTooltip = "Import an agent network from a .hocon file",
  size = 40,
}: NetworkFileActionsProps) => {
  const theme = useTheme();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const buttonSx = {
    width: size,
    height: size,
    backgroundColor: alpha(theme.palette.background.paper, 0.95),
    backdropFilter: "blur(8px)",
    border: `1px solid ${theme.palette.divider}`,
    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
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

  // Deliberately smaller than the button, so a row of these reads as a compact
  // toolbar rather than as full-size page actions.
  const iconSx = { fontSize: Math.round(size * 0.5) } as const;

  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
      {onExportHocon && (
        <Tooltip title={exportDisabledReason ?? "Export as .hocon"}>
          {/* The span keeps the tooltip alive while the button is disabled. */}
          <span style={{ display: "inline-flex" }}>
            <IconButton
              disabled={Boolean(exportDisabledReason)}
              aria-label="Export agent network"
              onClick={onExportHocon}
              sx={buttonSx}
            >
              <ExportIcon sx={iconSx} />
            </IconButton>
          </span>
        </Tooltip>
      )}

      {onImport && (
        <>
          <Tooltip title={importTooltip}>
            <IconButton
              aria-label="Import agent network"
              onClick={() => inputRef.current?.click()}
              sx={buttonSx}
            >
              <ImportIcon sx={iconSx} />
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
