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

import React, { useState } from "react";
import {
  IconButton,
  Popover,
  Box,
  Typography,
  FormControlLabel,
  Checkbox,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  alpha,
  useTheme,
  Tooltip,
} from "@mui/material";
import {
  Settings as SettingsIcon,
  Refresh as ResetIcon,
} from "@mui/icons-material";
import { useZenMode } from "../hooks/useZenMode";
import { ZenModeFeatures } from "../config/zenModeConfig";

interface FeatureToggle {
  key: keyof ZenModeFeatures;
  label: string;
  category: string;
}

const FEATURE_TOGGLES: FeatureToggle[] = [
  // Layout
  { key: "showAgentFlow", label: "Show Agent Flow", category: "Layout" },
  { key: "showChat", label: "Show Chat Panel", category: "Layout" },
  { key: "showHeader", label: "Show Header", category: "Layout" },
  
  // Agent Flow
  { key: "showAgentFlowControls", label: "Flow Controls", category: "Agent Flow" },
  { key: "showAgentFlowBackground", label: "Grid Background", category: "Agent Flow" },
  { key: "showMinimap", label: "Minimap", category: "Agent Flow" },
  { key: "enableNodeDragging", label: "Node Dragging", category: "Agent Flow" },
  
  // Chat
  { key: "showSampleQueries", label: "Sample Queries", category: "Chat" },
  { key: "showSpeechControls", label: "Speech Controls", category: "Chat" },
  { key: "showClearChat", label: "Clear Chat Button", category: "Chat" },
  { key: "showDownloadChat", label: "Download Chat", category: "Chat" },
  { key: "showSlyDataToggle", label: "Sly Data Toggle", category: "Chat" },
  
  // Advanced Panels
  { key: "showInternalChat", label: "Internal Chat", category: "Advanced Panels" },
  { key: "showConfigPanel", label: "Config Panel", category: "Advanced Panels" },
  { key: "showSlyDataPanel", label: "Sly Data Panel", category: "Advanced Panels" },
  { key: "showLogsPanel", label: "Logs Panel", category: "Advanced Panels" },
  
  // Visual
  { key: "enableAnimations", label: "Animations", category: "Visual" },
  { key: "showNetworkTitle", label: "Network Title", category: "Visual" },
  { key: "showConnectionStatus", label: "Connection Status", category: "Visual" },
  { key: "showActiveAgentIndicator", label: "Active Agent Indicator", category: "Visual" },
  
  // Zoom
  { key: "enableZoomControls", label: "Zoom Controls", category: "Zoom" },
];

const ZenModeSettings: React.FC = () => {
  const theme = useTheme();
  const { config, updateConfig, resetConfig, currentPreset, setPreset, availablePresets } = useZenMode();
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleFeatureToggle = (key: keyof ZenModeFeatures) => {
    const currentValue = config.features[key];
    if (typeof currentValue === "boolean") {
      updateConfig({
        features: {
          ...config.features,
          [key]: !currentValue,
        },
      });
    }
  };

  const handlePresetChange = (presetName: string) => {
    setPreset(presetName);
  };

  const open = Boolean(anchorEl);
  const id = open ? "zen-mode-settings-popover" : undefined;

  // Group features by category
  const categories = FEATURE_TOGGLES.reduce((acc, toggle) => {
    if (!acc[toggle.category]) {
      acc[toggle.category] = [];
    }
    acc[toggle.category].push(toggle);
    return acc;
  }, {} as Record<string, FeatureToggle[]>);

  return (
    <>
      <Tooltip title="Zen Mode Settings">
        <IconButton
          onClick={handleClick}
          sx={{
            color: theme.palette.text.secondary,
            "&:hover": {
              backgroundColor: alpha(theme.palette.primary.main, 0.1),
              color: theme.palette.primary.main,
            },
          }}
        >
          <SettingsIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        sx={{
          zIndex: 10001, // Higher than Zen Mode overlay (9999)
        }}
        PaperProps={{
          sx: {
            width: 320,
            maxHeight: 500,
            overflow: "auto",
            p: 2,
            backgroundColor: theme.palette.background.paper,
            border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
            borderRadius: 2,
          },
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            Zen Mode Settings
          </Typography>
          <Tooltip title="Reset to Default">
            <IconButton size="small" onClick={resetConfig}>
              <ResetIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Preset Selector */}
        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel>Preset</InputLabel>
          <Select
            value={currentPreset}
            label="Preset"
            onChange={(e) => handlePresetChange(e.target.value)}
          >
            {availablePresets.map((preset) => (
              <MenuItem key={preset} value={preset}>
                {preset.charAt(0).toUpperCase() + preset.slice(1).replace(/_/g, " ")}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Divider sx={{ my: 1 }} />

        {/* Feature Toggles by Category */}
        {Object.entries(categories).map(([category, toggles]) => (
          <Box key={category} sx={{ mb: 2 }}>
            <Typography
              variant="caption"
              sx={{
                color: theme.palette.text.secondary,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                display: "block",
                mb: 0.5,
              }}
            >
              {category}
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {toggles.map((toggle) => {
                const value = config.features[toggle.key];
                if (typeof value !== "boolean") return null;
                
                return (
                  <FormControlLabel
                    key={toggle.key}
                    control={
                      <Checkbox
                        checked={value}
                        onChange={() => handleFeatureToggle(toggle.key)}
                        size="small"
                        sx={{
                          color: theme.palette.text.secondary,
                          "&.Mui-checked": {
                            color: theme.palette.primary.main,
                          },
                        }}
                      />
                    }
                    label={
                      <Typography variant="body2" sx={{ fontSize: "0.85rem" }}>
                        {toggle.label}
                      </Typography>
                    }
                    sx={{ ml: 0, mr: 0, height: 32 }}
                  />
                );
              })}
            </Box>
          </Box>
        ))}
      </Popover>
    </>
  );
};

export default ZenModeSettings;

