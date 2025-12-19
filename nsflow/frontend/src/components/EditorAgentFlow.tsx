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

import { useEffect, useState, useCallback, useRef } from "react";
import ReactFlow, { Background, Controls, useEdgesState, useNodesState, useReactFlow, 
  Node, Edge, EdgeMarkerType, addEdge, Connection, NodeMouseHandler } from "reactflow";
import "reactflow/dist/style.css";
import { Box, Typography, Paper, useTheme, IconButton, Tooltip, Slider, alpha, Button, ButtonGroup, ClickAwayListener, Grow, Popper, MenuList, MenuItem } from "@mui/material";
import EditableAgentNode from "./EditableAgentNode";
import FloatingEdge from "./FloatingEdge";
import AgentContextMenu from "./AgentContextMenu";
import EditorPalette from "./EditorPalette";
import NetworkAgentEditorPanel from "./NetworkAgentEditorPanel";
import { useApiPort } from "../context/ApiPortContext";
import { createLayoutManager } from "../utils/agentLayoutManager";
import {
  AccountTree as LayoutIcon,
  RocketLaunchTwoTone as LaunchIcon,
  ArrowDropDown as ArrowDropDownIcon,
  Home as HomeIcon
} from "@mui/icons-material";
import { useChatContext } from "../context/ChatContext";
import { getFeatureFlags } from "../utils/config";
import {extractProgressPayload } from "../utils/progressHelper";

export const nodeTypes = Object.freeze({
  agent: EditableAgentNode,
  editable_agent: EditableAgentNode,
  undefined_agent: EditableAgentNode,
});

export const edgeTypes = Object.freeze({
  floating: FloatingEdge,
});

interface StateConnectivityResponse {
  nodes: Node[];
  edges: Edge[];
  network_name: string;
  connected_components: number;
  total_agents: number;
  defined_agents: number;
  undefined_agents: number;
}

