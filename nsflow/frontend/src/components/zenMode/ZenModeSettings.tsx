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
  alpha,
  useTheme,
  Tooltip,
} from "@mui/material";
import {
  Settings as SettingsIcon,
  Refresh as ResetIcon,
} from "@mui/icons-material";
import { useZenMode } from "../../hooks/useZenMode";
import {
  ZEN_FEATURE_TOGGLES,
  type ZenFeatureToggle,
  type ZenModeFeatures,
} from "../../config/zenModeConfig";

const ZenModeSettings: React.FC = () => {
  const theme = useTheme();
  const { config, updateConfig, resetConfig } = useZenMode();
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

  const open = Boolean(anchorEl);
  const id = open ? "zen-mode-settings-popover" : undefined;

  // Group toggles by category for the rendered sections.
  const categories = ZEN_FEATURE_TOGGLES.reduce((acc, toggle) => {
    if (!acc[toggle.category]) acc[toggle.category] = [];
    acc[toggle.category].push(toggle);
    return acc;
  }, {} as Record<string, ZenFeatureToggle[]>);

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
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        sx={{ zIndex: 10001 }}
        slotProps={{
          paper: {
            sx: {
              width: 320,
              maxHeight: 500,
              overflow: "auto",
              p: 2,
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
              borderRadius: 2,
            },
          },
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
            Zen Mode Settings
          </Typography>
          <Tooltip title="Reset to Default">
            <IconButton size="small" onClick={resetConfig}>
              <ResetIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        <Divider sx={{ my: 1 }} />

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
                          "&.Mui-checked": { color: theme.palette.primary.main },
                        }}
                      />
                    }
                    label={
                      <Typography variant="body2" sx={{ fontSize: "0.85rem", color: theme.palette.text.primary }}>
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
