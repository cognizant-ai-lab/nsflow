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

import { useEffect, useState, useRef } from "react";
import { 
  Box, 
  Typography, 
  TextField, 
  Button, 
  Paper, 
  Card, 
  CardContent, 
  Chip, 
  InputAdornment, 
  useTheme,
  alpha,
  Popper,
  MenuItem,
  MenuList,
  ClickAwayListener,
  Grow
} from "@mui/material";
import { 
  PolylineTwoTone as NetworkIcon,
  Search as SearchIcon,
  SmartToy as RobotIcon,
  Refresh as RefreshIcon
} from "@mui/icons-material";
import { useApiPort } from "../context/ApiPortContext";
import { useChatContext } from "../context/ChatContext";


interface EditingSession {
  design_id: string;
  network_name: string;
  original_network_name?: string;
  source: string;
  agent_count: number;
  created_at: string;
  updated_at: string;
  can_undo: boolean;
  can_redo: boolean;
  validation?: any;
}

interface NetworksResponse {
  registry_networks: string[];
  editing_sessions: EditingSession[];
  total_registry: number;
  total_sessions: number;
}

interface NetworkOption {
  id: string; // design_id for editing sessions, network name for registry
  display_name: string;
  type: 'registry' | 'editing_session';
  agent_count: number;
  source?: string;
  design_id?: string; // Only for editing sessions
}

interface AgentNode {
  id: string;
  type: string;
  data: {
    label: string;
    instructions: string;
    is_defined: boolean;
    network_name?: string;
  };
}