const EditorAgentFlow = ({ 
  selectedNetwork, 
  selectedDesignId,
  onNetworkCreated, 
  onNetworkSelected 
}: { 
  selectedNetwork: string;
  selectedDesignId: string;
  onNetworkCreated: () => void;
  onNetworkSelected: (networkName: string) => void;
}) => {
  // console.log('EditorAgentFlow: Received props:', { selectedNetwork, selectedDesignId });
  const { apiUrl } = useApiPort();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { fitView, setViewport } = useReactFlow();
  const theme = useTheme();

  // Layout control state (similar to AgentFlow)
  const [baseRadius, setBaseRadius] = useState(30);
  const [levelSpacing, setLevelSpacing] = useState(80);
  const [tempBaseRadius, setTempBaseRadius] = useState(baseRadius);
  const [tempLevelSpacing, setTempLevelSpacing] = useState(levelSpacing);
  const { pluginManualEditor, pluginCruse } = getFeatureFlags();
  const canEdit = !!pluginManualEditor;
  const shouldForceLayoutRef = useRef(false);
  const lastSeenNameRef = useRef<string | null>(null);
  const [showLaunchButton, setShowLaunchButton] = useState(false);
  const [launchMenuOpen, setLaunchMenuOpen] = useState(false);
  const launchAnchorRef = useRef<HTMLDivElement>(null);

  // We'll read the latest agent_network_definition from logs in view-mode
  const { getLastProgressMessage, getLastSlyDataMessage, targetNetwork, 
    progressTick, slyDataTick, lastProgressAt, lastSlyDataAt } = useChatContext();

  // latest definition for view-mode
  const getViewDefinition = useCallback(() => {
    const p = getLastProgressMessage({ network: targetNetwork }) ?? getLastProgressMessage();
    const s = getLastSlyDataMessage({ network: targetNetwork }) ?? getLastSlyDataMessage();

    // Decide which one to use based on which tick was updated last basis timestamp
    const preferProgress = lastProgressAt > lastSlyDataAt;

    const payload = preferProgress
      ? extractProgressPayload(p) || extractProgressPayload(s)
      : extractProgressPayload(s) || extractProgressPayload(p);

    return payload?.agent_network_definition as Record<string, any> | undefined;
  }, [getLastProgressMessage, getLastSlyDataMessage, targetNetwork]);

  // Get the latest agent network name for launch button
  const getLatestAgentNetworkName = useCallback(() => {
    const p = getLastProgressMessage({ network: targetNetwork }) ?? getLastProgressMessage();
    const s = getLastSlyDataMessage({ network: targetNetwork }) ?? getLastSlyDataMessage();
    const payload = extractProgressPayload(s) || extractProgressPayload(p);
    return payload?.agent_network_name;
  }, [getLastProgressMessage, getLastSlyDataMessage, targetNetwork]);

  // Layout manager for position caching and intelligent layout
  const layoutManager = selectedNetwork ? createLayoutManager(selectedNetwork, {
    baseRadius,
    levelSpacing
  }) : null;
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    nodeId: string;
  }>({ visible: false, x: 0, y: 0, nodeId: "" });

  // Selected node state
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  
  // Agent editor state
  const [selectedAgentName, setSelectedAgentName] = useState<string | null>(null);

  // Fetch network connectivity data
  const fetchNetworkData = async (definitionOverride?: Record<string, any>) => {
    // console.log('fetchNetworkData called with:', { selectedNetwork, selectedDesignId, apiUrl });
    if (!selectedNetwork || !apiUrl) {
      console.log('Missing selectedNetwork or apiUrl, skipping fetch');
      return;
    }

    try {
      let response: Response;
      if (canEdit && selectedDesignId) {
        // EDIT MODE: unchanged
        response = await fetch(`${apiUrl}/api/v1/andeditor/state/connectivity/${selectedNetwork}`);
      } else {
        // VIEW MODE: get the definition from logs (or override)
        const definition = definitionOverride ?? getViewDefinition();
        if (!definition) {
          console.warn("View-mode: no agent_network_definition available yet.");
          return;
        }
        response = await fetch(`${apiUrl}/api/v1/connectivity/from_json`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent_network_definition: definition }),
        });
      }
      if (!response.ok) {
        console.error(`Failed to fetch network data: ${response.statusText}`);
        return;
      }

      const data: StateConnectivityResponse = await response.json();
      // Transform nodes to include selection state
      const rawNodes = data.nodes.map((node: Node) => ({
        ...node,
        data: { ...node.data, selected: node.id === selectedNodeId },
      }));

      // Transform edges to include arrows
      const transformedEdges = data.edges.map((edge: Edge) => ({
        ...edge,
        markerEnd: "arrowclosed" as EdgeMarkerType,
        style: { stroke: theme.palette.divider, strokeWidth: 2 },
        type: "floating",
      }));

      // Apply intelligent layout with position caching
      let finalNodes = rawNodes;
      
      if (layoutManager && rawNodes.length > 0) {
        try {
          const layoutResult = layoutManager.applyLayout(rawNodes, transformedEdges);
          finalNodes = layoutResult.nodes;
          // console.log(`Applied layout for ${selectedNetwork}: ${finalNodes.length} nodes, cached: ${layoutManager.hasCachedPositions()}`);
        } catch (error) {
          console.warn('Failed to apply layout, using raw positions:', error);
          finalNodes = rawNodes;
        }
      }

      setNodes(finalNodes);
      setEdges(transformedEdges);
      fitView({ padding: 0.1, duration: 800 });
      setViewport({ x: -70, y: 100, zoom: 0.5 }, { duration: 800 });

    } catch (error) {
      console.error("Error fetching network data:", error);
    }
  };

  // Handle node click
  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    setSelectedNodeId(node.id);
    setContextMenu({ visible: false, x: 0, y: 0, nodeId: "" });
    
    // Update nodes to show selection
    setNodes((nds) => 
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          selected: n.id === node.id,
        },
      }))
    );
  }, [setNodes]);

  // Handle node double-click
  const onNodeDoubleClick: NodeMouseHandler = useCallback((_, node) => {
    // console.log("Double-clicked agent:", node.id);
    setSelectedAgentName(node.id);
  }, []);

  // Handle node context menu (right-click)
  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    setSelectedNodeId(node.id);
    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      nodeId: node.id,
    });
  }, []);

  // Handle edge connection
  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge = {
        ...params,
        id: `edge-${params.source}-${params.target}`,
        markerEnd: "arrowclosed" as EdgeMarkerType,
        style: {
          stroke: theme.palette.divider,
          strokeWidth: 2,
        },
        type: "floating",
      };
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges]
  );

  // Handle canvas click (deselect)
  const onPaneClick = useCallback(() => {
    setSelectedNodeId("");
    setContextMenu({ visible: false, x: 0, y: 0, nodeId: "" });
    
    // Update nodes to remove selection
    setNodes((nds) => 
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          selected: false,
        },
      }))
    );
  }, [setNodes]);

  // Handle nodes change (including position updates)
  const handleNodesChange = useCallback((changes: any[]) => {
    onNodesChange(changes);
    
    // Save positions when nodes are moved (simplified approach)
    const positionChanges = changes.filter(change => change.type === 'position' && change.dragging === false);
    if (positionChanges.length > 0 && layoutManager) {
      // Debounce position saving
      setTimeout(() => {
        setNodes(currentNodes => {
          layoutManager.savePositions(currentNodes);
          return currentNodes;
        });
      }, 500);
    }
  }, [onNodesChange, layoutManager, setNodes]);

  // Force layout recalculation
  const handleForceLayout = useCallback(() => {
    if (layoutManager && nodes.length > 0) {
      try {
        const layoutResult = layoutManager.forceLayout(nodes, edges);
        setNodes(layoutResult.nodes);
        // Keep existing edges as they are already transformed
        
        // Fit view after layout
        setTimeout(() => {
          fitView({ padding: 0.1, duration: 800 });
        }, 100);
      } catch (error) {
        console.warn('Failed to force layout:', error);
      }
    }
  }, [layoutManager, nodes, edges, setNodes, fitView]);

  // Context menu actions
  const handleEditAgent = (nodeId: string) => {
    // console.log("Edit agent:", nodeId);
    setSelectedAgentName(nodeId);
    setContextMenu({ visible: false, x: 0, y: 0, nodeId: "" });
  };

  const handleDeleteAgent = async (nodeId: string) => {
    // console.log("Delete agent:", nodeId, "selectedDesignId:", selectedDesignId);
    
    if (!selectedDesignId) {
      console.error("Cannot delete agent: no design_id available. Current selectedDesignId:", selectedDesignId);
      setContextMenu({ visible: false, x: 0, y: 0, nodeId: "" });
      return;
    }
    
    const success = await deleteAgent(nodeId);
    if (success) {
      // Refresh the network data to reflect changes
      await fetchNetworkData();
    }
    
    setContextMenu({ visible: false, x: 0, y: 0, nodeId: "" });
    setSelectedNodeId("");
  };

  const handleDuplicateAgent = async (nodeId: string) => {
    // console.log("Duplicate agent:", nodeId, "selectedDesignId:", selectedDesignId);
    
    if (!selectedDesignId) {
      console.error("Cannot duplicate agent: no design_id available. Current selectedDesignId:", selectedDesignId);
      setContextMenu({ visible: false, x: 0, y: 0, nodeId: "" });
      return;
    }
    
    // Generate a new name for the duplicated agent
    const newAgentName = `${nodeId}_copy`;
    
    const success = await duplicateAgent(nodeId, newAgentName);
    if (success) {
      // Refresh the network data to reflect changes
      await fetchNetworkData();
    }
    
    setContextMenu({ visible: false, x: 0, y: 0, nodeId: "" });
  };

  const handleAddChildAgent = async (nodeId: string) => {
    // console.log("Add child agent to:", nodeId, "selectedDesignId:", selectedDesignId);
    
    if (!selectedDesignId) {
      console.error("Cannot add child agent: no design_id available. Current selectedDesignId:", selectedDesignId);
      setContextMenu({ visible: false, x: 0, y: 0, nodeId: "" });
      return;
    }
    
    // Generate a name for the child agent
    const childAgentName = `${nodeId}_child`;
    
    // Use current agent as parent (one level down)
    const success = await createAgent(childAgentName, nodeId);
    if (success) {
      // Refresh the network data to reflect changes
      await fetchNetworkData();
    }
    
    setContextMenu({ visible: false, x: 0, y: 0, nodeId: "" });
  };

  // Handle agent update from editor panel
  const handleAgentUpdated = async () => {
    // console.log("Agent updated, refreshing network data");
    await fetchNetworkData();
  };

  // Handle launch to Cruse (default)
  const handleLaunchCruse = useCallback(() => {
    const agentNetworkName = getLatestAgentNetworkName();
    if (agentNetworkName) {
      const cruseUrl = `${window.location.origin}/cruse?network=${encodeURIComponent(agentNetworkName)}`;
      window.open(cruseUrl, '_blank');
    }
  }, [getLatestAgentNetworkName]);

  // Handle launch to Home (dropdown option)
  const handleLaunchHome = useCallback(() => {
    const agentNetworkName = getLatestAgentNetworkName();
    if (agentNetworkName) {
      const homeUrl = `${window.location.origin}/home?network=${encodeURIComponent(agentNetworkName)}`;
      window.open(homeUrl, '_blank');
    }
    setLaunchMenuOpen(false);
  }, [getLatestAgentNetworkName]);

  // Toggle launch menu
  const handleToggleLaunchMenu = () => {
    setLaunchMenuOpen((prevOpen) => !prevOpen);
  };

  const handleCloseLaunchMenu = (event: Event | React.SyntheticEvent) => {
    if (
      launchAnchorRef.current &&
      launchAnchorRef.current.contains(event.target as HTMLElement)
    ) {
      return;
    }
    setLaunchMenuOpen(false);
  };

  // API functions for agent operations
  const createAgent = async (agentName: string, parentName?: string) => {
    if (!selectedDesignId || !apiUrl) {
      console.error("Missing design_id or apiUrl for createAgent:", { selectedDesignId, apiUrl });
      return false;
    }

    try {
      const response = await fetch(`${apiUrl}/api/v1/andeditor/networks/${selectedDesignId}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: agentName,
          parent_name: parentName,
          instructions: `Agent ${agentName}`,
          agent_type: 'standard'
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Failed to create agent:', error);
        return false;
      }

      const result = await response.json();
      console.log('Agent created successfully:', result);
      return true;
    } catch (error) {
      console.error('Error creating agent:', error);
      return false;
    }
  };

  const duplicateAgent = async (agentName: string, newAgentName: string) => {
    if (!selectedDesignId || !apiUrl) {
      console.error("Missing design_id or apiUrl");
      return false;
    }

    try {
      const response = await fetch(`${apiUrl}/api/v1/andeditor/networks/${selectedDesignId}/agents/${agentName}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_name: newAgentName
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Failed to duplicate agent:', error);
        return false;
      }

      const result = await response.json();
      console.log('Agent duplicated successfully:', result);
      return true;
    } catch (error) {
      console.error('Error duplicating agent:', error);
      return false;
    }
  };

  const deleteAgent = async (agentName: string) => {
    if (!selectedDesignId || !apiUrl) {
      console.error("Missing design_id or apiUrl");
      return false;
    }

    try {
      const response = await fetch(`${apiUrl}/api/v1/andeditor/networks/${selectedDesignId}/agents/${agentName}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Failed to delete agent:', error);
        return false;
      }

      const result = await response.json();
      console.log('Agent deleted successfully:', result);
      return true;
    } catch (error) {
      console.error('Error deleting agent:', error);
      return false;
    }
  };

  // Effects
  // Load data when network changes or layout parameters change (similar to AgentFlow)
  useEffect(() => {
    // console.log('useEffect triggered with:', { selectedNetwork, selectedDesignId });
    if (selectedNetwork) {
      fetchNetworkData();
    } else {
      setNodes([]);
      setEdges([]);
    }
  }, [selectedNetwork, selectedDesignId, baseRadius, levelSpacing]);

  // Update temp values when actual values change
  useEffect(() => {
    setTempBaseRadius(baseRadius);
  }, [baseRadius]);

  useEffect(() => {
    setTempLevelSpacing(levelSpacing);
  }, [levelSpacing]);

  // refetch when new progress/slydata ticks arrive (view-mode only)
  useEffect(() => {
    if (!canEdit && selectedNetwork) {
      const timeout = setTimeout(() => {
        shouldForceLayoutRef.current = true;
        const def = getViewDefinition();
        if (def) fetchNetworkData(def);  // pass override so we POST exactly what just arrived
        else fetchNetworkData();  // fallback: still try; fetchNetworkData() will call getViewDefinition() internally
      }, 200); // slight debounce

      return () => clearTimeout(timeout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressTick, slyDataTick, selectedNetwork, canEdit]);

  // After nodes/edges update, run animated relayout once
  useEffect(() => {
    if (!canEdit && selectedNetwork && shouldForceLayoutRef.current) {
      // reset the latch before invoking to avoid loops
      shouldForceLayoutRef.current = false;

      // wait for the DOM/positions to update, then animate
      requestAnimationFrame(() => {
        handleForceLayout();
      });
    }
  }, [nodes, edges, canEdit, selectedNetwork, handleForceLayout]);

  // Monitor for agent network name changes to show launch button
  useEffect(() => {
    if (!canEdit && selectedNetwork) {
      const currentName = getLatestAgentNetworkName();
      if (currentName && currentName !== lastSeenNameRef.current) {
        lastSeenNameRef.current = currentName;
        setShowLaunchButton(true);
      }
    }
  }, [progressTick, slyDataTick, selectedNetwork, canEdit, getLatestAgentNetworkName]);


  return (
    <Box sx={{ 
      height: '100%', 
      backgroundColor: theme.palette.background.default,
      position: 'relative',
      display: 'flex'
    }}>
      {/* Editor Palette */}
      {canEdit &&
        <EditorPalette 
          onNetworkCreated={onNetworkCreated}
          onNetworkSelected={onNetworkSelected}
        />
      }
      
      {/* Main Flow Area */}
      <Box sx={{ 
        flexGrow: 1, 
        position: 'relative',
        backgroundColor: theme.palette.background.default
      }}>
        <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{
          type: "floating",
          markerEnd: "arrowclosed" as EdgeMarkerType,
        }}
        fitView
        attributionPosition="bottom-left"
        minZoom={0.01}
        maxZoom={3}
      >
        <Background/>
        <Controls 
          position="top-right"
          style={{
            backgroundColor: theme.palette.background.paper,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: '8px'
          }}
        />
      </ReactFlow>

      {/* Context Menu */}
      <AgentContextMenu
        visible={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
        nodeId={contextMenu.nodeId}
        onEdit={handleEditAgent}
        onDelete={handleDeleteAgent}
        onDuplicate={handleDuplicateAgent}
        onAddChild={handleAddChildAgent}
        onClose={() => setContextMenu({ visible: false, x: 0, y: 0, nodeId: "" })}
        enableEditing={pluginManualEditor} 
      />

      {/* Network Info Panel */}
      {selectedNetwork && (
        <Paper
          elevation={3}
          sx={{
            position: 'absolute',
            top: 16,
            left: 16,
            p: 1,
            backgroundColor: theme.palette.background.paper,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 2,
            minWidth: 200
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="subtitle1" sx={{ 
              fontWeight: 600, 
              color: theme.palette.text.primary
            }}>
              Editing: {selectedNetwork}
            </Typography>
            <Tooltip title="Reorganize Layout">
              <span style={{ display: 'inline-flex' }}>
                <IconButton
                  size="small"
                  onClick={handleForceLayout}
                  disabled={nodes.length === 0}
                  sx={{
                    color: theme.palette.primary.main,
                    '&:hover': {
                      backgroundColor: theme.palette.primary.main + '20'
                    }
                  }}
                >
                  <LayoutIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
          
          <Box sx={{ color: theme.palette.text.secondary }}>
            <Typography variant="body2" sx={{ color: theme.palette.text.primary }}>
              Nodes: {nodes.length}
            </Typography>
            <Typography variant="body2" sx={{ color: theme.palette.text.primary }}>
              Edges: {edges.length}
            </Typography>
            {selectedNodeId && (
              <Box sx={{ 
                mt: 1, 
                pt: 1, 
                borderTop: `1px solid ${theme.palette.divider}` 
              }}>
                <Typography variant="body2" sx={{ 
                  color: theme.palette.primary.main,
                  fontWeight: 500
                }}>
                  Selected: {selectedNodeId}
                </Typography>
              </Box>
            )}
          </Box>
        </Paper>
      )}

      {/* Launch Button with Dropdown */}
      {showLaunchButton && (
        <Box
          sx={{
            position: 'absolute',
            top: 16,
            right: 180, // Position to the left of Layout Controls
            zIndex: 20,
          }}
        >
          {pluginCruse ? (
            // Cruse enabled: Show Launch to Cruse with dropdown for Home
            <>
              <ButtonGroup
                ref={launchAnchorRef}
                variant="contained"
                color="primary"
                sx={{
                  borderRadius: '28px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  '& .MuiButton-root': {
                    height: 56,
                    '&:hover': {
                      backgroundColor: theme.palette.primary.dark,
                      transform: 'scale(1.02)',
                      transition: 'all 0.2s ease-in-out'
                    }
                  }
                }}
              >
                {/* Main Launch Button - Cruse */}
                <Tooltip title={`Launch ${lastSeenNameRef.current} in Cruse`}>
                  <Button
                    onClick={handleLaunchCruse}
                    sx={{
                      minWidth: 48,
                      px: 2.5,
                      borderTopLeftRadius: '28px',
                      borderBottomLeftRadius: '28px',
                      backgroundColor: theme.palette.primary.main,
                    }}
                  >
                    <LaunchIcon />
                  </Button>
                </Tooltip>

                {/* Dropdown Arrow */}
                <Tooltip title="More launch options">
                  <Button
                    size="small"
                    onClick={handleToggleLaunchMenu}
                    sx={{
                      px: 0.5,
                      minWidth: 32,
                      borderTopRightRadius: '28px',
                      borderBottomRightRadius: '28px',
                      borderLeft: `1px solid ${alpha(theme.palette.common.white, 0.3)}`,
                      backgroundColor: theme.palette.primary.main,
                    }}
                  >
                    <ArrowDropDownIcon />
                  </Button>
                </Tooltip>
              </ButtonGroup>

              {/* Dropdown Menu */}
              <Popper
                open={launchMenuOpen}
                anchorEl={launchAnchorRef.current}
                role={undefined}
                placement="bottom-end"
                transition
                disablePortal
                sx={{ zIndex: 21 }}
              >
                {({ TransitionProps, placement }) => (
                  <Grow
                    {...TransitionProps}
                    style={{
                      transformOrigin: placement === 'bottom-end' ? 'right top' : 'right bottom',
                    }}
                  >
                    <Paper
                      elevation={8}
                      sx={{
                        mt: 1,
                        minWidth: 160,
                        borderRadius: 2,
                        backgroundColor: theme.palette.background.paper,
                      }}
                    >
                      <ClickAwayListener onClickAway={handleCloseLaunchMenu}>
                        <MenuList sx={{ py: 0.5 }}>
                          <MenuItem
                            onClick={handleLaunchHome}
                            sx={{
                              display: 'flex',
                              gap: 1,
                              py: 1,
                              px: 1.5,
                              '&:hover': {
                                backgroundColor: alpha(theme.palette.primary.main, 0.1),
                              }
                            }}
                          >
                            <HomeIcon fontSize="small" color="action" />
                            <Typography variant="body2" fontWeight={500}>
                              Launch in Home
                            </Typography>
                          </MenuItem>
                        </MenuList>
                      </ClickAwayListener>
                    </Paper>
                  </Grow>
                )}
              </Popper>
            </>
          ) : (
            // Cruse disabled: Show simple Launch to Home button
            <Tooltip title={`Launch ${lastSeenNameRef.current} in Home`}>
              <Button
                variant="contained"
                color="primary"
                onClick={handleLaunchHome}
                sx={{
                  height: 56,
                  minWidth: 48,
                  px: 2.5,
                  borderRadius: '28px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  backgroundColor: theme.palette.primary.main,
                  '&:hover': {
                    backgroundColor: theme.palette.primary.dark,
                    transform: 'scale(1.02)',
                    transition: 'all 0.2s ease-in-out'
                  }
                }}
              >
                <LaunchIcon />
              </Button>
            </Tooltip>
          )}
        </Box>
      )}

      {/* Layout Controls Panel */}
      {selectedNetwork && (
        <Paper
          elevation={1}
          sx={{
            position: 'absolute',
            top: 16,
            right: 60, // Move left to avoid ReactFlow controls
            zIndex: 20,
            p: 1,
            backgroundColor: alpha(theme.palette.background.paper, 0.95),
            backdropFilter: 'blur(8px)',
            minWidth: 80,
            maxWidth: 140
          }}
        >
          <Typography variant="caption" sx={{ 
            fontWeight: 600, 
            color: theme.palette.text.secondary,
            display: 'block',
            mb: 0.1,
            fontSize: '0.6rem'
          }}>
            Layout Controls
          </Typography>
          
          <Box sx={{ mb: 0 }}>
            <Typography variant="caption" sx={{ 
              color: theme.palette.text.primary,
              fontSize: '0.6rem'
            }}>
              Radius: {tempBaseRadius}
            </Typography>
            <Slider
              size="small"
              value={tempBaseRadius}
              min={10}
              max={300}
              onChange={(_, value) => setTempBaseRadius(value as number)}
              onMouseUp={() => setBaseRadius(tempBaseRadius)}
              onTouchEnd={() => setBaseRadius(tempBaseRadius)}
              sx={{
                color: theme.palette.primary.main,
                height: 2,
                '& .MuiSlider-thumb': {
                  width: 8,
                  height: 8
                },
                '& .MuiSlider-track': {
                  height: 2
                },
                '& .MuiSlider-rail': {
                  height: 2
                }
              }}
            />
          </Box>
          
          <Box>
            <Typography variant="caption" sx={{ 
              color: theme.palette.text.primary,
              fontSize: '0.6rem'
            }}>
              Spacing: {tempLevelSpacing}
            </Typography>
            <Slider
              size="small"
              value={tempLevelSpacing}
              min={10}
              max={300}
              onChange={(_, value) => setTempLevelSpacing(value as number)}
              onMouseUp={() => setLevelSpacing(tempLevelSpacing)}
              onTouchEnd={() => setLevelSpacing(tempLevelSpacing)}
              sx={{
                color: theme.palette.secondary.main,
                height: 2,
                '& .MuiSlider-thumb': {
                  width: 8,
                  height: 8
                },
                '& .MuiSlider-track': {
                  height: 2
                },
                '& .MuiSlider-rail': {
                  height: 2
                }
              }}
            />
          </Box>
        </Paper>
      )}

        {!selectedNetwork && (
          <Box sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Typography variant="h6" sx={{ 
              color: theme.palette.text.secondary,
              textAlign: 'center'
            }}>
              {canEdit
                ? "Select a network from the sidebar to start editing"
                : "Awaiting Agent design..."}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Network Agent Editor Panel */}
      <NetworkAgentEditorPanel
        selectedDesignId={selectedDesignId}
        selectedAgentName={selectedAgentName}
        onAgentUpdated={handleAgentUpdated}
        enableEditing={pluginManualEditor}
      />
    </Box>
  );
};

export default EditorAgentFlow;
