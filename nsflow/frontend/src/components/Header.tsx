
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
import { useState } from "react";
import { ImPower } from "react-icons/im";
import { useApiPort } from "../context/ApiPortContext";
import { useLocation } from "react-router-dom";
import { AppBar, Toolbar, Typography, IconButton, Button, Menu,
  MenuItem, Box, Tooltip, useTheme as useMuiTheme, alpha } from "@mui/material";
import { Home as HomeIcon, Code as CodeIcon, AccountTree as NetworkIcon, Download as DownloadIcon,
  Refresh as RefreshIcon, AccountCircle as AccountIcon, Edit as EditIcon, DrawTwoTone as WandIcon,
  KeyboardArrowDown as ArrowDownIcon, Chat as ChatIcon
} from "@mui/icons-material";

import MuiThemeToggle from "./MuiThemeToggle";
import { useTheme } from "../context/ThemeContext";

interface HeaderProps {
  selectedNetwork: string;
  isEditorPage?: boolean;
  isCrusePage?: boolean;
}

const Header: React.FC<HeaderProps> = ({ selectedNetwork, isEditorPage = false, isCrusePage = false }) => {
  const { apiUrl } = useApiPort();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const location = useLocation();
  const { isDarkMode } = useTheme();
  const muiTheme = useMuiTheme();

  // Determine if we're on editor page based on location or prop
  const isOnEditorPage = isEditorPage || location.pathname.includes('/editor');

  // Determine if we're on CRUSE page based on location or prop
  const isOnCrusePage = isCrusePage || location.pathname.includes('/cruse');

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
    setAnchorEl(null);
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
    setAnchorEl(null);
  };

  const handleNavigateToEditor = () => {
    window.open('/editor', '_blank', 'noopener,noreferrer');
  };

  const handleNavigateToCruse = () => {
    window.open('/cruse', '_blank', 'noopener,noreferrer');
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
        backgroundColor: isOnEditorPage
          ? muiTheme.pageVariants.editor.headerBg
          : muiTheme.pageVariants.home.headerBg,
        color: muiTheme.palette.text.primary,
        height: 56,
        zIndex: muiTheme.zIndex.appBar,
        backdropFilter: 'blur(6px)',
        boxShadow: `0 2px 6px ${alpha(muiTheme.palette.common.black, 0.15)}`,
        transition: 'background-color 0.3s ease',
        overflow: 'visible',
      }}
    >

      <Toolbar sx={{
        minHeight: '56px !important',
        px: 2,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        overflow: 'visible',
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
          transform: 'translateX(-50%)',
          overflow: 'visible',
        }}>
          {/* Reload */}
          {!isOnEditorPage && (
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
          )}

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

          {/* CRUSE Button */}
          <Tooltip title="Context-Reactive User Experience" arrow>
            <Button
              variant={isOnCrusePage ? "contained" : "outlined"}
              startIcon={<ChatIcon />}
              onClick={handleNavigateToCruse}
              sx={{
                color: muiTheme.palette.text.primary,
                borderColor: muiTheme.palette.primary.main,
                '&:hover': {
                  backgroundColor: alpha(muiTheme.palette.primary.main, 0.1),
                  borderColor: muiTheme.palette.primary.main,
                },
                ...(isOnCrusePage && {
                  backgroundColor: alpha(muiTheme.palette.primary.main, 0.2),
                }),
                ...(!isOnCrusePage && {
                  backgroundColor: alpha(muiTheme.palette.primary.main, 0.1),
                })
              }}
            >
              CRUSE
            </Button>
          </Tooltip>

          {/* Export Dropdown */}
          {!isOnEditorPage && (
            <>
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                endIcon={
                  <ArrowDownIcon
                    sx={{
                      fontSize: '18px',
                      transform: anchorEl ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.3s ease'
                    }}
                  />
                }
                onClick={(e) => setAnchorEl(e.currentTarget)}
                sx={{
                  color: muiTheme.palette.text.primary,
                  borderColor: muiTheme.palette.primary.main,
                  backgroundColor: alpha(muiTheme.palette.primary.main, 0.1),
                  '&:hover': {
                    backgroundColor: alpha(muiTheme.palette.primary.main, 0.15),
                    borderColor: muiTheme.palette.primary.main,
                  },
                  transition: 'all 0.2s ease'
                }}
              >
                Export
              </Button>

              <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={() => setAnchorEl(null)}
                anchorOrigin={{
                  vertical: 'bottom',
                  horizontal: 'left',
                }}
                transformOrigin={{
                  vertical: 'top',
                  horizontal: 'left',
                }}
                sx={{
                  '& .MuiPaper-root': {
                    minWidth: 220,
                    mt: 1,
                    borderRadius: 1,
                    border: `1px solid ${muiTheme.palette.divider}`,
                  }
                }}
              >
                <MenuItem
                  onClick={handleExportNotebook}
                  sx={{
                    py: 1.5,
                    px: 2,
                    '&:hover': {
                      backgroundColor: alpha(muiTheme.palette.primary.main, 0.1)
                    }
                  }}
                >
                  <EditIcon sx={{ mr: 1.5, fontSize: '20px', color: muiTheme.palette.primary.main }} />
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    Export as Notebook
                  </Typography>
                </MenuItem>
                <MenuItem
                  onClick={handleExportAgentNetwork}
                  sx={{
                    py: 1.5,
                    px: 2,
                    '&:hover': {
                      backgroundColor: alpha(muiTheme.palette.primary.main, 0.1)
                    }
                  }}
                >
                  <NetworkIcon sx={{ mr: 1.5, fontSize: '20px', color: muiTheme.palette.primary.main }} />
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    Export as HOCON
                  </Typography>
                </MenuItem>
              </Menu>
            </>
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
