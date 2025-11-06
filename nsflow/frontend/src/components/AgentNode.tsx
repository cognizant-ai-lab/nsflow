
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
import { useState, useMemo, useEffect } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { FaRobot, FaCogs, FaBrain, FaMicrochip, FaNetworkWired, FaUserSecret } from "react-icons/fa";
import { Box, Paper, Typography, Button, IconButton, List, ListItem, 
  ListItemIcon, ListItemText, Tooltip, useTheme, alpha, Collapse } from "@mui/material";
import { ExpandMore as ExpandMoreIcon, CheckBox as CheckBoxIcon,
  CheckBoxOutlineBlank as CheckBoxOutlineBlankIcon,
  ContentCopy as CopyIcon } from "@mui/icons-material";
import { useApiPort } from "../context/ApiPortContext";

// Define the structure of the `data` prop
interface AgentNodeData {
  id: string;
  label: string;
  isActive?: boolean;
  dropdown_tools?: string[];
  selectedNetwork: string;
}

// Extend NodeProps to include AgentNodeData
interface AgentNodeProps extends NodeProps {
  data: AgentNodeData;
}

// Available icons
const icons = [FaRobot, FaCogs, FaBrain, FaMicrochip, FaNetworkWired, FaUserSecret];

// Simple hash function to select an icon
const getIconIndex = (key: string) => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % icons.length;
};

const handlePositions: { [key: string]: Position } = {
  top: Position.Top,
  bottom: Position.Bottom,
  left: Position.Left,
  right: Position.Right,
};

