
// Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
// All Rights Reserved.
// Issued under the Academic Public License.
//
// You can be released from the terms, and requirements of the Academic Public
// License by purchasing a commercial license.
// Purchase of a commercial license is mandatory for any use of the
// nsflow SDK Software in commercial settings.
//
// END COPYRIGHT
import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { ImPower } from "react-icons/im";
import { useApiPort } from "../context/ApiPortContext";
import { useNavigate, useLocation } from "react-router-dom";
import { AppBar, Toolbar, Typography, IconButton, Button, 
  MenuItem,  Box, useTheme as useMuiTheme, alpha, Paper } from "@mui/material";
import { Home as HomeIcon, Code as CodeIcon, AccountTree as NetworkIcon, Download as DownloadIcon,
  Refresh as RefreshIcon, AccountCircle as AccountIcon, Edit as EditIcon, DrawTwoTone as WandIcon
} from "@mui/icons-material";

import MuiThemeToggle from "./MuiThemeToggle";
import { useTheme } from "../context/ThemeContext";

interface HeaderProps {
  selectedNetwork: string;
  isEditorPage?: boolean;
}

const Header: React.FC<HeaderProps> = ({ selectedNetwork, isEditorPage = false }) => {
  const { apiUrl } = useApiPort();
  const [exportDropdown, setExportDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, isDarkMode } = useTheme();
  const muiTheme = useMuiTheme();
  
  // Determine if we're on editor page based on location or prop
  const isOnEditorPage = isEditorPage || location.pathname.includes('/editor');


  // Handle clicking outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setExportDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleExportNotebook = async () => {
    if (!selectedNetwork) return alert("Please select an agent network first.");
    const response = await fetch(`${apiUrl}/api/v1/export/notebook/${selectedNetwork}`);
    if (!response.ok) return alert("Failed to generate notebook.");
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedNetwork}.ipynb`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setExportDropdown(false);
  };

  const handleExportAgentNetwork = async () => {
    if (!selectedNetwork) return alert("Please select an agent network first.");
    const response = await fetch(`${apiUrl}/api/v1/export/agent_network/${selectedNetwork}`);
    if (!response.ok) return alert("Failed to download agent network.");
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedNetwork}.hocon`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setExportDropdown(false);
  };

  const handleNavigateToEditor = () => {
    window.open('/editor', '_blank', 'noopener,noreferrer');
  };

  const handleNavigateToHome = () => {
    window.open("/home", "_blank", "noopener,noreferrer");
  };

  return (
    <AppBar 
      key={`header-${isDarkMode ? 'dark' : 'light'}`}
      position="static" 
      elevation={2}
      sx={{
        background: theme.palette.background.paper,
        height: 56,
        zIndex: muiTheme.zIndex.appBar,
      }}
    >
      <Toolbar sx={{ 
        minHeight: '56px !important', 
        px: 2,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%'
      }}>
        {/* Left - App Icon and Title */}
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1.5,
          flex: '0 0 auto'
        }}>
          {isOnEditorPage ? (
            <WandIcon 
              sx={{ 
                fontSize: '28px', 
                color: muiTheme.palette.text.primary,
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
              }} 
            />
          ) : (
            <ImPower 
              style={{ 
                fontSize: '28px', 
                color: muiTheme.palette.text.primary,
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
              }} 
            />
          )}
          <Typography 
            variant="h6" 
            component="div" 
            sx={{ 
              fontWeight: 600,
              color: muiTheme.palette.text.primary,
              textShadow: '0 1px 2px rgba(0,0,0,0.3)',
              display: { xs: 'none', sm: 'block' }
            }}
          >
            {isOnEditorPage ? 'Workflow Agent Network Designer' : 'Neuro AI - Multi-Agent Accelerator Client'}
          </Typography>
        </Box>

        {/* Middle - Navigation Buttons */}
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1,
          flex: '0 0 auto',
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)'
        }}>
          {/* Reload */}
          <IconButton
            onClick={() => window.location.reload()}
            sx={{ 
              color: muiTheme.palette.text.primary,
              '&:hover': { 
                backgroundColor: alpha(muiTheme.palette.primary.main, 0.1) 
              }
            }}
            title="Reload"
          >
            <RefreshIcon />
          </IconButton>

          {/* Home Button */}
          <Button
            variant={!isOnEditorPage ? "contained" : "outlined"}
            startIcon={<HomeIcon />}
            onClick={handleNavigateToHome}
            sx={{
              color: muiTheme.palette.text.primary,
              borderColor: muiTheme.palette.primary.main,
              '&:hover': {
                backgroundColor: alpha(muiTheme.palette.primary.main, 0.1),
                borderColor: muiTheme.palette.primary.main,
              },
              ...(isOnEditorPage && {
                backgroundColor: alpha(muiTheme.palette.primary.main, 0.1),
              }),
              ...(!isOnEditorPage && {
                backgroundColor: alpha(muiTheme.palette.primary.main, 0.2),
              })
            }}
          >
            Home
          </Button>

          {/* Editor Button */}
          <Button
            variant={isOnEditorPage ? "contained" : "outlined"}
            startIcon={<CodeIcon />}
            onClick={handleNavigateToEditor}
            sx={{
              color: muiTheme.palette.text.primary,
              borderColor: muiTheme.palette.primary.main,
              '&:hover': {
                backgroundColor: alpha(muiTheme.palette.primary.main, 0.1),
                borderColor: muiTheme.palette.primary.main,
              },
              ...(isOnEditorPage && {
                backgroundColor: alpha(muiTheme.palette.primary.main, 0.2),
              }),
              ...(!isOnEditorPage && {
                backgroundColor: alpha(muiTheme.palette.primary.main, 0.1),
              })
            }}
          >
            Editor
          </Button>

          {/* Export Dropdown */}
          {!isOnEditorPage && (
            <Box ref={dropdownRef} sx={{ position: 'relative' }}>
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                endIcon={<Typography sx={{ transform: exportDropdown ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▶</Typography>}
                onClick={() => setExportDropdown(!exportDropdown)}
                sx={{
                  color: muiTheme.palette.text.primary,
                  borderColor: muiTheme.palette.primary.main,
                  '&:hover': {
                    backgroundColor: alpha(muiTheme.palette.primary.main, 0.1),
                    borderColor: muiTheme.palette.primary.main,
                  }
                }}
              >
                Export
              </Button>

              {exportDropdown && (
                <Paper
                  elevation={8}
                  sx={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    mt: 1,
                    minWidth: 200,
                    zIndex: muiTheme.zIndex.modal,
                    backgroundColor: muiTheme.palette.background.paper,
                    border: `1px solid ${muiTheme.palette.divider}`,
                  }}
                >
                  <MenuItem onClick={handleExportNotebook}>
                    <EditIcon sx={{ mr: 1 }} />
                    Export as Notebook
                  </MenuItem>
                  <MenuItem onClick={handleExportAgentNetwork}>
                    <NetworkIcon sx={{ mr: 1 }} />
                    Export Agent Network
                  </MenuItem>
                </Paper>
              )}
            </Box>
          )}
        </Box>

        {/* Right - Theme Toggle + Profile */}
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1,
          flex: '0 0 auto'
        }}>
          <MuiThemeToggle />
          <IconButton
            sx={{ 
              color: muiTheme.palette.text.primary,
              '&:hover': { 
                backgroundColor: alpha(muiTheme.palette.primary.main, 0.1) 
              }
            }}
          >
            <AccountIcon />
          </IconButton>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
