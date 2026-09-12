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
 * The editor's node library, as a floating notch on the edge of the canvas.
 *
 * It used to be a permanent drawer holding a fixed slice of the width whether or not
 * anyone was using it. Here it is a small vertical pill of icons: one to add an
 * agent, and one per source of things to reference. Each source opens a short
 * searchable list beside its icon and closes again on a click anywhere else, so the
 * canvas keeps the space.
 *
 * Everything can be clicked or dragged. A click is quicker and is the only way in
 * when the canvas is empty and there is nothing to drop onto; a drag lets the user
 * pick the parent. The canvas owns the mutation either way.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  Box,
  Chip,
  ClickAwayListener,
  Divider,
  Grow,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Popper,
  Stack,
  TextField,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import NetworkIcon from "@mui/icons-material/AccountTree";
import AddIcon from "@mui/icons-material/Add";
import ClearIcon from "@mui/icons-material/Clear";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import ToolboxIcon from "@mui/icons-material/Handyman";
import McpIcon from "@mui/icons-material/Hub";
import SearchIcon from "@mui/icons-material/Search";

import { useApiPort } from "../context/ApiPortContext";
import {
  FRONTMAN_ITEM,
  NEW_AGENT_ITEM,
  PALETTE_DRAG_TYPE,
  type PaletteCategory,
  type PaletteItem,
  fetchPaletteItems,
  groupByCategory,
  rankPaletteItems,
} from "../state/paletteSources";

/** The three sources that open a list, in the order they appear on the notch. */
/**
 * One entry per source, with a colour of its own.
 *
 * Fixed pastels rather than palette roles: the rail is dark in both themes, so a
 * theme-derived colour would either wash out on it or change meaning between modes.
 * These are light enough to read on the dark rail and distinct enough to tell the
 * three sources apart at a glance.
 */
const SOURCES: Array<{
  category: PaletteCategory;
  icon: ReactElement;
  empty: string;
  color: string;
}> = [
  {
    category: "Agent Networks",
    icon: <NetworkIcon />,
    empty: "No other agent networks to reference yet.",
    color: "#8ec5ff",
  },
  {
    category: "Toolbox",
    icon: <ToolboxIcon />,
    empty: "No toolbox tools configured.",
    color: "#ffd28a",
  },
  {
    category: "MCP Servers",
    icon: <McpIcon />,
    empty: "No MCP servers connected.",
    color: "#c3b1f5",
  },
];

/**
 * How tall an open list may be.
 *
 * Deliberately close to the height of the notch itself, so the list reads as
 * belonging to it rather than as a panel that has taken over the canvas.
 */
const LIST_MAX_HEIGHT = 240;
const LIST_WIDTH = 270;
const NOTCH_BUTTON_SIZE = 44;

interface EditorPaletteProps {
  /** The network being edited, excluded from the draggable networks list. */
  selectedNetwork?: string;
  /**
   * True while the canvas has no frontman. The add button then offers the frontman,
   * since a network has exactly one and it has to come first.
   */
  needsFrontman: boolean;
  /**
   * Why nothing can be added right now, or undefined when it can. Set when the
   * selected agent cannot take a down-chain agent, which is true of a toolbox tool
   * and of an external reference.
   */
  disabledReason?: string;
  /** Put an item on the canvas. The canvas decides what it attaches to. */
  onAddItem: (item: PaletteItem) => void;
}

