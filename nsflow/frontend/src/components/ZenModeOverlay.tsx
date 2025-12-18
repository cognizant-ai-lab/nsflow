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

import { useEffect, useState, useMemo, useCallback, memo } from "react";
import { ReactFlowProvider } from "reactflow";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  alpha,
  Fade,
  Chip,
  Tabs,
  Tab,
  Theme,
} from "@mui/material";
import {
  Close as CloseIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  RestartAlt as ResetZoomIcon,
  Hub as NetworkIcon,
} from "@mui/icons-material";
import { useZenMode } from "../hooks/useZenMode";
import { useChatContext } from "../context/ChatContext";
import { useTheme } from "../context/ThemeContext";
import ZenModeAgentFlow from "./ZenModeAgentFlow";
import ZenModeChat from "./ZenModeChat";
import ZenModeSettings from "./ZenModeSettings";
import InternalChatPanel from "./InternalChatPanel";
import ConfigPanel from "./ConfigPanel";
import LogsPanel from "./LogsPanel";
import SlyDataPanel from "./slydata/EditorSlyDataPanel";

// Memoized Tabs component to prevent re-renders on hover
const ZenModeTabs = memo(({ 
  activeTab, 
  onTabChange, 
  showInternalChat, 
  showConfigPanel, 
  showSlyDataPanel, 
  showLogsPanel,
  theme 
}: {
  activeTab: number;
  onTabChange: (event: React.SyntheticEvent, newValue: number) => void;
  showInternalChat: boolean;
  showConfigPanel: boolean;
  showSlyDataPanel: boolean;
  showLogsPanel: boolean;
  theme: Theme;
}) => {
  return (
    <Tabs
      value={activeTab}
      onChange={onTabChange}
      variant="standard"
      sx={{
        minHeight: 36,
        borderBottom: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
        // Prevent layout shifts
        position: "relative",
        width: "100%",
        "& .MuiTab-root": {
          minHeight: 36,
          py: 0.5,
          px: 1.5,
          fontSize: "0.75rem",
          textTransform: "none",
          color: theme.palette.text.secondary,
          "&.Mui-selected": {
            color: theme.palette.primary.main,
          },
          // Prevent width changes on hover
          minWidth: "auto",
          flexShrink: 0,
        },
        "& .MuiTabs-indicator": {
          backgroundColor: theme.palette.primary.main,
        },
      }}
    >
      <Tab label="Chat" />
      {showInternalChat && <Tab label="Internal" />}
      {showConfigPanel && <Tab label="Config" />}
      {showSlyDataPanel && <Tab label="Sly Data" />}
      {showLogsPanel && <Tab label="Logs" />}
    </Tabs>
  );
});

ZenModeTabs.displayName = "ZenModeTabs";

