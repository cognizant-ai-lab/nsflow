
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
import HelpDialog from "./HelpDialog";
import { ImPower } from "react-icons/im";
import { useChatContext } from "../context/ChatContext";
import { useLocation } from "react-router-dom";
import { AppBar, Toolbar, Typography, IconButton, Button, Menu,
  MenuItem, Box, Tooltip, useTheme as useMuiTheme, alpha } from "@mui/material";
import HomeIcon from "@mui/icons-material/Home";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import AccountIcon from "@mui/icons-material/AccountCircle";
import WandIcon from "@mui/icons-material/DrawTwoTone";
import HelpIcon from "@mui/icons-material/HelpOutlined";
import ChatIcon from "@mui/icons-material/QuickreplyTwoTone";
import DrawIcon from "@mui/icons-material/Draw";
import FullscreenIcon from "@mui/icons-material/Fullscreen";

import MuiThemeToggle from "./MuiThemeToggle";
import { useTheme } from "../context/ThemeContext";
import { useZenMode } from "../hooks/useZenMode";
import { getFeatureFlags } from "../utils/config";

interface HeaderProps {
  isEditorPage?: boolean;
  isCrusePage?: boolean;
}

const Header: React.FC<HeaderProps> = ({ isEditorPage = false, isCrusePage = false }) => {
  const { activeNetwork } = useChatContext();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [accountAnchorEl, setAccountAnchorEl] = useState<null | HTMLElement>(null);
  const location = useLocation();
  const { isDarkMode } = useTheme();
  const muiTheme = useMuiTheme();
  const { pluginCruse, pluginZenMode } = getFeatureFlags();
  const { enterZenMode } = useZenMode();

  // Determine if we're on editor page based on location or prop
  const isOnEditorPage = isEditorPage || location.pathname.includes('/editor');

  // Determine if we're on CRUSE page based on location or prop
  const isOnCrusePage = isCrusePage || location.pathname.includes('/cruse');


  const handleNavigateToEditor = () => {
    // Only pass activeNetwork to editor from the Cruse page
    const url = (isCrusePage && activeNetwork) ? `/editor?loadNetwork=${encodeURIComponent(activeNetwork)}` : '/editor';
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleNavigateToCruse = () => {
    // Pass activeNetwork as URL parameter so CRUSE can auto-select the agent
    const url = activeNetwork ? `/cruse?network=${encodeURIComponent(activeNetwork)}` : '/cruse';
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleNavigateToHome = () => {
    if (isOnEditorPage || isOnCrusePage) {
      window.open("/home", "_blank", "noopener,noreferrer");
    } else {
      // Navigate to blank home without any network selected
      window.location.href = "/home";
    }
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
            {isOnEditorPage ? 'Workflow Agent Network Designer' : isOnCrusePage? 'Context-Reactive User Experience' : 'Neuro AI - Multi-Agent Accelerator Client'}
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
          {!isOnEditorPage && !isOnCrusePage && (
            <Tooltip title={activeNetwork ? "Reload selected Agent-Network in-place" : "Select an Agent-Network first"} arrow>
              <span>
                <Button
                  variant="outlined"
                  startIcon={<AutorenewIcon />}
                  onClick={() => window.location.reload()}
                  disabled={!activeNetwork}
                  sx={{
                    ...muiTheme.navButton.inactive,
                    borderColor: muiTheme.palette.secondary.main,
                    '&:hover': !activeNetwork ? {} : {
                      backgroundColor: alpha(muiTheme.palette.secondary.main, 0.15),
                      borderColor: muiTheme.palette.secondary.main,
                    },
                    '&.Mui-disabled': {
                      opacity: 0.5,
                      borderColor: muiTheme.palette.action.disabled,
                      color: muiTheme.palette.text.disabled,
                    },
                  }}
                >
                  Reload
                </Button>
              </span>
            </Tooltip>
          )}

          {/* Home Button */}
          <Tooltip title={(isOnEditorPage || isOnCrusePage) ? "Open Home in a new tab" : "Go to App's Home Page"} arrow>
            <Button
              variant="outlined"
              startIcon={<HomeIcon />}
              onClick={handleNavigateToHome}
              sx={{
                ...((!isOnEditorPage && !isOnCrusePage) ? muiTheme.navButton.active : muiTheme.navButton.inactive),
                borderColor: muiTheme.palette.secondary.main,
                '&:hover': {
                  backgroundColor: alpha(muiTheme.palette.secondary.main, 0.15),
                  borderColor: muiTheme.palette.secondary.main,
                },
              }}
            >
              Home
            </Button>
          </Tooltip>

          {/* New Button - hidden on Editor page */}
          {!isOnEditorPage && (
            <Tooltip title={(isCrusePage && activeNetwork) ? <span>Edit this Agent-Network<br/>Opens in a new tab</span> : <span>Design an Agent-Network from scratch<br/>Opens in a new tab</span>}>
              <Button
                variant="outlined"
                startIcon={<DrawIcon />}
                onClick={handleNavigateToEditor}
                sx={{
                  ...muiTheme.navButton.inactive,
                  borderColor: muiTheme.palette.secondary.main,
                  '&:hover': {
                    backgroundColor: alpha(muiTheme.palette.secondary.main, 0.15),
                    borderColor: muiTheme.palette.secondary.main,
                  },
                }}
              >
                New
              </Button>
            </Tooltip>
          )}

          {/* CRUSE Button - Hide on Editor and Cruse pages, Disable if no agent selected */}
          {pluginCruse && !isOnEditorPage && !isOnCrusePage && (
            <Tooltip
              title={!activeNetwork ? "Select an Agent-Network first" : "Context-Reactive User Experience"}
              arrow
            >
              <span>
                <Button
                  variant="outlined"
                  startIcon={<ChatIcon />}
                  onClick={handleNavigateToCruse}
                  disabled={!activeNetwork}
                  sx={{
                    ...(isOnCrusePage ? muiTheme.navButton.active : muiTheme.navButton.inactive),
                    borderColor: muiTheme.palette.secondary.main,
                    '&:hover': !activeNetwork ? {} : {
                      backgroundColor: alpha(muiTheme.palette.secondary.main, 0.15),
                      borderColor: muiTheme.palette.secondary.main,
                    },
                    '&.Mui-disabled': {
                      opacity: 0.5,
                      borderColor: muiTheme.palette.action.disabled,
                      color: muiTheme.palette.text.disabled,
                    },
                  }}
                >
                  CRUSE
                </Button>
              </span>
            </Tooltip>
          )}

          {/*
            Export and import now live on the canvases themselves, top right of the
            Home agent flow and beside the Editor's canvas actions, via
            NetworkFileActions. The thing being exported is the thing on screen, so
            the control belongs next to it rather than in the app chrome. The old
            dropdown also sat behind NSFLOW_PLUGIN_EXPORT, which defaulted to false
            and so hid it from every default install.
          */}
        </Box>

        {/* Right - Zen Mode + Theme Toggle + Profile */}
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flex: '0 0 auto'
        }}>
          {/* Zen Mode Button - only on home page, behind plugin flag.
              Requires an Agent-Network to be selected first. */}
          {pluginZenMode && !isOnEditorPage && !isOnCrusePage && (
            <Tooltip
              title={activeNetwork ? "Enter Zen Mode (Presentation View)" : "Select an Agent-Network first"}
              arrow
            >
              {/* Wrapper span lets the Tooltip render over a disabled button. */}
              <span>
                <IconButton
                  onClick={enterZenMode}
                  disabled={!activeNetwork}
                  sx={{
                    color: muiTheme.palette.text.primary,
                    backgroundColor: alpha(muiTheme.palette.primary.main, 0.1),
                    border: `1px solid ${alpha(muiTheme.palette.primary.main, 0.3)}`,
                    '&:hover': !activeNetwork ? {} : {
                      backgroundColor: alpha(muiTheme.palette.primary.main, 0.2),
                      borderColor: muiTheme.palette.primary.main,
                      transform: 'scale(1.05)',
                    },
                    '&.Mui-disabled': {
                      color: alpha(muiTheme.palette.text.primary, 0.3),
                      borderColor: alpha(muiTheme.palette.primary.main, 0.15),
                    },
                    transition: 'all 0.2s ease',
                  }}
                >
                  <FullscreenIcon />
                </IconButton>
              </span>
            </Tooltip>
          )}
          <MuiThemeToggle />
          <Tooltip title="Account and help">
            <IconButton
              onClick={(e) => setAccountAnchorEl(e.currentTarget)}
              sx={{ 
                color: muiTheme.palette.text.primary,
                '&:hover': { 
                  backgroundColor: alpha(muiTheme.palette.primary.main, 0.1) 
                }
              }}
            >
              <AccountIcon />
            </IconButton>
          </Tooltip>

          {/*
            This menu is on the header itself, not inside the Export dropdown. Export
            is hidden on the editor and Cruse pages and behind a plugin flag, so
            anything put there is unreachable from exactly the pages a user is most
            likely to want help on.
          */}
          <Menu
            anchorEl={accountAnchorEl}
            open={Boolean(accountAnchorEl)}
            onClose={() => setAccountAnchorEl(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <MenuItem
              onClick={() => {
                setAccountAnchorEl(null);
                setIsHelpOpen(true);
              }}
              sx={{
                py: 1.5,
                px: 2,
                '&:hover': { backgroundColor: alpha(muiTheme.palette.primary.main, 0.1) }
              }}
            >
              <HelpIcon sx={{ mr: 1.5, fontSize: '20px', color: muiTheme.palette.primary.main }} />
              <Typography variant="body2" sx={{ fontWeight: 500, color: muiTheme.palette.text.primary }}>
                Help
              </Typography>
            </MenuItem>
          </Menu>

          <HelpDialog open={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
