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

import { useEffect, useState, useCallback } from "react";
import ReactFlow, {
  Background,
  Controls,
  useEdgesState,
  useNodesState,
  useReactFlow,
  Node,
  Edge,
  EdgeMarkerType,
  addEdge,
  Connection,
  NodeMouseHandler,
} from "reactflow";
import "reactflow/dist/style.css";
import { 
  Box, 
  Typography, 
  Paper, 
  useTheme,
  IconButton,
  Tooltip,
  Slider,
  alpha
} from "@mui/material";
import EditableAgentNode from "./EditableAgentNode";
import FloatingEdge from "./FloatingEdge";
import AgentContextMenu from "./AgentContextMenu";
import EditorPalette from "./EditorPalette";
import { useApiPort } from "../context/ApiPortContext";
import { createLayoutManager } from "../utils/agentLayoutManager";
import { AccountTree as LayoutIcon } from "@mui/icons-material";

const nodeTypes = { agent: EditableAgentNode };
const edgeTypes = { floating: FloatingEdge };

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
  console.log('EditorAgentFlow: Received props:', { selectedNetwork, selectedDesignId });
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

  // Fetch network connectivity data
  const fetchNetworkData = async () => {
    console.log('fetchNetworkData called with:', { selectedNetwork, selectedDesignId, apiUrl });
    
    if (!selectedNetwork || !apiUrl) {
      console.log('Missing selectedNetwork or apiUrl, skipping fetch');
      return;
    }

    try {
      console.log(`Loading network data for: ${selectedNetwork} (design_id: ${selectedDesignId})`);
      const response = await fetch(`${apiUrl}/api/v1/andeditor/state/connectivity/${selectedNetwork}`);
      
      if (!response.ok) {
        console.error(`Failed to fetch network data: ${response.statusText}`);
        return;
      }

      const data: StateConnectivityResponse = await response.json();
      
      // Transform nodes to include selection state
      const rawNodes = data.nodes.map((node: Node) => ({
        ...node,
        data: {
          ...node.data,
          selected: node.id === selectedNodeId,
        },
      }));

      // Transform edges to include arrows
      const transformedEdges = data.edges.map((edge: Edge) => ({
        ...edge,
        markerEnd: "arrowclosed" as EdgeMarkerType,
        style: {
          stroke: theme.palette.divider,
          strokeWidth: 2,
        },
        type: "floating",
      }));

      // Apply intelligent layout with position caching
      let finalNodes = rawNodes;
      
      if (layoutManager && rawNodes.length > 0) {
        try {
          const layoutResult = layoutManager.applyLayout(rawNodes, transformedEdges);
          finalNodes = layoutResult.nodes;
          console.log(`Applied layout for ${selectedNetwork}: ${finalNodes.length} nodes, cached: ${layoutManager.hasCachedPositions()}`);
        } catch (error) {
          console.warn('Failed to apply layout, using raw positions:', error);
          finalNodes = rawNodes;
        }
      }

      setNodes(finalNodes);
      setEdges(transformedEdges);
      fitView({ padding: 0.1, duration: 800 });
      setViewport({ x: -70, y: 100, zoom: 0.5 }, { duration: 800 });

      // Auto-fit view after loading (similar to AgentFlow)
      // setTimeout(() => {
      //   fitView({ padding: 0.1, duration: 800 });
      // }, 150);
      // setViewport({ x: 0, y: 0, zoom: 0.2 }, { duration: 800 });

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
    console.log("Edit agent:", nodeId);
    // TODO: Open edit dialog
    setContextMenu({ visible: false, x: 0, y: 0, nodeId: "" });
  };

  const handleDeleteAgent = async (nodeId: string) => {
    console.log("Delete agent:", nodeId, "selectedDesignId:", selectedDesignId);
    
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

  const handleAddAgent = (x: number, y: number) => {
    console.log("Add agent at:", x, y);
    // TODO: Open add agent dialog
    setContextMenu({ visible: false, x: 0, y: 0, nodeId: "" });
  };

  const handleDuplicateAgent = async (nodeId: string) => {
    console.log("Duplicate agent:", nodeId, "selectedDesignId:", selectedDesignId);
    
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
    console.log("Add child agent to:", nodeId, "selectedDesignId:", selectedDesignId);
    
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

  // Load data when network changes or layout parameters change (similar to AgentFlow)
  useEffect(() => {
    console.log('useEffect triggered with:', { selectedNetwork, selectedDesignId });
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

  return (
    <Box sx={{ 
      height: '100%', 
      backgroundColor: theme.palette.background.default,
      position: 'relative',
      display: 'flex'
    }}>
      {/* Editor Palette */}
      <EditorPalette 
        onNetworkCreated={onNetworkCreated}
        onNetworkSelected={onNetworkSelected}
      />
      
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
        onAdd={handleAddAgent}
        onClose={() => setContextMenu({ visible: false, x: 0, y: 0, nodeId: "" })}
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
              Select a network from the sidebar to start editing
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default EditorAgentFlow;
