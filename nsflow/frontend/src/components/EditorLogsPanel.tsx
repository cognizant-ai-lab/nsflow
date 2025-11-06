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

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { 
  Box, 
  Paper, 
  Typography, 
  IconButton, 
  useTheme,
  alpha,
  Collapse 
} from "@mui/material";
import { 
  ExpandLess as ChevronUpIcon,
  ExpandMore as ChevronDownIcon,
  Terminal as TerminalIcon,
  Clear as ClearIcon,
  PushPin as PinIcon,
  PushPinOutlined as UnpinIcon
} from "@mui/icons-material";
import LogsPanel from "./LogsPanel";

const EditorLogsPanel: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [sidebarWidth, setSidebarWidth] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();

  // Track sidebar width for dynamic positioning
  useEffect(() => {
    const updateSidebarWidth = () => {
      // Find the sidebar container more reliably - look for EditorSidebar's Paper element
      const sidebarContainer = document.querySelector('[data-panel-group] > [data-panel]:first-child') as HTMLElement;
      
      if (sidebarContainer) {
        const width = sidebarContainer.offsetWidth;
        setSidebarWidth(width);
      } else {
        // Fallback to a percentage-based calculation if we can't find the exact element
        const screenWidth = window.innerWidth;
        const estimatedSidebarWidth = Math.max(screenWidth * 0.15, 160); // 15% of screen or min 160px
        setSidebarWidth(estimatedSidebarWidth);
      }
    };

    // Initial measurement with a slight delay to ensure DOM is ready
    const timer = setTimeout(updateSidebarWidth, 100);

    // Listen for window resize
    window.addEventListener('resize', updateSidebarWidth);

    // Use MutationObserver to detect when panels are resized
    const observer = new MutationObserver(updateSidebarWidth);
    const panelGroup = document.querySelector('[data-panel-group]');
    
    if (panelGroup) {
      observer.observe(panelGroup, { 
        attributes: true, 
        childList: true, 
        subtree: true,
        attributeFilter: ['style']
      });
    }

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateSidebarWidth);
      observer.disconnect();
    };
  }, []);

  // Handle clicking outside to collapse when not pinned
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        if (isExpanded && !isPinned) {
          setIsExpanded(false);
        }
      }
    };

    if (isExpanded && !isPinned) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isExpanded, isPinned]);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const togglePinned = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the expand/collapse
    setIsPinned(!isPinned);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <Paper
      ref={panelRef}
      elevation={8}
      sx={{
        position: 'fixed',
        bottom: 16,
        left: sidebarWidth + 16, // Position just after sidebar edge with 16px gap
        zIndex: theme.zIndex.drawer + 1, // Above all drawers and palettes
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 2,
        transition: 'all 0.3s ease-in-out',
        width: isExpanded ? 800 : 80, // Increased expanded width from 384 to 500
        height: isExpanded ? 360 : 40, // Slightly increased height too
        overflow: 'hidden'
      }}
    >
      {/* Header/Toggle Button */}
      <Box
        onClick={toggleExpanded}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1,
          cursor: 'pointer',
          borderBottom: isExpanded ? `1px solid ${theme.palette.divider}` : 'none',
          '&:hover': {
            backgroundColor: alpha(theme.palette.primary.main, 0.05)
          }
        }}
      >
        {isExpanded ? (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TerminalIcon sx={{ color: theme.palette.success.main, fontSize: 16 }} />
              <Typography variant="body2" sx={{ 
                color: theme.palette.text.primary,
                fontWeight: 500,
                fontSize: '0.8rem'
              }}>
                Logs
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {logs.length > 0 && (
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearLogs();
                  }}
                  sx={{
                    color: theme.palette.text.secondary,
                    '&:hover': { color: theme.palette.text.primary },
                    p: 0.5
                  }}
                  title="Minimize logs"
                >
                  <ClearIcon sx={{ fontSize: 14 }} />
                </IconButton>
              )}
              <IconButton
                size="small"
                onClick={togglePinned}
                sx={{
                  color: isPinned ? theme.palette.primary.main : theme.palette.text.secondary,
                  '&:hover': { 
                    color: isPinned ? theme.palette.primary.dark : theme.palette.text.primary,
                    backgroundColor: alpha(theme.palette.primary.main, 0.1)
                  },
                  p: 0.5
                }}
                title={isPinned ? "Unpin (auto-close on outside click)" : "Pin (stay open)"}
              >
                {isPinned ? (
                  <PinIcon sx={{ fontSize: 14 }} />
                ) : (
                  <UnpinIcon sx={{ fontSize: 14 }} />
                )}
              </IconButton>
              <ChevronDownIcon sx={{ color: theme.palette.text.secondary, fontSize: 16 }} />
            </Box>
          </>
        ) : (
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 0.5, 
            width: '100%', 
            justifyContent: 'center' 
          }}>
            <TerminalIcon sx={{ color: theme.palette.success.main, fontSize: 16 }} />
            <Typography variant="caption" sx={{ 
              color: theme.palette.text.primary,
              fontSize: '0.65rem'
            }}>
              Logs
            </Typography>
            <ChevronUpIcon sx={{ color: theme.palette.text.secondary, fontSize: 12 }} />
          </Box>
        )}
      </Box>

      {/* Expanded Content */}
      <Collapse in={isExpanded} timeout={300}>
        <Box sx={{ 
          height: 312, // 360 - 48 (header height)
          overflow: 'hidden',
          backgroundColor: theme.palette.background.default
        }}>
          <LogsPanel />
        </Box>
      </Collapse>

      {/* Collapsed state indicator */}
      {!isExpanded && logs.length > 0 && (
        <Box sx={{
          position: 'absolute',
          top: -4,
          right: -4,
          width: 12,
          height: 12,
          backgroundColor: theme.palette.error.main,
          borderRadius: '50%',
          animation: 'pulse 2s infinite',
          '@keyframes pulse': {
            '0%': { opacity: 1 },
            '50%': { opacity: 0.5 },
            '100%': { opacity: 1 }
          }
        }} />
      )}
    </Paper>
  );
};

export default EditorLogsPanel;