const EditorPalette = ({
  selectedNetwork,
  needsFrontman,
  disabledReason,
  onAddItem,
}: EditorPaletteProps) => {
  const theme = useTheme();
  const { apiUrl, isReady } = useApiPort();

  const [loaded, setLoaded] = useState<PaletteItem[]>([]);
  const [openCategory, setOpenCategory] = useState<PaletteCategory | null>(null);
  const [query, setQuery] = useState("");
  const anchors = useRef<Partial<Record<PaletteCategory, HTMLElement | null>>>({});

  // The add button offers the frontman on a blank canvas and a plain agent after
  // that, which is the only thing about it that changes.
  const addItem = needsFrontman ? FRONTMAN_ITEM : NEW_AGENT_ITEM;

  // Loaded on first use rather than on mount, and refreshed whenever a list opens, so
  // a network generated since the last look shows up.
  useEffect(() => {
    if (!openCategory || !isReady || !apiUrl) return;
    let cancelled = false;
    fetchPaletteItems(apiUrl, selectedNetwork).then((items) => {
      if (!cancelled) setLoaded(items);
    });
    return () => {
      cancelled = true;
    };
  }, [openCategory, isReady, apiUrl, selectedNetwork]);

  const grouped = useMemo(() => groupByCategory(rankPaletteItems(loaded, query)), [loaded, query]);

  const closeList = useCallback(() => {
    setOpenCategory(null);
    setQuery("");
  }, []);

  // A list left open when the last agent goes must not stay open over a canvas that
  // can no longer accept anything from it.
  useEffect(() => {
    if (needsFrontman && openCategory) closeList();
  }, [needsFrontman, openCategory, closeList]);

  const toggleList = useCallback((category: PaletteCategory) => {
    setQuery("");
    setOpenCategory((current) => (current === category ? null : category));
  }, []);

  const onDragStart = useCallback(
    (event: React.DragEvent, item: PaletteItem) => {
      if (disabledReason) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.setData(PALETTE_DRAG_TYPE, JSON.stringify(item));
      event.dataTransfer.effectAllowed = "move";
    },
    [disabledReason]
  );

  const handleAdd = useCallback(
    (item: PaletteItem) => {
      if (disabledReason) return;
      onAddItem(item);
      closeList();
    },
    [disabledReason, onAddItem, closeList]
  );

  /** One row of an open list: click to add, or drag onto a particular agent. */
  const renderRow = (item: PaletteItem) => (
    <Box
      key={`${item.category}:${item.agentName}`}
      draggable={!disabledReason}
      onDragStart={(event) => onDragStart(event, item)}
      sx={{ "&:hover .palette-drag-handle": { opacity: 1 } }}
    >
      <ListItemButton
        dense
        disabled={Boolean(disabledReason)}
        onClick={() => handleAdd(item)}
        sx={{
          cursor: disabledReason ? "not-allowed" : "grab",
          borderRadius: 1.5,
          py: 0.5,
          px: 1,
          alignItems: "flex-start",
          gap: 0.75,
          "&:active": { cursor: disabledReason ? "not-allowed" : "grabbing" },
        }}
      >
        <DragIndicatorIcon
          className="palette-drag-handle"
          sx={{
            mt: 0.125,
            fontSize: 16,
            opacity: 0.25,
            transition: "opacity 120ms",
            color: "text.secondary",
          }}
        />
        <ListItemText
          primary={
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
              <Typography variant="caption" sx={{ fontWeight: 700 }} noWrap title={item.agentName}>
                {item.label}
              </Typography>
              {item.needsReauth && (
                <Chip
                  size="small"
                  color="warning"
                  variant="outlined"
                  label="reconnect"
                  sx={{ height: 18 }}
                />
              )}
            </Stack>
          }
          secondary={item.description}
          slotProps={{
            secondary: {
              variant: "caption",
              sx: {
                display: "-webkit-box",
                WebkitLineClamp: 1,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                fontSize: "0.68rem",
                lineHeight: 1.35,
              },
            },
          }}
        />
      </ListItemButton>
    </Box>
  );

  // The rail is dark in both themes, so these are keyed to the rail rather than to
  // the app's text palette, which would be unreadable on it under the light theme.
  const notchButtonSx = {
    width: NOTCH_BUTTON_SIZE,
    height: NOTCH_BUTTON_SIZE,
    color: alpha(theme.palette.common.white, 0.72),
    "&:hover": {
      backgroundColor: alpha(theme.palette.common.white, 0.14),
      color: theme.palette.common.white,
    },
  } as const;

  return (
    <ClickAwayListener onClickAway={closeList}>
      <Box
        sx={{
          position: "absolute",
          left: 16,
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 15,
        }}
      >
        <Paper
          elevation={8}
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 0.5,
            p: 0.75,
            // A pill rather than a panel: the notch should read as floating over the
            // canvas, not as a region carved out of it. Tinted away from the paper
            // colour every other surface uses, so it reads as a tool rail.
            borderRadius: 6,
            backgroundColor:
              theme.palette.mode === "dark"
                ? alpha(theme.palette.common.black, 0.72)
                : alpha(theme.palette.grey[900], 0.9),
            backdropFilter: "blur(10px)",
            border: `1px solid ${alpha(theme.palette.common.white, 0.12)}`,
            boxShadow: `0 8px 24px ${alpha(theme.palette.common.black, 0.45)}`,
          }}
        >
          <Tooltip
            placement="right"
            title={
              disabledReason ??
              (needsFrontman
                ? "Add the frontman, the agent a user interfaces with"
                : "Add an agent. Click to attach it to the selection, or drag it onto an agent")
            }
          >
            {/* The span keeps the tooltip alive while the button is disabled. */}
            <span style={{ display: "inline-flex" }}>
              <Box
                draggable={!disabledReason}
                onDragStart={(event) => onDragStart(event, addItem)}
                sx={{ display: "inline-flex" }}
              >
                <IconButton
                  disabled={Boolean(disabledReason)}
                  onClick={() => handleAdd(addItem)}
                  aria-label={needsFrontman ? "Add frontman" : "Add agent"}
                  sx={{
                    ...notchButtonSx,
                    cursor: disabledReason ? "not-allowed" : "grab",
                    color: theme.palette.success.light,
                    backgroundColor: alpha(theme.palette.success.main, 0.22),
                    "&:hover": { backgroundColor: alpha(theme.palette.success.main, 0.38) },
                  }}
                >
                  <AddIcon />
                </IconButton>
              </Box>
            </span>
          </Tooltip>

          <Divider flexItem sx={{ my: 0.25, borderColor: alpha(theme.palette.common.white, 0.14) }} />

          {SOURCES.map((source) => (
            <Tooltip
              key={source.category}
              placement="right"
              title={
                needsFrontman
                  ? "Add the frontman first: everything else attaches to it"
                  : source.category
              }
            >
              {/* The span keeps the tooltip alive while the button is disabled. */}
              <span style={{ display: "inline-flex" }}>
                <IconButton
                  ref={(element) => {
                    anchors.current[source.category] = element;
                  }}
                  // Nothing can be referenced before there is an agent to attach it
                  // to, and the first agent has to be the frontman.
                  disabled={needsFrontman}
                  onClick={() => toggleList(source.category)}
                  aria-label={source.category}
                  sx={{
                    ...notchButtonSx,
                    color: source.color,
                    backgroundColor: alpha(source.color, 0.14),
                    "&:hover": { backgroundColor: alpha(source.color, 0.3), color: source.color },
                    "&.Mui-disabled": {
                      color: alpha(source.color, 0.3),
                      backgroundColor: alpha(theme.palette.common.white, 0.05),
                    },
                    ...(openCategory === source.category && {
                      backgroundColor: alpha(source.color, 0.4),
                      color: theme.palette.common.white,
                    }),
                  }}
                >
                  {source.icon}
                </IconButton>
              </span>
            </Tooltip>
          ))}
        </Paper>

        <Popper
          open={Boolean(openCategory)}
          anchorEl={openCategory ? anchors.current[openCategory] : null}
          placement="right"
          transition
          modifiers={[{ name: "offset", options: { offset: [0, 12] } }]}
          sx={{ zIndex: 16 }}
        >
          {({ TransitionProps }) => (
            // Grows out of the icon it belongs to rather than fading in place, which
            // reads as the notch opening rather than a panel appearing over it.
            <Grow {...TransitionProps} timeout={180} style={{ transformOrigin: "left center" }}>
              <Paper
                elevation={10}
                sx={{
                  width: LIST_WIDTH,
                  borderRadius: 3,
                  overflow: "hidden",
                  border: `1px solid ${theme.palette.divider}`,
                  backgroundColor: alpha(theme.palette.background.paper, 0.98),
                  backdropFilter: "blur(8px)",
                }}
              >
                <Box sx={{ px: 1.25, pt: 1.25, pb: 0.75 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, display: "block", mb: 0.75 }}>
                    {openCategory} ({openCategory ? (grouped.get(openCategory) ?? []).length : 0})
                  </Typography>
                  <TextField
                    size="small"
                    fullWidth
                    autoFocus
                    placeholder="Search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon fontSize="small" />
                          </InputAdornment>
                        ),
                        endAdornment: query ? (
                          <InputAdornment position="end">
                            <IconButton
                              size="small"
                              onClick={() => setQuery("")}
                              aria-label="Clear search"
                            >
                              <ClearIcon fontSize="small" />
                            </IconButton>
                          </InputAdornment>
                        ) : undefined,
                      },
                    }}
                  />
                </Box>

                <Box sx={{ maxHeight: LIST_MAX_HEIGHT, overflowY: "auto", px: 0.75, pb: 0.75 }}>
                  {(() => {
                    const items = openCategory ? grouped.get(openCategory) ?? [] : [];
                    if (items.length > 0) return <List disablePadding>{items.map(renderRow)}</List>;
                    return (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ px: 1, py: 1, display: "block" }}
                      >
                        {query
                          ? "Nothing matches that search."
                          : SOURCES.find((source) => source.category === openCategory)?.empty}
                      </Typography>
                    );
                  })()}
                </Box>

                {disabledReason && (
                  <Box sx={{ px: 1.5, py: 1, borderTop: `1px solid ${theme.palette.divider}` }}>
                    <Typography variant="caption" color="warning.main">
                      {disabledReason}
                    </Typography>
                  </Box>
                )}
              </Paper>
            </Grow>
          )}
        </Popper>
      </Box>
    </ClickAwayListener>
  );
};

export default EditorPalette;