const ZenModeOverlay = () => {
  const {
    isZenMode,
    isTransitioning,
    exitZenMode,
    config,
    zoomLevel,
    zoomIn,
    zoomOut,
    resetZoom,
  } = useZenMode();
  const { activeNetwork } = useChatContext();
  const { theme } = useTheme();
  const [isVisible, setIsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  // Check if any advanced panel is enabled
  const hasAdvancedPanels = 
    config.features.showInternalChat || 
    config.features.showConfigPanel || 
    config.features.showSlyDataPanel || 
    config.features.showLogsPanel;

  // Reset to Chat tab when all advanced panels are disabled
  useEffect(() => {
    if (!hasAdvancedPanels && activeTab !== 0) {
      setActiveTab(0);
    }
  }, [hasAdvancedPanels, activeTab]);

  // Memoize tab change handler
  const handleTabChange = useCallback((_: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  }, []);

  // Memoize which panel to render based on activeTab
    const tabContent = useMemo(() => {
        const tabs = [
        { key: 'chat', component: <ZenModeChat />, always: true },
        { key: 'internal', component: <InternalChatPanel />, show: config.features.showInternalChat },
        { key: 'config', component: <ConfigPanel selectedNetwork={activeNetwork || ""} />, show: config.features.showConfigPanel },
        { key: 'slydata', component: <SlyDataPanel />, show: config.features.showSlyDataPanel },
        { key: 'logs', component: <LogsPanel />, show: config.features.showLogsPanel },
        ];
        
        const visibleTabs = tabs.filter(t => t.always || t.show);
        return visibleTabs[activeTab]?.component || <ZenModeChat />;
    }, [activeTab, config.features, activeNetwork]);
  // Theme-aware colors based on current MUI theme
  const isDark = theme.palette.mode === 'dark';
  const themeAwareColors = useMemo(() => {
    if (isDark) {
      // Dark theme - use config colors
      return {
        backgroundGradient: config.theme.backgroundGradient,
        headerBackground: config.theme.headerBackground,
        agentFlowBackground: config.theme.agentFlowBackground,
        agentFlowBorder: config.theme.agentFlowBorder,
        chatBackground: config.theme.chatBackground,
        chatBorder: config.theme.chatBorder,
      };
    } else {
      // Light theme - use theme-aware colors
      return {
        backgroundGradient: `linear-gradient(135deg, ${theme.palette.background.default} 0%, ${theme.palette.background.paper} 50%, ${theme.palette.background.default} 100%)`,
        headerBackground: alpha(theme.palette.background.paper, 0.95),
        agentFlowBackground: 'transparent',
        agentFlowBorder: alpha(theme.palette.primary.main, 0.2),
        chatBackground: alpha(theme.palette.background.paper, 0.98),
        chatBorder: alpha(theme.palette.primary.main, 0.3),
      };
    }
  }, [isDark, theme, config.theme]);

  // Handle visibility with animation timing
  useEffect(() => {
    if (isZenMode) {
      setIsVisible(true);
    } else if (!isTransitioning) {
      const timer = setTimeout(() => setIsVisible(false), config.features.transitionDuration);
      return () => clearTimeout(timer);
    }
  }, [isZenMode, isTransitioning, config.features.transitionDuration]);

  if (!isVisible && !isZenMode) return null;

  const transitionStyle = {
    opacity: isZenMode && !isTransitioning ? 1 : 0,
    transform: isZenMode && !isTransitioning 
      ? 'scale(1)' 
      : `scale(${config.features.scaleFrom})`,
    transition: `
      opacity ${config.features.fadeInDuration}ms cubic-bezier(0.4, 0, 0.2, 1),
      transform ${config.features.transitionDuration}ms cubic-bezier(0.4, 0, 0.2, 1)
    `,
  };

  return (
    <Box
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        background: themeAwareColors.backgroundGradient,
        ...transitionStyle,
      }}
    >
      {/* Ambient Background Effects */}
      <Box
        sx={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: "none",
          overflow: "hidden",
          "&::before": {
            content: '""',
            position: "absolute",
            top: "-50%",
            left: "-50%",
            width: "200%",
            height: "200%",
            background: `
              radial-gradient(circle at 20% 30%, ${alpha(theme.palette.primary.main, isDark ? 0.08 : 0.05)} 0%, transparent 40%),
              radial-gradient(circle at 80% 70%, ${alpha(theme.palette.success.main, isDark ? 0.06 : 0.04)} 0%, transparent 40%)
            `,
            animation: "ambientFloat 20s ease-in-out infinite",
            "@keyframes ambientFloat": {
              "0%, 100%": { transform: "translate(0, 0) rotate(0deg)" },
              "33%": { transform: "translate(2%, 3%) rotate(1deg)" },
              "66%": { transform: "translate(-1%, -2%) rotate(-1deg)" },
            },
          },
        }}
      />

      {/* Header */}
      {config.features.showHeader && (
        <Fade in={isZenMode && !isTransitioning} timeout={config.features.fadeInDuration}>
          <Box
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: config.theme.headerHeight,
              background: themeAwareColors.headerBackground,
              backdropFilter: "blur(12px)",
              borderBottom: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              px: 3,
              zIndex: 10,
            }}
          >
            {/* Left - Network Info */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  px: 2,
                  py: 0.75,
                  borderRadius: 2,
                  background: alpha(theme.palette.primary.main, 0.1),
                  border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
                }}
              >
                <NetworkIcon
                  sx={{
                    fontSize: 20,
                    color: theme.palette.primary.main,
                  }}
                />
                <Typography
                  variant="subtitle1"
                  sx={{
                    fontWeight: 600,
                    color: theme.palette.text.primary,
                    letterSpacing: "0.5px",
                  }}
                >
                  {activeNetwork || "No Network Selected"}
                </Typography>
              </Box>

              {config.features.showConnectionStatus && activeNetwork && (
                <Chip
                  size="small"
                  label="Connected"
                  sx={{
                    backgroundColor: alpha(theme.palette.success.main, 0.15),
                    color: theme.palette.success.main,
                    border: `1px solid ${alpha(theme.palette.success.main, 0.3)}`,
                    fontWeight: 500,
                    "& .MuiChip-label": { px: 1.5 },
                    "&::before": {
                      content: '""',
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      backgroundColor: theme.palette.success.main,
                      marginRight: 1,
                      animation: "pulse 2s ease-in-out infinite",
                      "@keyframes pulse": {
                        "0%, 100%": { opacity: 1 },
                        "50%": { opacity: 0.4 },
                      },
                    },
                  }}
                />
              )}
            </Box>

            {/* Center - Title */}
            {config.features.showNetworkTitle && (
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 300,
                  color: alpha(theme.palette.text.primary, 0.7),
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  position: "absolute",
                  left: "50%",
                  transform: "translateX(-50%)",
                }}
              >
                Zen Mode
              </Typography>
            )}

            {/* Right - Controls */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {/* Zoom Controls */}
              {config.features.enableZoomControls && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    px: 1.5,
                    py: 0.5,
                    borderRadius: 2,
                    background: alpha(theme.palette.background.paper, 0.3),
                    border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
                  }}
                >
                  <Tooltip title="Zoom Out (-)">
                    <IconButton
                      size="small"
                      onClick={zoomOut}
                      sx={{ color: theme.palette.text.secondary }}
                    >
                      <ZoomOutIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>

                  <Typography
                    variant="caption"
                    sx={{
                      minWidth: 45,
                      textAlign: "center",
                      color: theme.palette.text.primary,
                      fontWeight: 500,
                    }}
                  >
                    {Math.round(zoomLevel * 100)}%
                  </Typography>

                  <Tooltip title="Zoom In (+)">
                    <IconButton
                      size="small"
                      onClick={zoomIn}
                      sx={{ color: theme.palette.text.secondary }}
                    >
                      <ZoomInIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>

                  <Tooltip title="Reset Zoom">
                    <IconButton
                      size="small"
                      onClick={resetZoom}
                      sx={{ color: theme.palette.text.secondary }}
                    >
                      <ResetZoomIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              )}

              {/* Zen Mode Settings */}
              <ZenModeSettings />

              {/* Exit Button */}
              <Tooltip title="Exit Zen Mode (Esc)">
                <IconButton
                  onClick={exitZenMode}
                  sx={{
                    ml: 1,
                    color: theme.palette.text.primary,
                    background: alpha(theme.palette.error.main, 0.1),
                    border: `1px solid ${alpha(theme.palette.error.main, 0.3)}`,
                    "&:hover": {
                      background: alpha(theme.palette.error.main, 0.2),
                      borderColor: theme.palette.error.main,
                    },
                  }}
                >
                  <CloseIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </Fade>
      )}

      {/* Floating Controls - Always visible when header is hidden */}
      {!config.features.showHeader && (
        <Box
          sx={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 10,
            display: "flex",
            gap: 1,
            background: alpha(theme.palette.background.paper, 0.9),
            backdropFilter: "blur(8px)",
            borderRadius: 2,
            p: 0.5,
            border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
          }}
        >
          <ZenModeSettings />
          <Tooltip title="Exit Zen Mode (Esc)">
            <IconButton
              size="small"
              onClick={exitZenMode}
              sx={{
                color: theme.palette.error.main,
                "&:hover": {
                  background: alpha(theme.palette.error.main, 0.1),
                },
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {/* Main Content */}
      <Box
        sx={{
          position: "absolute",
          top: config.features.showHeader ? config.theme.headerHeight : 0,
          left: 0,
          right: 0,
          bottom: 0,
          p: 2,
        }}
      >
        <PanelGroup direction="horizontal">
          {/* Agent Flow Panel */}
          {config.features.showAgentFlow && (
            <>
              <Panel
                defaultSize={100 - config.features.chatPanelWidth}
                minSize={30}
              >
                <Box
                  sx={{
                    height: "100%",
                    borderRadius: 3,
                    overflow: "hidden",
                    background: themeAwareColors.agentFlowBackground,
                    border: `1px solid ${themeAwareColors.agentFlowBorder}`,
                    boxShadow: `0 4px 24px ${alpha(theme.palette.common.black, isDark ? 0.2 : 0.1)}`,
                  }}
                >
                  <ReactFlowProvider>
                    <ZenModeAgentFlow zoomLevel={zoomLevel} />
                  </ReactFlowProvider>
                </Box>
              </Panel>
              <PanelResizeHandle
                style={{
                  width: 8,
                  background: "transparent",
                  cursor: "ew-resize",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Box
                  sx={{
                    width: 4,
                    height: 40,
                    borderRadius: 2,
                    background: alpha(theme.palette.primary.main, 0.3),
                    transition: "background 0.2s, height 0.2s",
                    "&:hover": {
                      background: config.theme.primaryAccent,
                      height: 60,
                    },
                  }}
                />
              </PanelResizeHandle>
            </>
          )}

          {/* Chat Panel */}
          {config.features.showChat && (
            <Panel
              defaultSize={config.features.chatPanelWidth}
              minSize={15}
              maxSize={50}
            >
                <Box
                  sx={{
                    height: "100%",
                    borderRadius: 3,
                    overflow: "hidden",
                    background: themeAwareColors.chatBackground,
                    border: `1px solid ${themeAwareColors.chatBorder}`,
                    boxShadow: `0 4px 24px ${alpha(theme.palette.common.black, isDark ? 0.2 : 0.1)}`,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                {/* Tabs for Chat and Advanced Panels */}
                {hasAdvancedPanels && (
                  <ZenModeTabs
                    activeTab={activeTab}
                    onTabChange={handleTabChange}
                    showInternalChat={config.features.showInternalChat}
                    showConfigPanel={config.features.showConfigPanel}
                    showSlyDataPanel={config.features.showSlyDataPanel}
                    showLogsPanel={config.features.showLogsPanel}
                    theme={theme}
                  />
                )}

                {/* Tab Content */}
                <Box sx={{ flex: 1, overflow: "hidden" }}>
                  {tabContent}
                </Box>
              </Box>
            </Panel>
          )}
        </PanelGroup>
      </Box>

      {/* Keyboard Shortcut Hint */}
      <Fade in={isZenMode && !isTransitioning} timeout={config.features.fadeInDuration * 2}>
        <Box
          sx={{
            position: "absolute",
            bottom: 16,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 2,
            px: 2,
            py: 1,
            borderRadius: 2,
            background: alpha(theme.palette.background.paper, 0.3),
            backdropFilter: "blur(8px)",
          }}
        >
          <Typography
            variant="caption"
            sx={{ color: alpha(theme.palette.text.secondary, 0.7) }}
          >
            Press <strong>Esc</strong> to exit
          </Typography>
          {config.features.enableZoomControls && (
            <Typography
              variant="caption"
              sx={{ color: alpha(theme.palette.text.secondary, 0.7) }}
            >
              •
            </Typography>
          )}
          {config.features.enableZoomControls && (
            <Typography
              variant="caption"
              sx={{ color: alpha(theme.palette.text.secondary, 0.7) }}
            >
              <strong>+/-</strong> to zoom
            </Typography>
          )}
        </Box>
      </Fade>
    </Box>
  );
};

export default ZenModeOverlay;
