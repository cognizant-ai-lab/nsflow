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

import * as React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Box,
  Paper,
  Typography,
  IconButton,
  useTheme,
  alpha,
  Fade,
  Tooltip,
} from "@mui/material";
import {
  Terminal as TerminalIcon,
  AccountTreeTwoTone as FlowIcon,
  PushPin as PinIcon,
  PushPinOutlined as UnpinIcon,
  OpenInFull as ResizeIcon,
} from "@mui/icons-material";
import RepartitionIcon from '@mui/icons-material/Repartition';
import LogsPanel from "../LogsPanel";
import CruseAgentFlowPanel from "./CruseAgentFlowPanel";

type TabType = 'logs' | 'flow';

const PANEL_SIZE_KEY = 'cruse_floating_panel_size';
const DEFAULT_WIDTH = 500;
const ASPECT_RATIO = DEFAULT_WIDTH / 480; // width / height
const MIN_WIDTH = 400;
const MAX_WIDTH = 1200;

export interface CruseFloatingPanelProps {
  leftOffset?: number;
  activeNetwork: string;
}

const SIDEBAR_COLLAPSED_KEY = 'cruse_thread_list_collapsed';
const SIDEBAR_EXPANDED_OFFSET = 328; // 280 + 24*2
const SIDEBAR_COLLAPSED_OFFSET = 108; // 60 + 24*2