// Fix: Add type annotation for function props
const AgentNode: React.FC<AgentNodeProps> = ({ data }) => {
  const { apiUrl } = useApiPort();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [agentDetails, setAgentDetails] = useState<any>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [hoveringTooltip, setHoveringTooltip] = useState(false);
  const theme = useTheme();
  const agentNodeTheme = theme.custom.agentNode;
  
  // Fix: Explicitly type the state object
  const [selectedTools, setSelectedTools] = useState<Record<string, boolean>>(
    data.dropdown_tools?.reduce((acc: Record<string, boolean>, tool: string) => {
      acc[tool] = true;
      return acc;
    }, {} as Record<string, boolean>) || {}
  );

  // Fix: Add type for `tool` parameter
  const toggleToolSelection = (tool: string) => {
    setSelectedTools((prev: Record<string, boolean>) => ({
      ...prev,
      [tool]: !prev[tool],
    }));
  };

  // Use useMemo to avoid re-selecting the icon on every render
  const Icon = useMemo(() => {
    const index = getIconIndex(data.id || data.label);
    return icons[index];
  }, [data.id, data.label]);

  useEffect(() => {
    if (!showTooltip || agentDetails) return;
    // Fetch agent details when the tooltip is shown
    fetch(`${apiUrl}/api/v1/networkconfig/${data.selectedNetwork}/agent/${data.label}`)
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) {
            setAgentDetails({
              name: data.label,
              error: "This agent is managed by a remote NeuroSan server. Detailed configuration is not available locally."
            });
          } else {
            throw new Error(`HTTP error! Status: ${res.status}`);
          }
        } else {
          return res.json();
        }
      })
      .then((json) => {
        if (json) setAgentDetails(json);
      })
      .catch((err) => {
        console.error("Failed to load agent details:", err);
      });
  }, [showTooltip, agentDetails, apiUrl, data.selectedNetwork, data.label]);
  

  const handleMouseEnter = () => setShowTooltip(true);
  const handleMouseLeave = () => setTimeout(() => {
    if (!hoveringTooltip) setShowTooltip(false);
  }, 250); // small delay to allow tooltip hover to register

  const handleTooltipEnter = () => setHoveringTooltip(true);
  const handleTooltipLeave = () => {
    setHoveringTooltip(false);
    setShowTooltip(false);
  };

  return (
    <Box sx={{ position: 'relative', width: 'fit-content', height: 'fit-content' }}>
      {/* Node Container */}
      <Paper
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        elevation={data.isActive ? 8 : 2}
        sx={{
          p: 1.5,
          borderRadius: 2,
          width: 192, // 48 * 4 = 192px
          transition: 'all 0.3s ease',
          transform: data.isActive ? 'scale(1.05)' : 'scale(1)',
          backgroundColor: data.isActive 
            ? alpha(agentNodeTheme.activeBg, 0.8) 
            : alpha(agentNodeTheme.inactiveBg, 0.8),
          color: theme.palette.text.primary,
          border: `2px solid ${data.isActive 
            ? agentNodeTheme.activeBorder 
            : agentNodeTheme.inactiveBorder}`,
          '&:hover': {
            elevation: 4,
            borderColor: theme.palette.primary.light
          }
        }}
      >
        {/* Title Bar */}
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          backgroundColor: data.isActive 
            ? alpha(agentNodeTheme.titleActiveBg, 0.7)
            : alpha(agentNodeTheme.titleInactiveBg, 0.9),
          px: 1, 
          py: 0.5, 
          borderRadius: '4px 4px 0 0',
          mb: 1
        }}>
          {/* Icon */}
          <Icon style={{ color: 'white', fontSize: '1.125rem', marginRight: 8 }} />
          <Typography variant="body2" sx={{ 
            fontWeight: 600, 
            color: 'white',
            fontSize: '0.875rem'
          }}>
            {data.label}
          </Typography>
        </Box>

        {/* Coded Tools Section */}
        {data.dropdown_tools && data.dropdown_tools.length > 0 && (
          <Box sx={{ mb: 1 }}>
            {/* Toggle Button */}
            <Button
              size="small"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              endIcon={
                <ExpandMoreIcon 
                  sx={{ 
                    transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s'
                  }} 
                />
              }
              sx={{
                width: '100%',
                justifyContent: 'space-between',
                backgroundColor: alpha(theme.palette.primary.main, 0.1),
                color: theme.palette.text.primary,
                fontSize: '0.75rem',
                py: 0.5,
                '&:hover': {
                  backgroundColor: alpha(theme.palette.primary.main, 0.2)
                }
              }}
            >
              Coded Tools
            </Button>

            {/* Dropdown List - Multi-select checkboxes */}
            <Collapse in={dropdownOpen}>
              <List dense sx={{ py: 0 }}>
                {data.dropdown_tools.map((tool: string) => (
                  <ListItem 
                    key={tool} 
                    component="div"
                    onClick={() => toggleToolSelection(tool)}
                    sx={{ 
                      py: 0.25,
                      px: 1,
                      cursor: 'pointer',
                      '&:hover': {
                        backgroundColor: alpha(theme.palette.primary.main, 0.1)
                      }
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 24 }}>
                      {selectedTools[tool] ? 
                        <CheckBoxIcon sx={{ fontSize: 16, color: theme.palette.primary.main }} /> : 
                        <CheckBoxOutlineBlankIcon sx={{ fontSize: 16, color: theme.palette.text.secondary }} />
                      }
                    </ListItemIcon>
                    <ListItemText 
                      primary={tool} 
                      primaryTypographyProps={{ 
                        fontSize: '0.7rem',
                        color: theme.palette.text.primary
                      }}
                    />
                  </ListItem>
                ))}
              </List>
            </Collapse>
          </Box>
        )}

        {/* Node Body with Handles */}
        <Box sx={{ p: 1, textAlign: 'center', position: 'abs' }}>
          {/* Correctly render handles with unique keys */}
          {Object.entries(handlePositions).map(([key, position]) => (
            <React.Fragment key={key}>
              <Handle 
                type="target" 
                position={position} 
                id={`${key}-target`}
                style={{ 
                  backgroundColor: theme.palette.primary.main,
                  border: `2px solid ${theme.palette.background.paper}`,
                  width: 8,
                  height: 8
                }} 
              />
              <Handle 
                type="source" 
                position={position} 
                id={`${key}-source`}
                style={{ 
                  backgroundColor: theme.palette.secondary.main,
                  border: `2px solid ${theme.palette.background.paper}`,
                  width: 8,
                  height: 8
                }} 
              />
            </React.Fragment>
          ))}
        </Box>
      </Paper>

      {/* Tooltip on hover */}
      {showTooltip && agentDetails && (
        <Paper
          className="nodrag"
          elevation={4}
          onMouseEnter={handleTooltipEnter}
          onMouseLeave={handleTooltipLeave}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          sx={{
            position: 'absolute',
            left: 208, // 52 * 4 = 208px
            top: 0,
            width: 340,
            p: 2,
            backgroundColor: theme.palette.background.paper,
            border: `1px solid ${theme.palette.divider}`,
            zIndex: 1000
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="subtitle2" sx={{ 
              fontWeight: 600, 
              color: theme.palette.text.primary 
            }}>
              {agentDetails.name}
            </Typography>
            {agentDetails.error === undefined && (
              <Tooltip title="Copy details">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(JSON.stringify(agentDetails, null, 2));
                  }}
                  sx={{ 
                    color: theme.palette.text.secondary,
                    '&:hover': { color: theme.palette.primary.main }
                  }}
                >
                  <CopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>

          {agentDetails.error ? (
            <Typography variant="body2" sx={{ 
              fontStyle: 'italic', 
              color: theme.palette.text.secondary 
            }}>
              {agentDetails.error}
            </Typography>
          ) : (
            <Box>
              {agentDetails.llm_config && (
                <Box sx={{ mb: 1 }}>
                  <Typography variant="caption" sx={{ 
                    fontWeight: 600, 
                    color: theme.palette.text.primary 
                  }}>
                    LLM Config:{" "}
                  </Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {Object.entries(agentDetails.llm_config)
                      .map(([key, val]) => `${key}: ${val}`)
                      .join(", ")}
                  </Typography>
                </Box>
              )}
              {agentDetails.function && (
                <Box sx={{ mb: 1 }}>
                  <Typography variant="caption" sx={{ 
                    fontWeight: 600, 
                    color: theme.palette.text.primary 
                  }}>
                    Function:{" "}
                  </Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {typeof agentDetails.function === "string"
                      ? agentDetails.function
                      : agentDetails.function.description}
                  </Typography>
                </Box>
              )}
              {agentDetails.command && (
                <Box sx={{ mb: 1 }}>
                  <Typography variant="caption" sx={{ 
                    fontWeight: 600, 
                    color: theme.palette.text.primary 
                  }}>
                    Command:{" "}
                  </Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {agentDetails.command}
                  </Typography>
                </Box>
              )}
              {agentDetails.instructions && (
                <Box sx={{ mb: 1 }}>
                  <Typography variant="caption" sx={{ 
                    fontWeight: 600, 
                    color: theme.palette.text.primary,
                    display: 'block'
                  }}>
                    Instructions:
                  </Typography>
                  <Typography variant="caption" sx={{ 
                    color: theme.palette.text.secondary,
                    display: 'block',
                    mt: 0.5
                  }}>
                    {agentDetails.instructions}
                  </Typography>
                </Box>
              )}
              {agentDetails.tools?.length > 0 && (
                <Box sx={{ mb: 1 }}>
                  <Typography variant="caption" sx={{ 
                    fontWeight: 600, 
                    color: theme.palette.text.primary 
                  }}>
                    Tools:{" "}
                  </Typography>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    {agentDetails.tools.join(", ")}
                  </Typography>
                </Box>
              )}
            </Box>
          )}

        </Paper>
      )}
    </Box>
  );
};

export default AgentNode;
