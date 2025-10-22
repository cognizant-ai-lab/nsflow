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
import { Box, Typography, TextField, Button,  Paper, Card, CardContent, Chip, InputAdornment, 
  useTheme, alpha, Popper, MenuItem, MenuList, ClickAwayListener, Grow } from "@mui/material";
import { PolylineTwoTone as NetworkIcon, Search as SearchIcon, 
  SmartToy as RobotIcon, Refresh as RefreshIcon} from "@mui/icons-material";
import { useApiPort } from "../context/ApiPortContext";
import { useChatContext } from "../context/ChatContext";
import { getFeatureFlags } from "../utils/config";
import {extractProgressPayload } from "../utils/progressHelper";


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
    depth?: number;
    children?: string[];
    parent?: string;
    dropdown_tools?: string[];
    sub_networks?: string[];
  };
}

const EditorSidebar = ({ 
  onSelectNetwork, 
  refreshTrigger,
  externalSelectedNetwork 
}: { 
  onSelectNetwork: (network: string, designId?: string) => void;
  refreshTrigger?: number; // trigger refresh from external components
  externalSelectedNetwork?: string; // Network selected externally (from EditorPalette)
}) => {
  const [networkOptions, setNetworkOptions] = useState<NetworkOption[]>([]);
  const [agents, setAgents] = useState<AgentNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedNetworkId, setSelectedNetworkId] = useState<string>("");
  const [selectedNetworkOption, setSelectedNetworkOption] = useState<NetworkOption | null>(null);
  const [agentNetworkDefinition, setAgentNetworkDefinition] = useState<Record<string, any> | null>(null);
  const { apiUrl, isReady } = useApiPort();
  const { chatMessages, getLastProgressMessage, getLastSlyDataMessage, 
    progressTick, slyDataTick, lastProgressAt, lastSlyDataAt, targetNetwork } = useChatContext();
  const [searchQuery, setSearchQuery] = useState("");
  const [lastChatMessageCount, setLastChatMessageCount] = useState(0);
  const theme = useTheme();

  const networksEndRef = useRef<HTMLDivElement>(null);
  
  // Custom dropdown state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownSearchQuery, setDropdownSearchQuery] = useState("");
  const anchorRef = useRef<HTMLDivElement>(null);

  // Use manual editor plugin flag
  const { pluginManualEditor } = getFeatureFlags();
  const canEdit = !!pluginManualEditor;
  const didAutoSelectRef = useRef(false);
  const lastSeenNameRef = useRef<string | null>(null);

  // Edit-mode: Fetch networks with state
  const fetchNetworks = async () => {
    console.log(`canEdit value: ${canEdit}`)
    if (!isReady || !apiUrl || !canEdit) return;

    try {
      setLoading(true);
      const response = await fetch(`${apiUrl}/api/v1/andeditor/networks`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch networks: ${response.statusText}`);
      }

      const data: NetworksResponse = await response.json();
      // console.log('EditorSidebar: Raw API response:', data);
      
      // Convert only editing sessions to network options (registry networks handled by EditorPalette)
      const options: NetworkOption[] = [];
      
      // Add editing sessions only if the user canEdit
      data.editing_sessions.forEach(session => {
        const option = {
          id: session.design_id,
          display_name: session.network_name,
          type: 'editing_session' as const,
          agent_count: session.agent_count,
          source: session.source,
          design_id: session.design_id
        };
        // console.log('EditorSidebar: Creating network option:', option);
        options.push(option);
      });
      
      // console.log('EditorSidebar: Final network options:', options);
      setNetworkOptions(options);
      setError("");
    } catch (err: any) {
      console.error("Error fetching networks:", err);
      setError(`Failed to load networks: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Unified: fetch agents for both modes, returning the same nodes list
  const fetchAgents = async (networkOption?: NetworkOption, definitionOverride?: Record<string, any>) => {
    if (!isReady || !apiUrl) return;

    try {
      let response: Response;

      if (canEdit) {
        // Edit mode requires a design_id
        if (!networkOption?.design_id) {
          console.warn("fetchAgents: missing design_id in edit mode");
          return;
        }
        console.log("EditorSidebar: Fetching agents (edit) for", networkOption.display_name, "design_id:", networkOption.design_id);
        response = await fetch(`${apiUrl}/api/v1/andeditor/networks/${networkOption.design_id}/connectivity`);
      } else {
        // View-only mode requires an agentNetworkDefinition
        const definition = definitionOverride ?? agentNetworkDefinition;
        if (!definition) {
          console.warn("fetchAgents: agentNetworkDefinition is not set in view-only mode");
          return;
        }
        console.log("EditorSidebar: Fetching agents (view-only) from JSON definition");
        response = await fetch(`${apiUrl}/api/v1/connectivity/from_json`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent_network_definition: definition }),
        });
      }

      if (!response.ok) {
        const name = networkOption?.display_name || "(view-only)";
        throw new Error(`Failed to fetch agents for ${name} — HTTP ${response.status}`);
      }

      const data = await response.json();
      // Both endpoints return { nodes: [...] } — keep sidebar identical across modes
      if (Array.isArray(data.nodes)) {
        const sortedNodes = [...data.nodes].sort((a, b) =>
          a.data?.label?.localeCompare(b.data?.label ?? "", undefined, { sensitivity: "base" })
        );
        setAgents(sortedNodes);
      } else {
        setAgents([]);
      }
    } catch (err) {
      console.error("Error fetching agents:", err);
      setAgents([]);
    }
  };

  // Handle network selection
  const handleNetworkSelect = (networkId: string) => {
    const networkOption = networkOptions.find(option => option.id === networkId);
    if (!networkOption) return;

    setSelectedNetworkId(networkId);
    setSelectedNetworkOption(networkOption);
    onSelectNetwork(networkOption.display_name, canEdit ? networkOption.design_id : undefined);

    if (canEdit) {
      fetchAgents(networkOption);
    } else {
      // use current definition; refreshFromLogs already keeps it up to date
      fetchAgents(undefined, agentNetworkDefinition || undefined);
    }
  };

  // Filter agents based on search query
  const filteredAgents = agents.filter((agent) => {
    const label = (agent.data.label || "").toLowerCase();
    const instr = (agent.data.instructions || "").toLowerCase();
    const q = searchQuery.toLowerCase();
    return label.includes(q) || instr.includes(q);
  });

  // Filter network options based on dropdown search
  const filteredNetworkOptions = networkOptions.filter((option) =>
    option.display_name.toLowerCase().includes(dropdownSearchQuery.toLowerCase())
  );

  // Dropdown controls
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

  const refreshFromLogs = () => {
    // Prefer network-scoped latest, then fallback to global
    const latestProgress = getLastProgressMessage({ network: targetNetwork }) ?? getLastProgressMessage();
    const latestSly = getLastSlyDataMessage({ network: targetNetwork }) ?? getLastSlyDataMessage();

    // Decide which one to use based on which tick was updated last basis timestamp
    const preferProgress = lastProgressAt > lastSlyDataAt;

    const payload = preferProgress
      ? extractProgressPayload(latestProgress) || extractProgressPayload(latestSly)
      : extractProgressPayload(latestSly) || extractProgressPayload(latestProgress);
    // silently ignore; nothing to show yet
    if (!payload?.agent_network_definition || !payload?.agent_network_name) return;

    const nameFromPayload = payload.agent_network_name ?? "(new_agent_network)";

    // Ensure dropdown has exactly one option (view-only)
    const singleOption: NetworkOption = {
      id: nameFromPayload,
      display_name: nameFromPayload,
      type: "editing_session", // reused shape
      agent_count: Object.keys(payload.agent_network_definition!).length,
    };

    // always replace the list with the latest single option
    setNetworkOptions([singleOption]);
    setAgentNetworkDefinition(payload.agent_network_definition!);

    const nameChanged =
      lastSeenNameRef.current !== nameFromPayload ||
      selectedNetworkId !== nameFromPayload ||
      !selectedNetworkOption;

    // Keep selection semantics identical: nothing selected by default;
    // once we have a valid message, set it if not set already
    if (!canEdit && nameChanged) {
      didAutoSelectRef.current = true;
      lastSeenNameRef.current = nameFromPayload;

      setSelectedNetworkId(singleOption.id);
      setSelectedNetworkOption(singleOption);
      onSelectNetwork(singleOption.display_name); // no design_id in view-only
      fetchAgents(undefined, payload.agent_network_definition!); // avoid race
    }
  };

  /* -------------------- Effects -------------------- */
  // Reset selection to "none" whenever mode flips or app becomes ready
  useEffect(() => {
    setSelectedNetworkId("");
    setSelectedNetworkOption(null);
    setAgents([]);
    setError("");
  }, [canEdit, isReady]);

  // Initial load
  useEffect(() => {
    if (!isReady) return;
    if (canEdit) {
      fetchNetworks();
    } else {
      // reuse flow: hydrate from logs, then fetchAgents()
      refreshFromLogs();
    }
  }, [isReady, apiUrl, canEdit]);

  // Refresh from logs
  useEffect(() => {
    refreshFromLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressTick, slyDataTick, targetNetwork]);

  // External refresh trigger
  useEffect(() => {
    if (!refreshTrigger || refreshTrigger <= 0) return;
    if (canEdit) {
      fetchNetworks();
    } else {
      refreshFromLogs();
    }
  }, [refreshTrigger, canEdit]);

  // auto-select first session when none selected
  useEffect(() => {
    if (canEdit && networkOptions.length > 0 && !selectedNetworkId) {
      const firstNetwork = networkOptions[0];
      handleNetworkSelect(firstNetwork.id);
    }
  }, [networkOptions, selectedNetworkId, canEdit]);

  // EDIT MODE: handle external selection (EditorPalette)
  useEffect(() => {
    if (canEdit && externalSelectedNetwork && networkOptions.length > 0) {
      const option = networkOptions.find(o => o.display_name === externalSelectedNetwork);
      if (option && option.id !== selectedNetworkId) {
        handleNetworkSelect(option.id);
      }
    }
  }, [externalSelectedNetwork, networkOptions, selectedNetworkId, canEdit]);

  // monitor and refresh sessions/agents on new messages
  useEffect(() => {
    const currentCount = chatMessages.length;

    // Only react when count increases and not the initial system message
    if (currentCount > lastChatMessageCount && currentCount > 1) {
      setTimeout(() => {
        if (canEdit) {
          fetchNetworks();
          if (selectedNetworkOption) {
            fetchAgents(selectedNetworkOption);
          }
        } else {
          // reuse: update from logs, then unified fetchAgents()
          refreshFromLogs();
        }
      }, 1000);
    }

    setLastChatMessageCount(currentCount);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMessages.length, lastChatMessageCount, selectedNetworkOption, slyDataTick, canEdit]);

  // keep true by default, but turn it off in view mode:
  useEffect(() => {
    if (!canEdit) {
      setLoading(false);
      didAutoSelectRef.current = false;
      lastSeenNameRef.current = null;
    }
  }, [targetNetwork, canEdit]);

  // Rebuild agent list whenever the raw definition changes (view-only)
  useEffect(() => {
    if (canEdit) return;
    if (!agentNetworkDefinition) return;
    fetchAgents(undefined, agentNetworkDefinition);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, agentNetworkDefinition]);


  /* -------------------- Render -------------------- */
  return (
    <Paper
      elevation={0}
      sx={{
        height: "100%",
        backgroundColor: theme.palette.background.paper,
        borderRight: `1px solid ${theme.palette.divider}`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography
          variant="subtitle1"
          sx={{
            fontWeight: 600,
            color: theme.palette.text.primary,
            display: "flex",
            alignItems: "center",
            gap: 1,
            fontSize: "0.9rem",
            py: 0.5,
            mb: 1,
          }}
        >
          <NetworkIcon sx={{ fontSize: 18 }} color="primary" />
          Agent Networks
        </Typography>

        {/* Status / Errors */}
        {loading && (
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
            {canEdit ? "Loading sessions..." : "Waiting for activity…"}
          </Typography>
        )}
        {error && (
          <Typography
            variant="body2"
            sx={{ color: theme.palette.error.main, mb: 1 }}
          >
            {error}
          </Typography>
        )}

        {/* Selection (Edit mode dropdown) or View-only label */}
        {/* Selection: same dropdown for both modes */}
        {!loading && (
          <Box ref={anchorRef}>
            <TextField
              size="small"
              label={canEdit ? "Select editing session" : "Agent network"}
              value={selectedNetworkOption?.display_name || ""} // empty initially in view mode
              onClick={handleDropdownToggle} // clickable in both modes
              slotProps={{ input: { readOnly: true } }}
              fullWidth
              sx={{
                cursor: "pointer",
                "& .MuiOutlinedInput-notchedOutline": { borderColor: theme.palette.divider },
                "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: theme.palette.primary.main },
                "& .MuiInputBase-input": { cursor: "pointer" },
              }}
            />

            <Popper
              open={dropdownOpen}
              anchorEl={anchorRef.current}
              placement="bottom-start"
              style={{ zIndex: 1300, width: "400px" }}
              transition
            >
              {({ TransitionProps }) => (
                <Grow {...TransitionProps}>
                  <Paper elevation={8} sx={{ mt: 0.5, maxHeight: 300, overflow: "auto" }}>
                    <ClickAwayListener onClickAway={handleDropdownClose}>
                      <Box>
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
                                ),
                              },
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
                                onClick={() => { handleDropdownNetworkSelect(option.id); }}
                                selected={option.id === selectedNetworkId}
                                sx={{ minWidth: 350 }}
                              >
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
                                  <Box sx={{ flexGrow: 1 }}>
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        color: theme.palette.text.secondary,
                                        fontWeight: option.id === selectedNetworkId ? 600 : 400,
                                      }}
                                    >
                                      {option.display_name}
                                    </Typography>
                                  </Box>
                                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                                    <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                                      ({option.agent_count} agents)
                                    </Typography>
                                    <Chip
                                      label={canEdit ? "Editing" : "View"}
                                      size="small"
                                      color={canEdit ? "secondary" : "default"}
                                      sx={{ fontSize: "0.6rem", height: 16 }}
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

      {/* Search Box (both modes once selected) */}
      {selectedNetworkOption && (
        <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
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
                    <SearchIcon
                      sx={{ color: theme.palette.text.secondary, fontSize: 18 }}
                    />
                  </InputAdornment>
                ),
              },
            }}
            sx={{
              "& .MuiOutlinedInput-notchedOutline": {
                borderColor: theme.palette.divider,
              },
              "&:hover .MuiOutlinedInput-notchedOutline": {
                borderColor: theme.palette.primary.main,
              },
            }}
          />
        </Box>
      )}

      {/* Agents List */}
      <Box sx={{ flexGrow: 1, overflow: "auto" }}>
        {selectedNetworkOption ? (
          <Box sx={{ p: 1 }}>
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 600,
                color: theme.palette.text.primary,
                mb: 1,
                px: 1,
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <RobotIcon
                sx={{ color: theme.palette.success.main, fontSize: 18 }}
              />
              Agents ({filteredAgents.length})
            </Typography>

            {filteredAgents.length === 0 && (
              <Typography
                variant="body2"
                sx={{
                  color: theme.palette.text.secondary,
                  px: 1,
                  textAlign: "center",
                  py: 2,
                }}
              >
                {searchQuery
                  ? "No agents match your search"
                  : "No agents found"}
              </Typography>
            )}

            {filteredAgents.map((agent) => (
              <Card
                key={agent.id}
                elevation={1}
                sx={{
                  mb: 1,
                  borderLeft: `4px solid ${theme.palette.primary.main}`,
                  "&:hover": {
                    backgroundColor: alpha(theme.palette.primary.main, 0.05),
                    boxShadow: theme.shadows[2],
                  },
                  transition: "all 0.2s ease",
                }}
              >
                <CardContent sx={{ p: 0.5, "&:last-child": { pb: 0.5 } }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      color: theme.palette.text.primary,
                      mb: 0.5,
                    }}
                  >
                    {agent.data.label}
                  </Typography>

                  <Typography
                    variant="caption"
                    sx={{
                      color: theme.palette.text.secondary,
                      mb: 1,
                      lineHeight: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {agent.data.instructions || "No instructions provided."}
                  </Typography>

                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Chip
                      label={agent.data.is_defined ? "Defined" : "Referenced"}
                      size="small"
                      color={agent.data.is_defined ? "success" : "warning"}
                      sx={{ fontSize: "0.6rem", height: 15 }}
                    />
                    <Typography
                      variant="caption"
                      sx={{
                        color: theme.palette.text.secondary,
                        fontSize: "0.6rem",
                      }}
                    >
                      {agent.type}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        ) : (
          <Typography
            variant="body2"
            sx={{
              color: theme.palette.text.secondary,
              textAlign: "center",
              p: 2,
            }}
          >
            {canEdit
              ? "Select a network to view its agents"
              : "Waiting for activity…"}
          </Typography>
        )}

        <div ref={networksEndRef} />
      </Box>

      {/* Manual Refresh (edit mode only) */}
      <Box sx={{ p: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
        <Button
          variant="outlined"
          color="primary"
          fullWidth
          size="small"
          onClick={() => {
            if (canEdit) {
              fetchNetworks();
              if (selectedNetworkOption) {
                fetchAgents(selectedNetworkOption);
              }
            }
          }}
          disabled={loading || !canEdit}
          startIcon={<RefreshIcon />}
          sx={{
            textTransform: "none",
            fontSize: "0.75rem",
            "&:disabled": {
              backgroundColor: alpha(theme.palette.primary.main, 0.1),
            },
          }}
        >
          {loading ? "Refreshing..." : "Manual Refresh"}
        </Button>
      </Box>
    </Paper>
  );
};

export default EditorSidebar;
