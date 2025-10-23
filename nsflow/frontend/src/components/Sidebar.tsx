
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
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Box, Typography, TextField, Button, Paper, FormControl, FormLabel, RadioGroup, 
  FormControlLabel, Radio, Alert, useTheme, alpha, Chip, Stack } from "@mui/material";
import { HubTwoTone as NetworkIcon, Search as SearchIcon } from "@mui/icons-material";
import { SimpleTreeView, treeItemClasses } from "@mui/x-tree-view";
import { useApiPort } from "../context/ApiPortContext";
import { useChatContext } from "../context/ChatContext";
import { useChatControls } from "../hooks/useChatControls";
import { useNeuroSan } from "../context/NeuroSanContext";
import { buildTree, renderTree, getAncestorDirs } from "../utils/sidebarHelpers";

const Sidebar = ({ onSelectNetwork }: { onSelectNetwork: (network: string) => void }) => {
  const [networks, setNetworks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { apiUrl, isReady } = useApiPort();
  const { activeNetwork, setActiveNetwork } = useChatContext();
  const { stopWebSocket, clearChat } = useChatControls();
  const networksEndRef = useRef<HTMLDivElement>(null);
  const { host, port, connectionType, setHost, setPort, setConnectionType, isNsReady } = useNeuroSan();
  const theme = useTheme();

  const [tempHost, setTempHost] = useState(host);
  const [tempPort, setTempPort] = useState<number | undefined>(port);
  const [tempConnectionType, setTempConnectionType] = useState<string>(connectionType ?? "http");
  const [initialized, setInitialized] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [userExpanded, setUserExpanded] = useState<string[]>([]);
  // raw agents with tags for tag logic
  const [agents, setAgents] = useState<Array<{ agent_name: string; tags?: string[] }>>([]);
  // tag universe + selection
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  // Sync tempHost/tempPort when host/port from context change (after get_ns_config)
  useEffect(() => {
    if (host && host.trim() !== "") {
      setTempHost(host);
    }
    if (port && typeof port === "number") {
      setTempPort(port);
    }
    if (connectionType?.trim()) setTempConnectionType(connectionType);
    console.log(">>>> NeuroSanContext config updated:", { host, port, connectionType });
  }, [host, port, connectionType]);

  // Initial connect only once if host and port exist
  useEffect(() => {
    if (!initialized && isReady && isNsReady && host?.trim() !== "" && port && apiUrl) {
      setInitialized(true);
      handleNeurosanConnect(connectionType, host, port, false); // skip setConfig on first load
    }
  }, [isReady, isNsReady, apiUrl, host, port, connectionType]);

  const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 30000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  };

  const fetchNetworks = useCallback(async (connectionToUse: string, hostToUse: string, portToUse: number) => {
    console.log(">>>> Calling /list with", connectionToUse, hostToUse, portToUse);
    setLoading(true);
    setError("");
    try {
      const response = await fetchWithTimeout(
        `${apiUrl}/api/v1/list?connection_type=${connectionToUse}&host=${encodeURIComponent(hostToUse)}&port=${portToUse}`,
        { method: "GET", headers: { "Content-Type": "application/json" } },
        30000
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to connect: ${response.statusText} - ${text}`);
      }

      const data = await response.json();
      // keep raw agents (with tags)
      setAgents(data.agents ?? []);
      // get agent names from list api
      const agentNames = data.agents?.map((a: { agent_name: string }) => a.agent_name);
      setNetworks(agentNames || []);
      // aggregate tag universe counts (all agents)
      const counts: Record<string, number> = {};
      for (const a of data.agents ?? []) {
        for (const t of a.tags ?? []) {
          if (!t) continue;
          counts[t] = (counts[t] || 0) + 1;
        }
      }
      setTagCounts(counts);
    } catch (err: any) {
      const message = err.name === "AbortError"
        ? "[x] Connection timed out. Check if the server is up and running."
        : `[x] Connection failed. Check NeuroSan server. \n\n${err.message}`;
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  const setConfig = async (hostToUse: string, portToUse: number, typeToUse: string) => {
    try {
      const response = await fetch(`${apiUrl}/api/v1/set_ns_config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          NEURO_SAN_SERVER_HOST: hostToUse,
          NEURO_SAN_SERVER_PORT: portToUse,
          NEURO_SAN_CONNECTION_TYPE: typeToUse 
        })
      });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      console.log(`>>>> Config via fastapi port:${apiUrl} set to use NeuroSan server:", ${data}`);
    } catch (error) {
      console.error("[x] Failed to set config:", error);
    }
  };

  const handleNeurosanConnect = async (newType?: string, newHost?: string, newPort?: number, updateConfig = true) => {
    const finalHost = newHost ?? tempHost;
    const finalPort = newPort ?? tempPort;
    const finalType = newType ?? tempConnectionType;

    console.log(`>>>Connecting to ${finalType}::/${finalHost}:${finalPort}`)

    if (!finalHost || !finalPort) {
      setError("[x] Please enter valid host and port.");
      return;
    }

    setNetworks([]);
    setError("");
    setLoading(true);

    try {
      if (updateConfig) {
        setHost(finalHost);
        setPort(finalPort);
        setConnectionType(finalType);
        await setConfig(finalHost, finalPort, finalType);
      }
      await fetchNetworks(finalType, finalHost, finalPort);
    } catch (error) {
      setError("Failed to connect to NeuroSan server.");
    } finally {
      setLoading(false);
    }
  };

  const handleNetworkSelection = (network: string) => {
    if (network === activeNetwork) return;
    stopWebSocket();
    clearChat();
    setActiveNetwork(network);
    onSelectNetwork(network);
  };

  // Agents matching the search box (name only)
  const searchMatchedAgents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(a => a.agent_name.toLowerCase().includes(q));
  }, [agents, searchQuery]);

  // Available tag counts scoped to current search results (ignores tag selection)
  const availableTagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of searchMatchedAgents) {
      for (const t of a.tags ?? []) {
        if (!t) continue;
        counts[t] = (counts[t] || 0) + 1;
      }
    }
    return counts;
  }, [searchMatchedAgents]);

  // Final agents to display: search filter AND (any of selected tags if any)
  const displayAgents = useMemo(() => {
    if (selectedTags.size === 0) return searchMatchedAgents;
    return searchMatchedAgents.filter(a => {
      const tags = new Set(a.tags ?? []);
      // OR-logic across selected tags
      for (const t of selectedTags) if (tags.has(t)) return true;
      return false;
    });
  }, [searchMatchedAgents, selectedTags]);

  // Final list of agent names for the tree
  const displayAgentNames = useMemo(
    () => displayAgents.map(a => a.agent_name),
    [displayAgents]
  );

  // Build the tree from the final names (search + tag selection)
  const treeData = useMemo(() => buildTree(displayAgentNames), [displayAgentNames]);

  // Expand only folders that contain the final displayed agents
  const searchExpanded = useMemo(() => {
    if (displayAgentNames.length === 0) return [];
    const set = new Set<string>();
    for (const path of displayAgentNames) {
      for (const dir of getAncestorDirs(path)) set.add(dir);
    }
    return Array.from(set);
  }, [displayAgentNames]);

  const effectiveExpanded = useMemo(() => {
    return searchQuery.trim() || selectedTags.size > 0
      ? Array.from(new Set([...userExpanded, ...searchExpanded]))
      : userExpanded;
  }, [userExpanded, searchExpanded, searchQuery, selectedTags]);

  // Sorted tag chips: from the global universe, but show current counts (scoped to search)
  const sortedTags = useMemo(() => {
    // collect all tag names from universe (tagCounts) so chips persist even when unavailable
    const names = Object.keys(tagCounts);
    const entries = names.map(n => [n, availableTagCounts[n] || 0] as [string, number]);

    // Sort: selected first (keep order by count desc inside each group), then available (count>0), then unavailable
    const byStateScore = (tag: string, count: number) => {
      if (selectedTags.has(tag)) return 2;      // selected (top)
      if (count > 0) return 1;                 // available
      return 0;                                // unavailable
    };

    entries.sort((a, b) => {
      const [ta, ca] = a;
      const [tb, cb] = b;
      const sa = byStateScore(ta, ca);
      const sb = byStateScore(tb, cb);
      if (sa !== sb) return sb - sa; // higher state score first
      // within same state, count desc then name asc
      return cb - ca || ta.localeCompare(tb);
    });

    return entries;
  }, [tagCounts, availableTagCounts, selectedTags]);

  const toggleTag = (tag: string, available: boolean) => {
    // If unavailable and not already selected, don't allow toggling on
    if (!available && !selectedTags.has(tag)) return;

    setSelectedTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  // Tags chip Sx:
  const chipSx = (selected: boolean, available: boolean) => ({
    height: 20,
    borderRadius: "16px",
    opacity: available || selected ? 1 : 0.5,
    cursor: available || selected ? "pointer" : "not-allowed",

    // thinner, softer selection styling
    borderColor: selected ? alpha(theme.palette.success.main, 0.8) : undefined,
    boxShadow: selected
      ? `0 0 0 1px ${alpha(theme.palette.success.light, 0.6)} inset`
      : "none",

    // nice subtle hover without getting chunky
    "&:hover": selected
      ? {
          boxShadow: `0 0 0 1px ${alpha(theme.palette.success.main, 0.36)} inset`,
          borderColor: alpha(theme.palette.success.light, 0.7),
        }
      : undefined,

    "& .MuiChip-label": { px: 0.75, fontSize: "0.65rem" },
    transition: "box-shadow 120ms ease, border-color 120ms ease"
  });


  return (
    <Paper
      component="aside"
      elevation={0}
      sx={{
        height: '100%',
        width: '100%', // Take full width of the resizable panel
        backgroundColor: theme.palette.background.paper,
        borderRight: `1px solid ${theme.palette.divider}`,
        display: 'flex',
        flexDirection: 'column',
        p: 1,
        gap: 1,
        minWidth: 100, // Minimum functional width
        overflow: 'hidden' // Prevent content overflow when resized small
      }}
    >
      {/* Compact Header */}
      <Typography variant="subtitle1" sx={{ 
        fontWeight: 600, 
        color: theme.palette.text.primary,
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        fontSize: '0.9rem',
        py: 0.5
      }}>
        <NetworkIcon sx={{ fontSize: 18 }} color="primary" />
        Agent Networks
      </Typography>

      {/* Compact NeuroSan Configuration Section */}
      <Paper
        elevation={1}
        sx={{
          p: 1,
          backgroundColor: alpha(theme.palette.background.default, 0.5),
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 1
        }}
      >
        <Typography variant="caption" sx={{ 
          fontWeight: 600, 
          color: theme.palette.text.primary,
          mb: 1,
          display: 'block',
          fontSize: '0.75rem'
        }}>
          NeuroSan Config
        </Typography>

        {/* Responsive Connection Type Radio Group */}
        <FormControl component="fieldset" sx={{ mb: 1 }}>
          <FormLabel component="legend" sx={{ 
            fontSize: '0.6rem',
            color: theme.palette.text.secondary 
          }}>
            Type
          </FormLabel>
          <RadioGroup
            row
            value={tempConnectionType}
            onChange={(e) => setTempConnectionType(e.target.value)}
            sx={{ 
              gap: 0.4,
              flexWrap: 'wrap' // Allow wrapping on very small widths
            }}
          >
            {["http", "grpc", "https"].map((type) => (
              <FormControlLabel
                key={type}
                value={type}
                control={<Radio 
                  sx={{
                  '& .MuiSvgIcon-root': {fontSize: 12},
                }}
                  />}
                label={type}
                sx={{
                  mr: 0.5,
                  minWidth: 'auto', // Allow shrinking
                  '& .MuiFormControlLabel-label': { 
                    fontSize: '0.7rem',
                    color: theme.palette.text.primary
                  }
                }}
              />
            ))}
          </RadioGroup>
        </FormControl>

        {/* Compact Host Input */}
        <TextField
          size="small"
          label="Host"
          value={tempHost ?? ""}
          onChange={(e) => setTempHost(e.target.value)}
          sx={{ 
            mb: 1,
            '& .MuiInputLabel-root': { fontSize: '0.7rem', py: 0.5 },
            '& .MuiInputBase-input': { fontSize: '0.7rem', py: 0.5 }
          }}
          fullWidth
        />

        {/* Compact Port Input */}
        <TextField
          size="small"
          label="Port"
          type="number"
          slotProps={{
            htmlInput: { min: 1024, max: 65535 }
          }}
          value={tempPort !== undefined ? tempPort : ""}
          onChange={(e) => {
            const val = e.target.value;
            setTempPort(val === "" ? undefined : Number(val));
          }}
          sx={{ 
            mb: 1,
            '& .MuiInputLabel-root': { fontSize: '0.7rem', py: 0.5 },
            '& .MuiInputBase-input': { fontSize: '0.7rem', py: 0.5 }
          }}
          fullWidth
        />

        {/* Compact Connect Button */}
        <Button
          variant="contained"
          color="success"
          size="small"
          onClick={() => handleNeurosanConnect(connectionType, tempHost, tempPort, true)}
          sx={{ 
            fontSize: '0.7rem',
            py: 0.4,
            '&:hover': {
              backgroundColor: theme.palette.success.dark
            }
          }}
          fullWidth
        >
          Connect
        </Button>
      </Paper>

      {/* Compact Search Box */}
      <TextField
        size="small"
        label="Search"
        placeholder="Search..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <SearchIcon sx={{ color: theme.palette.text.secondary, fontSize: 16, mr: 0.5 }} />
            )
          }
        }}
        sx={{
          '& .MuiInputLabel-root': { fontSize: '0.7rem', py: 0.5 },
          '& .MuiInputBase-input': { fontSize: '0.7rem', py: 1 }
        }}
        fullWidth
      />

      {/* Compact Tags Section */}
      {sortedTags.length > 0 && (
        <Paper
          elevation={1}
          sx={{
            mt: 0.1,
            p: 0.5,
            backgroundColor: alpha(theme.palette.background.default, 0.5),
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 1
          }}
        >
          {/* Scrollable chips area */}
          <Box
            sx={{
              maxHeight: 48,            // ~24px = 1 row of small chips; tweak as needed
              overflowY: "auto",
              pr: 0.5,                  // little room so the scrollbar doesn't overlap chips
              // subtle scrollbar styling
              "&::-webkit-scrollbar": { width: 8, height: 8 },
              "&::-webkit-scrollbar-thumb": {
                backgroundColor: alpha(theme.palette.text.primary, 0.2),
                borderRadius: 8
              },
              "&::-webkit-scrollbar-track": {
                backgroundColor: alpha(theme.palette.background.default, 0.4)
              }
            }}
          >
            <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.5}>
              {sortedTags.map(([tag, count]) => {
                const isSelected = selectedTags.has(tag);
                const isAvailable = count > 0; // available within current search result
                return (
                  <Chip
                    key={tag}
                    size="small"
                    variant="outlined"
                    label={`${count} ${tag}`}
                    onClick={() => toggleTag(tag, isAvailable)}
                    sx={chipSx(isSelected, isAvailable)}
                    title={
                      isSelected
                        ? `Selected: ${count} agents currently match "${tag}"`
                        : isAvailable
                          ? `${count} agents currently match "${tag}"`
                          : `No agents match "${tag}" in the current search`
                    }
                  />
                );
              })}
            </Stack>
          </Box>
        </Paper>
      )}

      {/* Compact Networks Display */}
      <Paper
        elevation={1}
        sx={{
          flexGrow: 1,
          overflow: 'hidden',
          backgroundColor: alpha(theme.palette.background.default, 0.3),
          border: `1px solid ${theme.palette.divider}`,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 1
        }}
      >
        <Typography variant="caption" sx={{ 
          fontWeight: 600, 
          color: theme.palette.text.primary,
          p: 0.5,
          borderBottom: `1px solid ${theme.palette.divider}`,
          fontSize: '0.75rem'
        }}>
          Available Agents
        </Typography>

        <Box sx={{ 
          flexGrow: 1, 
          overflow: 'auto'
        }}>
          {loading && (
            <Typography variant="caption" sx={{ 
              color: theme.palette.text.secondary,
              p: 1,
              textAlign: 'center',
              display: 'block',
              fontSize: '0.7rem'
            }}>
              Loading...
            </Typography>
          )}
          
          {error && (
            <Alert severity="error" sx={{ m: 0.5, fontSize: '0.7rem' }}>
              {error.split('\n').map((line, idx) => (
                <span key={idx}>
                  {line}
                  <br />
                </span>
              ))}
            </Alert>
          )}
          {/* Networks Tree View */}
          <Box sx={{ p: 0.5, height: "100%", overflowY: "auto" }}>
            {!loading && !error && (
              <SimpleTreeView
                disableSelection
                expandedItems={effectiveExpanded}
                onExpandedItemsChange={(_, ids) => {
                  // Always capture what the user does; search overlay is added via `effectiveExpanded`
                  setUserExpanded(ids as string[]);
                }}
                sx={{
                  // Keep global rows compact, but DO NOT indent root
                  [`& .${treeItemClasses.label}`]: { py: 0 },
                  [`& .${treeItemClasses.content}`]: {
                    minHeight: "1.2rem",
                    borderRadius: 1,
                  },
                }}
              >
                {renderTree(
                  treeData,
                  [],
                  activeNetwork,
                  theme,
                  handleNetworkSelection
                )}
              </SimpleTreeView>
            )}
          </Box>

          <div ref={networksEndRef} />
        </Box>
      </Paper>
    </Paper>
  );
};

export default Sidebar;
