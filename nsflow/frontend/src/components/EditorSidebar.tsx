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

import { useEffect, useState, useRef, useCallback } from "react";
import { Box, Typography, TextField, Paper, Card, CardContent, Chip, InputAdornment,
  useTheme, alpha, Autocomplete, CircularProgress, Tooltip } from "@mui/material";
import NetworkIcon from "@mui/icons-material/PolylineTwoTone";
import SearchIcon from "@mui/icons-material/Search";
import RobotIcon from "@mui/icons-material/SmartToy";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CloseIcon from "@mui/icons-material/Close";
import { useApiPort } from "../context/ApiPortContext";
import { useChatContext } from "../context/ChatContext";
import { useChatControls } from "../hooks/useChatControls";
import { useNeuroSan } from "../context/NeuroSanContext";
import { toServedNetworkPath } from "../utils/config";
import { selectEntry, useEditorNetworkStore } from "../state/editorNetworkStore";
import { buildEditorGraph } from "../state/editorGraph";
import { toConnectivityList } from "../state/definitionShape";
import type { ConnectivityInfo } from "../uiCommon";




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
  const [agents, setAgents] = useState<AgentNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedNetworkId, setSelectedNetworkId] = useState<string>("");
  const [selectedNetworkOption, setSelectedNetworkOption] = useState<NetworkOption | null>(null);
  const [agentNetworkDefinition, setAgentNetworkDefinition] = useState<Record<string, any> | null>(null);
  const { apiUrl, isReady } = useApiPort();
  const { chatMessages, getLatestNetworkPayload,
    progressTick, slyDataTick, targetNetwork,
    activeNetwork, addSlyDataMessage, regenerateSessionId, waitingForAgent } = useChatContext();
  const { host, port, connectionType, isNsReady } = useNeuroSan();
  const { stopWebSocket, clearChat } = useChatControls();
  const [searchQuery, setSearchQuery] = useState("");
  const [lastChatMessageCount, setLastChatMessageCount] = useState(0);
  const theme = useTheme();

  // The store is the authority for the definition the sidebar lists.
  const entry = useEditorNetworkStore((state) => selectEntry(state, selectedNetworkId));
  const reconcileFromServer = useEditorNetworkStore((state) => state.reconcileFromServer);

  // Load Existing Agent Network state (view mode)
  const [availableNetworks, setAvailableNetworks] = useState<string[]>([]);
  const [loadingNetworks, setLoadingNetworks] = useState(false);
  const [loadingDefinition, setLoadingDefinition] = useState(false);
  const [selectedLoadNetwork, setSelectedLoadNetwork] = useState<string | null>(null);

  const networksEndRef = useRef<HTMLDivElement>(null);
  
  // Custom dropdown state

  const didAutoSelectRef = useRef(false);
  const lastSeenNameRef = useRef<string | null>(null);
  const designPlaceholderRef = useRef<string | null>(null);

  // Build the sidebar's agent list from the store. This used to POST the
  // definition to /connectivity/from_json (or GET the andeditor session) purely to
  // turn it into nodes; buildEditorGraph does the same thing in the browser.
  const refreshAgentsFromStore = useCallback(
    (definitionOverride?: unknown) => {
      // Normalised, never trusted as a list. Callers hand this the raw
      // agent_network_definition straight off a progress frame, and the designer's
      // default progress style reports it as a DICT keyed by agent name. A dict has
      // no `length`, so the empty check passed and buildEditorGraph then iterated an
      // object: "is not iterable", thrown during render, blanking the whole page.
      const definition =
        (definitionOverride === undefined
          ? entry?.definition
          : toConnectivityList(definitionOverride)) ?? [];
      if (definition.length === 0) {
        setAgents([]);
        return;
      }
      const { nodes } = buildEditorGraph(definition, entry?.networkName ?? selectedNetworkId ?? "");
      setAgents(
        [...nodes].sort((a, b) =>
          String(a.data?.label ?? "").localeCompare(String(b.data?.label ?? ""), undefined, {
            sensitivity: "base",
          })
        ) as unknown as AgentNode[]
      );
    },
    [entry?.definition, entry?.networkName, selectedNetworkId]
  );

  // Filter agents based on search query
  const filteredAgents = agents.filter((agent) => {
    const label = (agent.data.label || "").toLowerCase();
    const instr = (agent.data.instructions || "").toLowerCase();
    const q = searchQuery.toLowerCase();
    return label.includes(q) || instr.includes(q);
  });

  // Dropdown controls
  const refreshFromLogs = () => {
    const payload = getLatestNetworkPayload();
    // silently ignore; nothing to show yet
    if (!payload?.agent_network_definition) return;

    // Use the name from the payload if available, otherwise keep the previously seen name.
    // Pick a fun placeholder once per design session so it stays consistent.
    if (payload.agent_network_name) {
      designPlaceholderRef.current = null; // reset for next session
    } else if (!designPlaceholderRef.current) {
      const placeholders = [
        "designing the agent network...",
        "architecting the agents...",
        "wiring up the agent web...",
        "assembling the agent squad...",
        "forging the collective agents...",
        "orchestrating the swarm...",
        "weaving the agent tapestry...",
        "spinning up the agents...",
        "blueprinting the agent network...",
        "rallying the digital workforce...",
        "conjuring the agent council...",
      ];
      designPlaceholderRef.current = placeholders[Math.floor(Math.random() * placeholders.length)];
    }
    // For a real generated-network name, show the path it is actually served under
    // (e.g. "generated/foo") so the sidebar, the "Editing:" card, and the launch URL all
    // agree and match /api/v1/list. The placeholder and the last-seen fallback are left
    // untouched (the placeholder must never be prefixed).
    const nameFromPayload = payload.agent_network_name
      ? toServedNetworkPath(payload.agent_network_name)
      : (lastSeenNameRef.current || designPlaceholderRef.current!);

    // Ensure dropdown has exactly one option (view-only)
    const singleOption: NetworkOption = {
      id: nameFromPayload,
      display_name: nameFromPayload,
      type: "editing_session", // reused shape
      agent_count: Object.keys(payload.agent_network_definition!).length,
    };

    setAgentNetworkDefinition(payload.agent_network_definition!);

    const nameChanged =
      lastSeenNameRef.current !== nameFromPayload ||
      selectedNetworkId !== nameFromPayload ||
      !selectedNetworkOption;

    // Keep selection semantics identical: nothing selected by default;
    // once we have a valid message, set it if not set already
    if (nameChanged) {
      didAutoSelectRef.current = true;
      lastSeenNameRef.current = nameFromPayload;

      setSelectedNetworkId(singleOption.id);
      setSelectedNetworkOption(singleOption);
      setSelectedLoadNetwork(nameFromPayload); // Sync the Autocomplete display
      onSelectNetwork(singleOption.display_name); // no design_id in view-only
      refreshAgentsFromStore(payload.agent_network_definition); // avoid race
    }
  };

  // Fetch available networks for Load Existing dropdown (view mode)
  useEffect(() => {
    if (!isNsReady || !apiUrl) return;
    const fetchAvailableNetworks = async () => {
      setLoadingNetworks(true);
      try {
        const params = new URLSearchParams();
        if (connectionType) params.set("connection_type", connectionType);
        if (host) params.set("host", host);
        if (port) params.set("port", String(port));
        const response = await fetch(`${apiUrl}/api/v1/list?${params.toString()}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        if (response.ok) {
          const data = await response.json();
          const names: string[] = (data.agents || []).map((a: any) => a.agent_name);
          setAvailableNetworks(names);
        }
      } catch (e) {
        console.error("Failed to fetch network list for editor sidebar:", e);
      } finally {
        setLoadingNetworks(false);
      }
    };
    fetchAvailableNetworks();
  }, [isNsReady, apiUrl, connectionType, host, port]);

  // Handler for loading an existing network (view mode)
  const handleLoadExistingNetwork = useCallback(async (networkName: string | null) => {
    setSelectedLoadNetwork(networkName);

    if (!networkName) {
      window.location.reload();
      return;
    }

    if (!apiUrl) return;

    // Clear previous chat session and reconnect with fresh WebSocket
    stopWebSocket();
    clearChat();
    regenerateSessionId(); // Triggers TabbedChatPanel to reconnect WebSocket

    setLoadingDefinition(true);
    try {
      const response = await fetch(`${apiUrl}/api/v1/network_definition/${encodeURIComponent(networkName)}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        console.error("Failed to load network definition:", errData.detail || response.statusText);
        return;
      }
      const payload = await response.json();
      const definition = payload?.agent_network_definition ?? payload;
      // Straight into the store, which the canvas and this sidebar both render
      // from. The old code posted it back as a sly_data chat message purely so it
      // would come back around through the stream.
      if (definition) {
        reconcileFromServer(networkName, {
          definition: Array.isArray(definition)
            ? (definition as ConnectivityInfo[])
            : Object.entries(definition).map(([origin, v]) => ({
                // Spread first. With it last it overwrote the tools computed just
                // below, which is the one key here that has to end up an array.
                ...((v ?? {}) as Record<string, unknown>),
                origin,
                tools: ((v ?? {}) as { tools?: string[]; down_chains?: string[] }).tools ??
                  ((v ?? {}) as { down_chains?: string[] }).down_chains ?? [],
              })) as ConnectivityInfo[],
          networkName,
        });
        setSelectedNetworkId(networkName);
      }
    } catch (e) {
      console.error("Error loading network definition:", e);
    } finally {
      setLoadingDefinition(false);
    }
  }, [apiUrl, targetNetwork, activeNetwork, addSlyDataMessage]);

  /* -------------------- Effects -------------------- */
  // Reset selection to "none" whenever mode flips or app becomes ready
  useEffect(() => {
    setSelectedNetworkId("");
    setSelectedNetworkOption(null);
    setAgents([]);
    setError("");
  }, [isReady]);

  // Initial load
  useEffect(() => {
    if (!isReady) return;
    // hydrate from whatever the streams have already reported
    refreshFromLogs();
  }, [isReady, apiUrl]);

  // Refresh from logs
  useEffect(() => {
    refreshFromLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressTick, slyDataTick, targetNetwork]);

  // External refresh trigger
  useEffect(() => {
    if (!refreshTrigger || refreshTrigger <= 0) return;
    refreshFromLogs();
  }, [refreshTrigger]);

  // auto-select first session when none selected
  // Select whatever the palette picked.
  useEffect(() => {
    if (externalSelectedNetwork && externalSelectedNetwork !== selectedNetworkId) {
      setSelectedNetworkId(externalSelectedNetwork);
      onSelectNetwork(externalSelectedNetwork);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalSelectedNetwork]);

  // monitor and refresh sessions/agents on new messages
  useEffect(() => {
    const currentCount = chatMessages.length;

    // Only react when count increases and not the initial system message
    if (currentCount > lastChatMessageCount && currentCount > 1) {
      setTimeout(() => {
        refreshFromLogs();
      }, 1000);
    }

    setLastChatMessageCount(currentCount);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMessages.length, lastChatMessageCount, selectedNetworkOption, slyDataTick]);

  // keep true by default, but turn it off in view mode:
  useEffect(() => {
    setLoading(false);
    didAutoSelectRef.current = false;
    lastSeenNameRef.current = null;
  }, [targetNetwork]);

  // Rebuild agent list whenever the raw definition changes (view-only)
  useEffect(() => {
    if (!agentNetworkDefinition) return;
    refreshAgentsFromStore(agentNetworkDefinition);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentNetworkDefinition]);

  // Auto-load network from URL query param (e.g. /editor?loadNetwork=basic/hello_world)
  const [autoLoadHandled, setAutoLoadHandled] = useState(false);
  useEffect(() => {
    if (autoLoadHandled || loadingNetworks || !availableNetworks.length) return;
    const params = new URLSearchParams(window.location.search);
    const loadNetwork = params.get('loadNetwork');
    if (loadNetwork && availableNetworks.includes(loadNetwork)) {
      setAutoLoadHandled(true);
      // Clean the URL so reload doesn't re-trigger
      const url = new URL(window.location.href);
      url.searchParams.delete('loadNetwork');
      window.history.replaceState({}, '', url.toString());
      handleLoadExistingNetwork(loadNetwork);
    } else {
      setAutoLoadHandled(true);
    }
  }, [loadingNetworks, availableNetworks, autoLoadHandled, handleLoadExistingNetwork]);


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
            Waiting for activity…
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

        {/* Load an existing agent network */}
        {!loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Autocomplete
              size="small"
              disabled={waitingForAgent}
              options={(() => {
                const sorted = [...availableNetworks].sort((a, b) => {
                  const folderA = a.split('/').slice(0, -1).join('/');
                  const folderB = b.split('/').slice(0, -1).join('/');
                  if (folderA !== folderB) return folderA.localeCompare(folderB);
                  return a.localeCompare(b);
                });
                // Include the wand-generated name so the Autocomplete can display it
                if (selectedLoadNetwork && !sorted.includes(selectedLoadNetwork)) {
                  sorted.unshift(selectedLoadNetwork);
                }
                return sorted;
              })()}
              groupBy={(option) => option.split('/').slice(0, -1).join('/') || ''}
              loading={loadingNetworks || loadingDefinition}
              value={selectedLoadNetwork}
              onChange={(_event, value) => handleLoadExistingNetwork(value)}
              renderGroup={(params) => (
                <li key={params.key}>
                  {params.group && (
                    <Box
                      component="div"
                      sx={{
                        fontSize: 12,
                        fontWeight: 700,
                        lineHeight: '28px',
                        minHeight: 28,
                        pl: 1,
                        color: theme.palette.text.secondary,
                        position: 'sticky',
                        top: -4,
                        zIndex: 1,
                        backgroundColor: theme.palette.mode === 'dark' ? '#1a2e1e' : '#e8f5e9',
                      }}
                    >
                      {params.group}
                    </Box>
                  )}
                  <ul style={{ padding: 0 }}>{params.children}</ul>
                </li>
              )}
              clearIcon={
                <Tooltip title="Clearing this agent-network will reset the Editor to its default state">
                  <CloseIcon sx={{ fontSize: 18 }} />
                </Tooltip>
              }
              slotProps={{
                clearIndicator: {
                  sx: {
                    color: theme.palette.error.main,
                    backgroundColor: alpha(theme.palette.error.main, 0.1),
                    borderRadius: '50%',
                    width: 22,
                    height: 22,
                    transition: 'all 200ms ease',
                    '&:hover': {
                      backgroundColor: alpha(theme.palette.error.main, 0.22),
                      transform: 'scale(1.1)',
                      boxShadow: `0 2px 8px ${alpha(theme.palette.error.main, 0.3)}`,
                    },
                    '&:active': {
                      transform: 'scale(0.95)',
                    },
                  },
                },
                listbox: {
                  sx: {
                    py: 0.5,
                    '& .MuiAutocomplete-option': {
                      fontSize: 13,
                      minHeight: 28,
                      py: '2px',
                      pl: 3,
                      pr: 1,
                      backgroundColor: 'transparent',
                      '&[aria-selected="true"]': {
                        backgroundColor: alpha('#4caf50', 0.18),
                      },
                      '&.Mui-focused, &:hover': {
                        backgroundColor: alpha('#4caf50', 0.12),
                      },
                    },
                    '& .MuiAutocomplete-groupLabel': {
                      display: 'none',
                    },
                    '& .MuiAutocomplete-groupUl': {
                      backgroundColor: 'transparent',
                    },
                  },
                },
                paper: {
                  sx: {
                    backgroundColor: theme.palette.mode === 'dark'
                      ? '#1a2e1e'
                      : '#e8f5e9',
                    backdropFilter: 'blur(12px)',
                    border: `1px solid ${alpha('#4caf50', 0.25)}`,
                  },
                },
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Load Existing Agent Network"
                  variant="outlined"
                  size="small"
                  slotProps={{
                    // Spread params.slotProps FIRST, then override only `input`.
                    // MUI 9 carries all of Autocomplete's input wiring under
                    // params.slotProps (input, htmlInput, inputLabel), and
                    // {...params} above spreads it. Replacing the object wholesale
                    // would drop htmlInput -- getInputProps(), which holds the value
                    // binding, keyboard handlers and the input ref -- severing the
                    // field from useAutocomplete at runtime while still type-checking.
                    ...params.slotProps,
                    input: {
                      ...params.slotProps.input,
                      endAdornment: (
                        <>
                          {(loadingNetworks || loadingDefinition) && <CircularProgress size={16} />}
                          {params.slotProps.input.endAdornment}
                        </>
                      ),
                    },
                  }}
                />
              )}
              sx={{
                flex: 1,
                '& .MuiOutlinedInput-root': {
                  fontSize: 13,
                },
                '& .MuiInputLabel-root': {
                  fontSize: 11,
                },
              }}
            />
            <Tooltip
              title={
                <>
                  <strong>Editing existing Agent-Networks is an Experimental feature.</strong><br />
                  Works best for agent-networks that are &quot;generated&quot; by Agent Network Designer or agent-networks that do not have any python coded-tools.<br />
                  <strong>Caution!</strong> Editing might change the behavior of an Agent-Network.
                </>
              }
              placement="right"
              arrow
            >
              <WarningAmberIcon sx={{ fontSize: 16, color: '#ed6c02', cursor: 'help', flexShrink: 0 }} />
            </Tooltip>
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
            Waiting for activity…
          </Typography>
        )}

        <div ref={networksEndRef} />
      </Box>

    </Paper>
  );
};

export default EditorSidebar;