const CruseFloatingPanel: React.FC<CruseFloatingPanelProps> = ({ activeNetwork }) => {
  const [activeTab, setActiveTab] = useState<TabType | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  const [hasOpenedFlow, setHasOpenedFlow] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();

  // Track sidebar collapsed state for dynamic left offset
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  });

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === SIDEBAR_COLLAPSED_KEY) {
        setSidebarCollapsed(e.newValue === 'true');
      }
    };
    window.addEventListener('storage', handleStorage);

    // Also poll briefly since storage events don't fire in the same tab
    const interval = setInterval(() => {
      const val = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
      setSidebarCollapsed(prev => prev !== val ? val : prev);
    }, 200);

    return () => {
      window.removeEventListener('storage', handleStorage);
      clearInterval(interval);
    };
  }, []);

  const leftOffset = sidebarCollapsed ? SIDEBAR_COLLAPSED_OFFSET : SIDEBAR_EXPANDED_OFFSET;

  // Persisted panel size
  const [expandedWidth, setExpandedWidth] = useState(() => {
    const stored = localStorage.getItem(PANEL_SIZE_KEY);
    return stored ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Number(stored))) : DEFAULT_WIDTH;
  });
  const expandedHeight = Math.round(expandedWidth / ASPECT_RATIO);

  const isExpanded = activeTab !== null;

  // Resize drag handler
  const [isResizing, setIsResizing] = useState(false);
  const resizeStart = useRef({ x: 0, y: 0, width: 0 });

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStart.current = { x: e.clientX, y: e.clientY, width: expandedWidth };

    const handleMouseMove = (ev: MouseEvent) => {
      // Drag toward top-right: dx positive = wider, dy negative = taller
      const dx = ev.clientX - resizeStart.current.x;
      const dy = resizeStart.current.y - ev.clientY;
      // Use the larger delta to maintain aspect ratio
      const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeStart.current.width + delta));
      setExpandedWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      // Persist on release
      setExpandedWidth((w) => {
        localStorage.setItem(PANEL_SIZE_KEY, String(w));
        return w;
      });
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [expandedWidth]);

  // Lazy-mount flow on first open
  useEffect(() => {
    if (activeTab === 'flow' && !hasOpenedFlow) {
      setHasOpenedFlow(true);
    }
  }, [activeTab, hasOpenedFlow]);

  // Close on outside click when not pinned
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        if (isExpanded && !isPinned) {
          setActiveTab(null);
        }
      }
    };

    if (isExpanded && !isPinned) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isExpanded, isPinned]);

  const handleTabClick = (tab: TabType) => {
    if (activeTab === tab) {
      setActiveTab(null);
    } else {
      setActiveTab(tab);
    }
  };

  const tabButtonSx = (tab: TabType) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0.5,
    cursor: 'pointer',
    px: 1.5,
    py: 0.75,
    borderRadius: 1,
    transition: 'all 0.2s ease',
    backgroundColor: activeTab === tab
      ? alpha(theme.palette.primary.main, 0.15)
      : 'transparent',
    border: `1px solid ${activeTab === tab ? alpha(theme.palette.primary.main, 0.3) : 'transparent'}`,
    '&:hover': {
      backgroundColor: activeTab === tab
        ? alpha(theme.palette.primary.main, 0.2)
        : alpha(theme.palette.action.hover, 0.08),
    },
  });

  const COLLAPSED_WIDTH = 160;
  const COLLAPSED_HEIGHT = 40;

  return (
    <Paper
      ref={panelRef}
      elevation={8}
      sx={{
        position: 'fixed',
        bottom: 24,
        left: leftOffset + 16,
        zIndex: theme.zIndex.drawer + 1,
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 2,
        transition: isResizing ? 'none' : 'all 0.15s ease-in-out',
        width: isExpanded ? expandedWidth : COLLAPSED_WIDTH,
        height: isExpanded ? expandedHeight : COLLAPSED_HEIGHT,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Tab Bar - always visible */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          p: 0.5,
          gap: 0.5,
          borderBottom: isExpanded ? `1px solid ${theme.palette.divider}` : 'none',
          minHeight: COLLAPSED_HEIGHT,
          flexShrink: 0,
        }}
      >
        {/* Logs tab button */}
        <Box onClick={() => handleTabClick('logs')} sx={tabButtonSx('logs')}>
          <TerminalIcon sx={{
            fontSize: 16,
            color: activeTab === 'logs' ? theme.palette.success.main : theme.palette.text.secondary,
          }} />
          <Typography variant="caption" sx={{
            fontSize: '0.65rem',
            fontWeight: activeTab === 'logs' ? 600 : 400,
            color: activeTab === 'logs' ? theme.palette.text.primary : theme.palette.text.secondary,
          }}>
            Logs
          </Typography>
        </Box>

        {/* Vertical separator */}
        <Box sx={{
          width: '1px',
          height: 20,
          backgroundColor: theme.palette.divider,
          flexShrink: 0,
        }} />

        {/* Flow tab button */}
        <Box onClick={() => handleTabClick('flow')} sx={tabButtonSx('flow')}>
          <FlowIcon sx={{
            fontSize: 16,
            color: activeTab === 'flow' ? theme.palette.primary.main : theme.palette.text.secondary,
          }} />
          <Typography variant="caption" sx={{
            fontSize: '0.65rem',
            fontWeight: activeTab === 'flow' ? 600 : 400,
            color: activeTab === 'flow' ? theme.palette.text.primary : theme.palette.text.secondary,
          }}>
            Flow
          </Typography>
        </Box>

        {/* Spacer + Pin + Resize (only when expanded) */}
        {isExpanded && (
          <>
            <Box sx={{ flex: 1 }} />
            <Tooltip title={isPinned ? "Unpin (auto-close on outside click)" : "Pin (stay open)"} placement="top" arrow>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPinned(!isPinned);
                }}
                sx={{
                  color: isPinned ? theme.palette.primary.main : theme.palette.text.secondary,
                  '&:hover': {
                    color: isPinned ? theme.palette.primary.dark : theme.palette.text.primary,
                    backgroundColor: alpha(theme.palette.primary.main, 0.1),
                  },
                  p: 0.5,
                }}
              >
                {isPinned ? (
                  <PinIcon sx={{ fontSize: 18 }} />
                ) : (
                  <UnpinIcon sx={{ fontSize: 18 }} />
                )}
              </IconButton>
            </Tooltip>
            <Tooltip title="Drag to resize" placement="top" arrow>
              <Box
                onMouseDown={handleResizeMouseDown}
                sx={{
                  ml: 0.5,
                  cursor: 'nesw-resize',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  p: 0.25,
                  borderRadius: 0.5,
                  color: theme.palette.text.secondary,
                  transition: 'all 0.15s ease',
                  '&:hover': {
                    color: theme.palette.primary.main,
                    backgroundColor: alpha(theme.palette.primary.main, 0.1),
                  },
                }}
              >
                <ResizeIcon sx={{ fontSize: 18 }} />
              </Box>
            </Tooltip>
          </>
        )}
      </Box>

      {/* Content Area */}
      {isExpanded && (
        <Box sx={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: theme.palette.background.default,
        }}>
          {/* Logs content */}
          <Fade in={activeTab === 'logs'} timeout={120}>
            <Box sx={{
              position: 'absolute',
              inset: 0,
              display: activeTab === 'logs' ? 'block' : 'none',
              overflow: 'hidden',
            }}>
              <LogsPanel />
            </Box>
          </Fade>

          {/* Flow content - lazy mounted */}
          {hasOpenedFlow && (
            <Fade in={activeTab === 'flow'} timeout={120}>
              <Box sx={{
                position: 'absolute',
                inset: 0,
                display: activeTab === 'flow' ? 'block' : 'none',
              }}>
                <CruseAgentFlowPanel network={activeNetwork} />
              </Box>
            </Fade>
          )}

          {/* Reset size button - bottom left, only when resized */}
          {expandedWidth !== DEFAULT_WIDTH && (
            <Tooltip title="Reset to default size" placement="right" arrow>
              <IconButton
                size="small"
                onClick={() => {
                  setExpandedWidth(DEFAULT_WIDTH);
                  localStorage.setItem(PANEL_SIZE_KEY, String(DEFAULT_WIDTH));
                }}
                sx={{
                  position: 'absolute',
                  bottom: 2,
                  left: 2,
                  zIndex: 10,
                  color: theme.palette.text.secondary,
                  backgroundColor: alpha(theme.palette.background.paper, 0.8),
                  backdropFilter: 'blur(4px)',
                  border: `1px solid ${theme.palette.divider}`,
                  p: 0.5,
                  '&:hover': {
                    color: theme.palette.primary.main,
                    backgroundColor: alpha(theme.palette.background.paper, 0.95),
                  },
                }}
              >
                <RepartitionIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}
    </Paper>
  );
};

export default CruseFloatingPanel;
