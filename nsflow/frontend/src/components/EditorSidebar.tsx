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
  Select, 
  MenuItem, 
  FormControl, 
  InputLabel, 
  Card, 
  CardContent, 
  Chip, 
  InputAdornment, 
  useTheme,
  alpha
} from "@mui/material";
import { 
  PolylineTwoTone as NetworkIcon,
  Search as SearchIcon,
  SmartToy as RobotIcon,
  Refresh as RefreshIcon
} from "@mui/icons-material";
import { useApiPort } from "../context/ApiPortContext";
import { useChatContext } from "../context/ChatContext";

interface NetworkInfo {
  name: string;
  last_updated?: string;
  source?: string;
  has_state: boolean;
  agent_count?: number;
  agents?: string[];
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

const EditorSidebar = ({ onSelectNetwork }: { onSelectNetwork: (network: string) => void }) => {
  const [networks, setNetworks] = useState<NetworkInfo[]>([]);
  const [agents, setAgents] = useState<AgentNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedNetwork, setSelectedNetwork] = useState<string>("");
  const { apiUrl, isReady } = useApiPort();
  const { chatMessages } = useChatContext();
  const [searchQuery, setSearchQuery] = useState("");
  const [lastChatMessageCount, setLastChatMessageCount] = useState(0);
  const theme = useTheme();

  const networksEndRef = useRef<HTMLDivElement>(null);

  // Fetch networks with state
  const fetchNetworks = async () => {
    if (!isReady || !apiUrl) return;

    try {
      setLoading(true);
      const response = await fetch(`${apiUrl}/api/v1/andeditor/state/networks`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch networks: ${response.statusText}`);
      }

      const data = await response.json();
      setNetworks(data.networks || []);
      setError("");
    } catch (err: any) {
      console.error("Error fetching networks:", err);
      setError(`Failed to load networks: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Fetch agents for selected network
  const fetchAgents = async (networkName: string) => {
    if (!isReady || !apiUrl || !networkName) return;

    try {
      const response = await fetch(`${apiUrl}/api/v1/andeditor/state/connectivity/${networkName}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch agents for ${networkName}`);
      }

      const data = await response.json();
      setAgents(data.nodes || []);
    } catch (err: any) {
      console.error("Error fetching agents:", err);
      setAgents([]);
    }
  };

  // Handle network selection
  const handleNetworkSelect = (networkName: string) => {
    setSelectedNetwork(networkName);
    onSelectNetwork(networkName);
    fetchAgents(networkName);
  };

  // Filter agents based on search query
  const filteredAgents = agents.filter((agent) =>
    agent.data.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.data.instructions.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Initial load
  useEffect(() => {
    fetchNetworks();
  }, [isReady, apiUrl]);

  // Auto-select first network if available
  useEffect(() => {
    if (networks.length > 0 && !selectedNetwork) {
      const firstNetwork = networks[0];
      handleNetworkSelect(firstNetwork.name);
    }
  }, [networks]);

  // Monitor chat messages to refresh networks/agents when new activity occurs
  useEffect(() => {
    const currentMessageCount = chatMessages.length;
    
    // Only refresh if message count increased and we're not dealing with the initial system message
    if (currentMessageCount > lastChatMessageCount && currentMessageCount > 1) {
      console.log(`New chat message detected (${lastChatMessageCount} → ${currentMessageCount}), refreshing networks and agents...`);
      
      // Refresh networks and agents after a short delay to allow backend processing
      setTimeout(() => {
        fetchNetworks();
        if (selectedNetwork) {
          fetchAgents(selectedNetwork);
        }
      }, 1000); // 1 second delay to allow backend to process agent creation
    }
    
    setLastChatMessageCount(currentMessageCount);
  }, [chatMessages.length, lastChatMessageCount, selectedNetwork]);

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
        <Typography variant="h6" sx={{ 
          fontWeight: 600, 
          color: theme.palette.text.primary,
          mb: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 1
        }}>
          <NetworkIcon color="primary" />
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

        {!loading && networks.length > 0 && (
          <FormControl fullWidth size="small">
            <InputLabel>Select a network</InputLabel>
            <Select
              value={selectedNetwork}
              label="Select a network"
              onChange={(e) => handleNetworkSelect(e.target.value)}
              sx={{
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: theme.palette.divider
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: theme.palette.primary.main
                }
              }}
            >
              <MenuItem value="">
                <em>Select a network...</em>
              </MenuItem>
              {networks.map((network) => (
                <MenuItem key={network.name} value={network.name}>
                  {network.name} ({network.agent_count || 0} agents)
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </Box>

      {/* Search Box */}
      {selectedNetwork && (
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
        {selectedNetwork && (
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
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
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
                    lineHeight: 1.3,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical'
                  }}>
                    {agent.data.instructions || "No instructions provided"}
                  </Typography>
                  
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip 
                      label={agent.data.is_defined ? 'Defined' : 'Referenced'}
                      size="small"
                      color={agent.data.is_defined ? 'success' : 'warning'}
                      sx={{ fontSize: '0.65rem', height: 20 }}
                    />
                    <Typography variant="caption" sx={{ 
                      color: theme.palette.text.secondary,
                      fontSize: '0.65rem'
                    }}>
                      {agent.type}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}

        {!selectedNetwork && (
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
            if (selectedNetwork) {
              fetchAgents(selectedNetwork);
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