const EditorSidebar = ({ 
  onSelectNetwork, 
  refreshTrigger,
  externalSelectedNetwork 
}: { 
  onSelectNetwork: (network: string, designId?: string) => void;
  refreshTrigger?: number; // Used to trigger refresh from external components
  externalSelectedNetwork?: string; // Network selected externally (from EditorPalette)
}) => {
  const [networkOptions, setNetworkOptions] = useState<NetworkOption[]>([]);
  const [agents, setAgents] = useState<AgentNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedNetworkId, setSelectedNetworkId] = useState<string>("");
  const [selectedNetworkOption, setSelectedNetworkOption] = useState<NetworkOption | null>(null);
  const { apiUrl, isReady } = useApiPort();
  const { chatMessages } = useChatContext();
  const [searchQuery, setSearchQuery] = useState("");
  const [lastChatMessageCount, setLastChatMessageCount] = useState(0);
  const theme = useTheme();

  const networksEndRef = useRef<HTMLDivElement>(null);
  
  // Custom dropdown state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownSearchQuery, setDropdownSearchQuery] = useState("");
  const anchorRef = useRef<HTMLDivElement>(null);

  // Fetch networks with state
  const fetchNetworks = async () => {
    if (!isReady || !apiUrl) return;

    try {
      setLoading(true);
      const response = await fetch(`${apiUrl}/api/v1/andeditor/networks`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch networks: ${response.statusText}`);
      }

      const data: NetworksResponse = await response.json();
      console.log('EditorSidebar: Raw API response:', data);
      
      // Convert only editing sessions to network options (registry networks handled by EditorPalette)
      const options: NetworkOption[] = [];
      
      // Add editing sessions only
      data.editing_sessions.forEach(session => {
        const option = {
          id: session.design_id,
          display_name: session.network_name,
          type: 'editing_session' as const,
          agent_count: session.agent_count,
          source: session.source,
          design_id: session.design_id
        };
        console.log('EditorSidebar: Creating network option:', option);
        options.push(option);
      });
      
      console.log('EditorSidebar: Final network options:', options);
      setNetworkOptions(options);
      setError("");
    } catch (err: any) {
      console.error("Error fetching networks:", err);
      setError(`Failed to load networks: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Fetch agents for selected network (only editing sessions now)
  const fetchAgents = async (networkOption: NetworkOption) => {
    if (!isReady || !apiUrl || !networkOption) return;

    try {
      console.log('EditorSidebar: Fetching agents for network:', networkOption.display_name, 'design_id:', networkOption.design_id);
      // All networks in sidebar are editing sessions, so use the design_id connectivity endpoint
      const response = await fetch(`${apiUrl}/api/v1/andeditor/networks/${networkOption.design_id}/connectivity`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch agents for ${networkOption.display_name}`);
      }

      const data = await response.json();
      console.log('EditorSidebar: Fetched agents data:', data);
      setAgents(data.nodes || []);
    } catch (err: any) {
      console.error("Error fetching agents:", err);
      setAgents([]);
    }
  };

  // Handle network selection
  const handleNetworkSelect = (networkId: string) => {
    console.log('EditorSidebar: Network selected, networkId:', networkId);
    console.log('EditorSidebar: Available network options:', networkOptions);
    
    const networkOption = networkOptions.find(option => option.id === networkId);
    if (!networkOption) {
      console.error('EditorSidebar: Network option not found for id:', networkId);
      return;
    }
    
    console.log('EditorSidebar: Selected network option:', networkOption);
    console.log('EditorSidebar: Calling onSelectNetwork with:', {
      networkName: networkOption.display_name,
      designId: networkOption.design_id
    });
    
    setSelectedNetworkId(networkId);
    setSelectedNetworkOption(networkOption);
    onSelectNetwork(networkOption.display_name, networkOption.design_id);
    fetchAgents(networkOption);
  };

  // Filter agents based on search query
  const filteredAgents = agents.filter((agent) =>
    agent.data.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.data.instructions.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter network options based on dropdown search
  const filteredNetworkOptions = networkOptions.filter((option) =>
    option.display_name.toLowerCase().includes(dropdownSearchQuery.toLowerCase())
  );

  // Handle dropdown toggle
  const handleDropdownToggle = () => {
    setDropdownOpen(!dropdownOpen);
    setDropdownSearchQuery("");
  };

  // Handle dropdown close
  const handleDropdownClose = () => {
    setDropdownOpen(false);
    setDropdownSearchQuery("");
  };

  // Handle network selection from dropdown
  const handleDropdownNetworkSelect = (networkId: string) => {
    handleNetworkSelect(networkId);
    handleDropdownClose();
  };

  // Initial load
  useEffect(() => {
    fetchNetworks();
  }, [isReady, apiUrl]);

  // Refresh when external trigger changes (from EditorPalette)
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      fetchNetworks();
    }
  }, [refreshTrigger]);

  // Auto-select first network if available
  useEffect(() => {
    if (networkOptions.length > 0 && !selectedNetworkId) {
      const firstNetwork = networkOptions[0];
      handleNetworkSelect(firstNetwork.id);
    }
  }, [networkOptions]);

  // Handle external network selection (from EditorPalette)
  useEffect(() => {
    if (externalSelectedNetwork && networkOptions.length > 0) {
      const networkOption = networkOptions.find(option => option.display_name === externalSelectedNetwork);
      if (networkOption && networkOption.id !== selectedNetworkId) {
        handleNetworkSelect(networkOption.id);
      }
    }
  }, [externalSelectedNetwork, networkOptions, selectedNetworkId]);

  // Monitor chat messages to refresh networks/agents when new activity occurs
  useEffect(() => {
    const currentMessageCount = chatMessages.length;
    
    // Only refresh if message count increased and we're not dealing with the initial system message
    if (currentMessageCount > lastChatMessageCount && currentMessageCount > 1) {
      console.log(`New chat message detected (${lastChatMessageCount} → ${currentMessageCount}), refreshing networks and agents...`);
      
      // Refresh networks and agents after a short delay to allow backend processing
      setTimeout(() => {
        fetchNetworks();
        if (selectedNetworkOption) {
          fetchAgents(selectedNetworkOption);
        }
      }, 1000); // 1 second delay to allow backend to process agent creation
    }
    
    setLastChatMessageCount(currentMessageCount);
  }, [chatMessages.length, lastChatMessageCount, selectedNetworkOption]);

  return (
    <Paper
      elevation={0}
      sx={{
        height: '100%',
        backgroundColor: theme.palette.background.paper,
        borderRight: `1px solid ${theme.palette.divider}`,
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Header */}
      <Box sx={{ 
        p: 2, 
        borderBottom: `1px solid ${theme.palette.divider}` 
      }}>
        {/* Compact Header */}
        <Typography variant="subtitle1" sx={{ 
          fontWeight: 600, 
          color: theme.palette.text.primary,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          fontSize: '0.9rem',
          py: 0.5,
          mb: 1
        }}>
          <NetworkIcon sx={{ fontSize: 18 }} color="primary" />
          Agent Networks
        </Typography>

        {/* Network Selection */}
        {loading && (
          <Typography variant="body2" sx={{ 
            color: theme.palette.text.secondary 
          }}>
            Loading networks...
          </Typography>
        )}

        {error && (
          <Typography variant="body2" sx={{ 
            color: theme.palette.error.main,
            mb: 1
          }}>
            {error}
          </Typography>
        )}

        {!loading && networkOptions.length > 0 && (
          <Box ref={anchorRef}>
            <TextField
              size="small"
              label="Select editing session"
              value={selectedNetworkOption?.display_name || ""}
              onClick={handleDropdownToggle}
              slotProps={{
                input: {
                  readOnly: true
                }
              }}
              fullWidth
              sx={{
                cursor: 'pointer',
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: theme.palette.divider
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: theme.palette.primary.main
                },
                '& .MuiInputBase-input': {
                  cursor: 'pointer'
                }
              }}
            />
            <Popper
              open={dropdownOpen}
              anchorEl={anchorRef.current}
              placement="bottom-start"
              style={{ zIndex: 1300, width: '400px' }}
              transition
            >
              {({ TransitionProps }) => (
                <Grow {...TransitionProps}>
                  <Paper elevation={8} sx={{ mt: 0.5, maxHeight: 300, overflow: 'auto' }}>
                    <ClickAwayListener onClickAway={handleDropdownClose}>
                      <Box>
                        {/* Search within dropdown */}
                        <Box sx={{ p: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
                          <TextField
                            size="small"
                            placeholder="Search networks..."
                            value={dropdownSearchQuery}
                            onChange={(e) => setDropdownSearchQuery(e.target.value)}
                            fullWidth
                            slotProps={{
                              input: {
                                startAdornment: (
                                  <InputAdornment position="start">
                                    <SearchIcon sx={{ color: theme.palette.text.secondary, fontSize: 18 }} />
                                  </InputAdornment>
                                )
                              }
                            }}
                          />
                        </Box>
                        <MenuList>
                          {filteredNetworkOptions.length === 0 ? (
                            <MenuItem disabled>
                              <Typography variant="body2" sx={{ color: theme.palette.text.primary }}>
                                No networks found
                              </Typography>
                            </MenuItem>
                          ) : (
                            filteredNetworkOptions.map((option) => (
                              <MenuItem
                                key={option.id}
                                onClick={() => handleDropdownNetworkSelect(option.id)}
                                selected={option.id === selectedNetworkId}
                                sx={{ minWidth: 350 }}
                              >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                                  <Box sx={{ flexGrow: 1 }}>
                                    <Typography variant="body2" sx={{ color: theme.palette.text.secondary, fontWeight: option.id === selectedNetworkId ? 600 : 400 }}>
                                      {option.display_name}
                                    </Typography>
                                  </Box>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                                      ({option.agent_count} agents)
                                    </Typography>
                                    <Chip 
                                      label="Editing"
                                      size="small"
                                      color="secondary"
                                      sx={{ fontSize: '0.6rem', height: 16 }}
                                    />
                                  </Box>
                                </Box>
                              </MenuItem>
                            ))
                          )}
                        </MenuList>
                      </Box>
                    </ClickAwayListener>
                  </Paper>
                </Grow>
              )}
            </Popper>
          </Box>
        )}
      </Box>

      {/* Search Box */}
      {selectedNetworkOption && (
        <Box sx={{ 
          p: 2, 
          borderBottom: `1px solid ${theme.palette.divider}` 
        }}>
          <TextField
            size="small"
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            fullWidth
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: theme.palette.text.secondary, fontSize: 18 }} />
                  </InputAdornment>
                )
              }
            }}
            sx={{
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: theme.palette.divider
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: theme.palette.primary.main
              }
            }}
          />
        </Box>
      )}

      {/* Agents List */}
      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        {selectedNetworkOption && (
          <Box sx={{ p: 1 }}>
            <Typography variant="subtitle2" sx={{ 
              fontWeight: 600, 
              color: theme.palette.text.primary,
              mb: 1,
              px: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}>
              <RobotIcon sx={{ color: theme.palette.success.main, fontSize: 18 }} />
              Agents ({filteredAgents.length})
            </Typography>

            {filteredAgents.length === 0 && (
              <Typography variant="body2" sx={{ 
                color: theme.palette.text.secondary,
                px: 1,
                textAlign: 'center',
                py: 2
              }}>
                {searchQuery ? "No agents match your search" : "No agents found"}
              </Typography>
            )}

            {filteredAgents.map((agent) => (
              <Card
                key={agent.id}
                elevation={1}
                sx={{
                  mb: 1,
                  borderLeft: `4px solid ${theme.palette.primary.main}`,
                  '&:hover': {
                    backgroundColor: alpha(theme.palette.primary.main, 0.05),
                    boxShadow: theme.shadows[2]
                  },
                  transition: 'all 0.2s ease'
                }}
              >
                <CardContent sx={{ p: 0.5, '&:last-child': { pb: 0.5 } }}>
                  <Typography variant="body2" sx={{ 
                    fontWeight: 600, 
                    color: theme.palette.text.primary,
                    mb: 0.5
                  }}>
                    {agent.data.label}
                  </Typography>
                  
                  <Typography variant="caption" sx={{ 
                    color: theme.palette.text.secondary,
                    mb: 1,
                    lineHeight: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical'
                  }}>
                    {agent.data.instructions || "No instructions provided."}
                  </Typography>
                  
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip 
                      label={agent.data.is_defined ? 'Defined' : 'Referenced'}
                      size="small"
                      color={agent.data.is_defined ? 'success' : 'warning'}
                      sx={{ fontSize: '0.6rem', height: 15 }}
                    />
                    <Typography variant="caption" sx={{ 
                      color: theme.palette.text.secondary,
                      fontSize: '0.6rem'
                    }}>
                      {agent.type}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}

        {!selectedNetworkOption && (
          <Typography variant="body2" sx={{ 
            color: theme.palette.text.secondary,
            textAlign: 'center',
            p: 2
          }}>
            Select a network to view its agents
          </Typography>
        )}

        <div ref={networksEndRef} />
      </Box>

      {/* Manual Refresh Button */}
      <Box sx={{ 
        p: 2, 
        borderTop: `1px solid ${theme.palette.divider}` 
      }}>
        <Button
          variant="outlined"
          color="primary"
          fullWidth
          size="small"
          onClick={() => {
            fetchNetworks();
            if (selectedNetworkOption) {
              fetchAgents(selectedNetworkOption);
            }
          }}
          disabled={loading}
          startIcon={<RefreshIcon />}
          sx={{
            textTransform: 'none',
            fontSize: '0.75rem',
            '&:disabled': {
              backgroundColor: alpha(theme.palette.primary.main, 0.1)
            }
          }}
        >
          {loading ? "Refreshing..." : "Manual Refresh"}
        </Button>
      </Box>
    </Paper>
  );
};

export default EditorSidebar;
