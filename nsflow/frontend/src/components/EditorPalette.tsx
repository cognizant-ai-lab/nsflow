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

import { useState, useEffect } from 'react';
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Typography,
  Divider,
  Collapse,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  Paper,
  useTheme,
  alpha,
  Autocomplete
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Palette as PaletteIcon,
  CloudDownload as EditFromRegistryIcon,
  Add as CreateNewIcon,
  ViewModule as TemplateIcon,
  ExpandLess,
  ExpandMore,
  AccountTree as HierarchicalIcon,
  LinearScale as SequentialIcon,
  Person as SingleAgentIcon
} from '@mui/icons-material';
import { useApiPort } from '../context/ApiPortContext';

const drawerWidth = 280;

interface TemplateParams {
  type: 'single_agent' | 'hierarchical' | 'sequential';
  levels?: number;
  agents_per_level?: number[];
  sequence_length?: number;
  agent_name?: string;
}

interface EditorPaletteProps {
  onNetworkCreated: () => void; // Callback to refresh sidebar
  onNetworkSelected: (networkName: string) => void; // Callback to select network in sidebar
}

const EditorPalette = ({ onNetworkCreated, onNetworkSelected }: EditorPaletteProps) => {
  const theme = useTheme();
  const { apiUrl, isReady } = useApiPort();
  
  const [open, setOpen] = useState(false);
  const [registryNetworks, setRegistryNetworks] = useState<string[]>([]);
  const [selectedRegistryNetwork, setSelectedRegistryNetwork] = useState<string>('');
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [templateParams, setTemplateParams] = useState<TemplateParams>({
    type: 'single_agent',
    levels: 2,
    agents_per_level: [1, 2],
    sequence_length: 3,
    agent_name: 'frontman'
  });
  const [loading, setLoading] = useState(false);

  // Fetch registry networks
  const fetchRegistryNetworks = async () => {
    if (!isReady || !apiUrl) return;

    try {
      const response = await fetch(`${apiUrl}/api/v1/andeditor/networks`);
      if (!response.ok) return;

      const data = await response.json();
      setRegistryNetworks(data.registry_networks || []);
    } catch (err) {
      console.error('Error fetching registry networks:', err);
    }
  };

  useEffect(() => {
    if (open) {
      fetchRegistryNetworks();
    }
  }, [open, isReady, apiUrl]);

  const handleDrawerToggle = () => {
    setOpen(!open);
  };


  // Action 1: Edit from Registry
  const handleEditFromRegistry = async () => {
    if (!selectedRegistryNetwork || !apiUrl) return;

    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/v1/andeditor/networks/load/${selectedRegistryNetwork}`, {
        method: 'POST'
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Network loaded from registry:', result);
        
        // Refresh sidebar and select the new network
        onNetworkCreated();
        
        // The new network name should be in the response
        if (result.network_name) {
          onNetworkSelected(result.network_name);
        }
        
        setSelectedRegistryNetwork('');
        setOpen(false);
      } else {
        console.error('Failed to load network from registry');
      }
    } catch (err) {
      console.error('Error loading network from registry:', err);
    } finally {
      setLoading(false);
    }
  };

  // Action 2: Create New Agent Network
  const handleCreateNew = async () => {
    if (!apiUrl) return;

    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/v1/andeditor/networks/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'single_agent'
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('New network created:', result);
        
        // Refresh sidebar and select the new network
        onNetworkCreated();
        
        if (result.network_name) {
          onNetworkSelected(result.network_name);
        }
        
        setOpen(false);
      } else {
        console.error('Failed to create new network');
      }
    } catch (err) {
      console.error('Error creating new network:', err);
    } finally {
      setLoading(false);
    }
  };

  // Action 3: Create from Template
  const handleCreateFromTemplate = async () => {
    if (!apiUrl) return;

    setLoading(true);
    try {
      const requestBody: any = {
        type: templateParams.type
      };

      // Add template-specific parameters
      if (templateParams.type === 'hierarchical') {
        requestBody.levels = templateParams.levels;
        requestBody.agents_per_level = templateParams.agents_per_level;
      } else if (templateParams.type === 'sequential') {
        requestBody.sequence_length = templateParams.sequence_length;
      } else if (templateParams.type === 'single_agent') {
        requestBody.agent_name = templateParams.agent_name;
      }

      const response = await fetch(`${apiUrl}/api/v1/andeditor/networks/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Template network created:', result);
        
        // Refresh sidebar and select the new network
        onNetworkCreated();
        
        if (result.network_name) {
          onNetworkSelected(result.network_name);
        }
        
        setTemplateMenuOpen(false);
        setOpen(false);
      } else {
        console.error('Failed to create template network');
      }
    } catch (err) {
      console.error('Error creating template network:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateAgentsPerLevel = (level: number, value: number) => {
    const newAgentsPerLevel = [...templateParams.agents_per_level!];
    newAgentsPerLevel[level] = value;
    setTemplateParams({ ...templateParams, agents_per_level: newAgentsPerLevel });
  };

  return (
    <Drawer
        variant="permanent"
        open={open}
        sx={{
          width: open ? drawerWidth : 64,
          flexShrink: 0,
          whiteSpace: 'nowrap',
          boxSizing: 'border-box',
          '& .MuiDrawer-paper': {
            width: open ? drawerWidth : 64,
            transition: theme.transitions.create('width', {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
            overflowX: 'hidden',
            backgroundColor: theme.palette.background.paper,
            borderRight: `1px solid ${theme.palette.divider}`,
            zIndex: theme.zIndex.drawer - 1, // Below the main sidebar
            position: 'relative'
          }
        }}
      >
      {/* Header */}
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: open ? 'space-between' : 'center',
        p: 1,
        minHeight: 48,
        borderBottom: `1px solid ${theme.palette.divider}`
      }}>
        {open && (
          <Typography variant="subtitle2" sx={{ 
            fontWeight: 600, 
            color: theme.palette.text.primary,
            display: 'flex',
            alignItems: 'center',
            gap: 1
          }}>
            <PaletteIcon sx={{ fontSize: 18 }} color="primary" />
            Editor Palette
          </Typography>
        )}
        <IconButton onClick={handleDrawerToggle} size="small">
          {open ? <ChevronLeftIcon /> : <ChevronRightIcon />}
        </IconButton>
      </Box>

      <Divider />

      {/* Actions List */}
      <List sx={{ pt: 1 }}>
        {/* Action 1: Edit from Registry */}
        <ListItem disablePadding sx={{ display: 'block' }}>
          <ListItemButton
            sx={{
              minHeight: 48,
              justifyContent: open ? 'initial' : 'center',
              px: 2.5,
            }}
            onClick={() => {
              if (!open) setOpen(true);
            }}
          >
            <ListItemIcon
              sx={{
                minWidth: 0,
                mr: open ? 3 : 'auto',
                justifyContent: 'center',
              }}
            >
              <EditFromRegistryIcon color="primary" />
            </ListItemIcon>
            <ListItemText
              primary="Edit from Registry"
              sx={{ opacity: open ? 1 : 0 }}
            />
          </ListItemButton>
          
          {/* Registry Network Selection */}
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ px: 1.5, pb: 1.5 }}>
              <Autocomplete
                size="small"
                options={registryNetworks}
                getOptionLabel={(option) => option}
                value={selectedRegistryNetwork || null}
                onChange={(_, newValue) => {
                  setSelectedRegistryNetwork(newValue || '');
                }}
                renderInput={(params) => (
                  <TextField 
                    {...params} 
                    label="Select Agent Network"
                    sx={{ mb: 1 }}
                  />
                )}
                sx={{ width: '100%' }}
              />
              <Button
                variant="contained"
                size="small"
                fullWidth
                disabled={!selectedRegistryNetwork || loading}
                onClick={handleEditFromRegistry}
                sx={{ 
                  textTransform: 'none',
                  py: 0.75
                }}
              >
                {loading ? 'Loading...' : 'Load for Editing'}
              </Button>
            </Box>
          </Collapse>
        </ListItem>

        <Divider />

        {/* Action 2: Create New Agent Network */}
        <ListItem disablePadding sx={{ display: 'block' }}>
          <ListItemButton
            sx={{
              minHeight: 48,
              justifyContent: open ? 'initial' : 'center',
              px: 2.5,
            }}
            onClick={handleCreateNew}
            disabled={loading}
          >
            <ListItemIcon
              sx={{
                minWidth: 0,
                mr: open ? 3 : 'auto',
                justifyContent: 'center',
              }}
            >
              <CreateNewIcon color="success" />
            </ListItemIcon>
            <ListItemText
              primary="Create New Network"
              sx={{ opacity: open ? 1 : 0 }}
            />
          </ListItemButton>
        </ListItem>

        <Divider />

        {/* Action 3: Create from Template */}
        <ListItem disablePadding sx={{ display: 'block' }}>
          <ListItemButton
            sx={{
              minHeight: 48,
              justifyContent: open ? 'initial' : 'center',
              px: 2.5,
            }}
            onClick={() => {
              if (!open) setOpen(true);
              setTemplateMenuOpen(!templateMenuOpen);
            }}
          >
            <ListItemIcon
              sx={{
                minWidth: 0,
                mr: open ? 3 : 'auto',
                justifyContent: 'center',
              }}
            >
              <TemplateIcon color="warning" />
            </ListItemIcon>
            <ListItemText
              primary="Create from Template"
              sx={{ opacity: open ? 1 : 0 }}
            />
            {open && (templateMenuOpen ? <ExpandLess /> : <ExpandMore />)}
          </ListItemButton>

          {/* Template Configuration */}
          <Collapse in={open && templateMenuOpen} timeout="auto" unmountOnExit>
            <Box sx={{ px: 1.5, pb: 1.5 }}>
              <Paper elevation={1} sx={{ p: 1.5, backgroundColor: alpha(theme.palette.primary.main, 0.05) }}>
                <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
                  <InputLabel>Template Type</InputLabel>
                  <Select
                    value={templateParams.type}
                    label="Template Type"
                    onChange={(e) => setTemplateParams({ ...templateParams, type: e.target.value as any })}
                  >
                    <MenuItem value="single_agent">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <SingleAgentIcon fontSize="small" />
                        Single Agent
                      </Box>
                    </MenuItem>
                    <MenuItem value="hierarchical">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <HierarchicalIcon fontSize="small" />
                        Hierarchical
                      </Box>
                    </MenuItem>
                    <MenuItem value="sequential">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <SequentialIcon fontSize="small" />
                        Sequential
                      </Box>
                    </MenuItem>
                  </Select>
                </FormControl>

                {/* Template Parameters - Animated */}
                <Collapse in={true} timeout={300}>
                  <Box>
                    {/* Single Agent Parameters */}
                    {templateParams.type === 'single_agent' && (
                      <TextField
                        fullWidth
                        size="small"
                        label="Agent Name"
                        value={templateParams.agent_name}
                        onChange={(e) => setTemplateParams({ ...templateParams, agent_name: e.target.value })}
                        sx={{ mb: 1.5 }}
                      />
                    )}

                    {/* Hierarchical Parameters */}
                    {templateParams.type === 'hierarchical' && (
                      <Box>
                        <TextField
                          fullWidth
                          size="small"
                          type="number"
                          label="Levels"
                          value={templateParams.levels}
                          onChange={(e) => {
                            const levels = parseInt(e.target.value) || 2;
                            const agents_per_level = Array(levels).fill(0).map((_, i) => i === 0 ? 1 : 2);
                            setTemplateParams({ ...templateParams, levels, agents_per_level });
                          }}
                          slotProps={{
                            htmlInput: { min: 2, max: 5 }
                          }}
                          sx={{ mb: 1 }}
                        />
                        <Box sx={{ maxHeight: 120, overflowY: 'auto', pr: 0.5 }}>
                          {templateParams.agents_per_level?.map((count, index) => (
                            <TextField
                              key={index}
                              // fullWidth
                              size="small"
                              type="number"
                              label={`Level ${index + 1}`}
                              value={count}
                              onChange={(e) => updateAgentsPerLevel(index, parseInt(e.target.value) || (index === 0 ? 1 : 2))}
                              slotProps={{
                                htmlInput: { min: index === 0 ? 1 : 1, max: 10 }
                              }}
                              disabled={index === 0} // Frontman level always 1
                              sx={{ mb: 0.5, mt: 0.5 }}
                            />
                          ))}
                        </Box>
                      </Box>
                    )}

                    {/* Sequential Parameters */}
                    {templateParams.type === 'sequential' && (
                      <TextField
                        fullWidth
                        size="small"
                        type="number"
                        label="Sequence Length"
                        value={templateParams.sequence_length}
                        onChange={(e) => setTemplateParams({ ...templateParams, sequence_length: parseInt(e.target.value) || 3 })}
                        slotProps={{
                          htmlInput: { min: 2, max: 10 }
                        }}
                        sx={{ mb: 1.5 }}
                      />
                    )}
                  </Box>
                </Collapse>

                <Button
                  variant="contained"
                  size="small"
                  fullWidth
                  disabled={loading}
                  onClick={handleCreateFromTemplate}
                  sx={{ 
                    textTransform: 'none',
                    py: 0.75,
                    mt: 1
                  }}
                >
                  {loading ? 'Creating...' : 'Create from Template'}
                </Button>
              </Paper>
            </Box>
          </Collapse>
        </ListItem>
      </List>
    </Drawer>
  );
};

export default EditorPalette;
