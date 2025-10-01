
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
} from "reactflow";
import "reactflow/dist/style.css";
import { 
  Box, 
  Button, 
  Slider, 
  Typography, 
  Paper, 
  Tooltip, 
  useTheme,
  alpha
} from "@mui/material";
import { 
  AutoFixHigh as AutoArrangeIcon,
  Refresh as ResetIcon,
  ViewCompact as CompactIcon,
  ViewModule as FullIcon
} from "@mui/icons-material";
import AgentNode from "./AgentNode";
import FloatingEdge from "./FloatingEdge";
import { useApiPort } from "../context/ApiPortContext";
import { createLayoutManager } from "../utils/agentLayoutManager";

const nodeTypes = { agent: AgentNode };
const edgeTypes = { floating: FloatingEdge };

const AgentFlow = ({ selectedNetwork }: { selectedNetwork: string }) => {
  const { apiUrl, wsUrl } = useApiPort();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node[]>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const { fitView, setViewport } = useReactFlow();
  const theme = useTheme();

  // ** State for highlighting active agents & edges **
  const [activeAgents, setActiveAgents] = useState<Set<string>>(new Set());
  const [activeEdges, setActiveEdges] = useState<Set<string>>(new Set());

  // ** State for actual values (used in API calls/layout) **
  const [baseRadius, setBaseRadius] = useState(30);
  const [levelSpacing, setLevelSpacing] = useState(80);

  // ** State for temporary values while scrubbing **
  const [tempBaseRadius, setTempBaseRadius] = useState(baseRadius);
  const [tempLevelSpacing, setTempLevelSpacing] = useState(levelSpacing);

  // ** Add a diagramKey to force a full remount of ReactFlow **
  const [diagramKey, setDiagramKey] = useState(0);
  // ** Add a compact mode option for connectivity **
  const [useCompactMode, setUseCompactMode] = useState(true);

  // ** Layout manager (same pattern as EditorAgentFlow) **
  const layoutManager = selectedNetwork
    ? createLayoutManager(selectedNetwork, { baseRadius, levelSpacing })
    : null;

  const resetFlow = () => {
    setNodes([]);
    setEdges([]);
    setDiagramKey(prev => prev + 1); // This forces a full remount
  };

  // Fetch and render network with cached layout (if present)
  useEffect(() => {
    if (!selectedNetwork) return;

    const endpoint = useCompactMode ? "connectivity" : "compact_connectivity";

    fetch(`${apiUrl}/api/v1/${endpoint}/${selectedNetwork}`)
      .then((res) => res.json())
      .then((data) => {
        // Shape edges (preserve AgentFlow visuals)
        const transformedEdges: Edge[] = (data.edges as Edge[]).map((edge) => ({
          ...edge,
          type: "floating",
          animated: true,
          markerEnd: "arrowclosed" as EdgeMarkerType,
        }));

        // Start with raw nodes from API
        const rawNodes: Node[] = (data.nodes as Node[]);

        // Apply intelligent layout w/ position cache (like EditorAgentFlow)
        let finalNodes = rawNodes;
        if (layoutManager && rawNodes.length > 0) {
          try {
            const layoutResult = layoutManager.applyLayout(rawNodes, transformedEdges);
            finalNodes = layoutResult.nodes as Node[];
          } catch (e) {
            console.warn("[AgentFlow] layoutManager.applyLayout failed; using raw positions:", e);
          }
        }

        setNodes(finalNodes);
        setEdges(transformedEdges);

        // Fit view/viewport exactly as before
        fitView();
        // console.log("received data", data);
        // You can change zoom and center values as needed
        setViewport({ x: 0, y: 0, zoom: 0.5 }, { duration: 800 });
      })
      .catch((err) => console.error("Error loading network:", err));
  }, [selectedNetwork, apiUrl, useCompactMode, baseRadius, levelSpacing]); // keep deps so sliders still reflow

  // WebSocket highlighting (unchanged)
  useEffect(() => {
    if (!selectedNetwork) return;
    
    const ws = new WebSocket(`${wsUrl}/api/v1/ws/logs/${selectedNetwork}`);

    ws.onopen = () => console.log("Logs WebSocket Connected.");
    ws.onmessage = (event: MessageEvent) => {
      try {
        if (!isValidJson(event.data)) {
          console.error("Invalid JSON received:", event.data);
          return;
        }

        const data = JSON.parse(event.data);
        if (data.message && isValidJson(data.message)) {
          const logMessage = JSON.parse(data.message);
          if (logMessage.otrace) {
            // Ensure the otrace array is treated as an array of strings.
            const newActiveAgents = new Set<string>(logMessage.otrace);
            setActiveAgents(newActiveAgents);

            // ** Generate active edges from the agent sequence **
            if (logMessage.otrace.length > 1) {
              const newActiveEdges = new Set<string>();
              for (let i = 0; i < logMessage.otrace.length - 1; i++) {
                newActiveEdges.add(`${logMessage.otrace[i]}-${logMessage.otrace[i + 1]}`);
              }
              setActiveEdges(newActiveEdges);
            }
          }
        }
      } catch (error) {
        console.error("Error parsing WebSocket log message:", error);
      }
    };

    ws.onclose = () => console.log("Logs WebSocket Disconnected");

    return () => ws.close();
  }, [selectedNetwork, wsUrl]);

  // Save cached positions after drag-end (debounced), like editor
  const handleNodesChange = useCallback((changes: any[]) => {
    onNodesChange(changes);

    const ended = changes.some(
      (c: any) => c.type === "position" && c.dragging === false
    );
    if (ended && layoutManager) {
      setTimeout(() => {
        setNodes((curr) => {
          try {
            layoutManager.savePositions(curr);
          } catch (e) {
            console.warn("[AgentFlow] layoutManager.savePositions failed:", e);
          }
          return curr;
        });
      }, 400);
    }
  }, [onNodesChange, layoutManager, setNodes]);

  // Utility function to validate JSON
  const isValidJson = (str: string): boolean => {
    try {
      JSON.parse(str);
      return true;
    } catch (error) {
      return false;
    }
  };

  return (
    <Box sx={{ 
      height: '100%', 
      width: '100%', 
      backgroundColor: theme.palette.background.default,
      position: 'relative',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Top Controls Bar */}
      <Box sx={{ 
        position: 'absolute', 
        top: 8, 
        left: 8, 
        zIndex: 20,
        display: 'flex',
        gap: 1
      }}>
        <Tooltip title="Auto arrange nodes">
          <span style={{ display: 'inline-block' }}>
            <Button
              size="small"
              variant="contained"
              startIcon={<AutoArrangeIcon />}
              onClick={() => {
                if (layoutManager && nodes.length > 0) {
                  try {
                    const { nodes: laidOut } = layoutManager.forceLayout(nodes, edges);
                    setNodes(laidOut as Node[]);
                    // persist immediately so the view sticks next load
                    layoutManager.savePositions(laidOut as Node[]);
                  } catch (e) {
                    console.warn("[AgentFlow] forceLayout failed:", e);
                  }
                }
                fitView();
              }}
              sx={{
                backgroundColor: theme.palette.primary.main,
                '&:hover': { backgroundColor: theme.palette.primary.dark },
                fontSize: '0.75rem',
                minWidth: 'auto',
                px: 1.5
              }}
            >
              Arrange
            </Button>
          </span>
        </Tooltip>
        
        <Tooltip title="Reset viewport">
          <span style={{ display: 'inline-block' }}>
            <Button
              size="small"
              variant="contained"
              startIcon={<ResetIcon />}
              onClick={resetFlow}
              sx={{
                backgroundColor: theme.palette.secondary.main,
                '&:hover': { backgroundColor: theme.palette.secondary.dark },
                fontSize: '0.75rem',
                minWidth: 'auto',
                px: 1.5
              }}
            >
              Reset
            </Button>
          </span>
        </Tooltip>
      </Box>

      {/* Compact Layout Controls Panel */}
      <Paper
        elevation={1}
        sx={{
          position: 'absolute',
          top: 8,
          right: 8,
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
          fontSize: '0.65rem'
        }}>
          Layout
        </Typography>
        
        <Box sx={{ mb: 0.5 }}>
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

      {/* React Flow Component */}
      <ReactFlow
        key={diagramKey} // Force remount on network change
        nodes={nodes.map((node) => ({
          ...node,
          data: { ...node.data, isActive: activeAgents.has(node.id), selectedNetwork },
        }))}
        edges={edges.map((edge) => ({
          ...edge,
          animated: activeEdges.has(`${edge.source}-${edge.target}`),
          style: {
            strokeWidth: activeEdges.has(`${edge.source}-${edge.target}`) ? 4 : 1,
            stroke: activeEdges.has(`${edge.source}-${edge.target}`) ? theme.palette.warning.main : theme.palette.divider,
          },
        }))}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        minZoom={0.1}
        maxZoom={3}
        // style={{ backgroundColor: theme.palette.background.default }}
      >
        <Background/>
        <Controls>
          <div className="react-flow__controls-button">
            <Tooltip title={useCompactMode ? "Switch to full connectivity" : "Switch to compact connectivity"}>
              <span style={{ display: 'inline-block' }}>
                <Button
                  size="small"
                  onClick={() => setUseCompactMode(!useCompactMode)}
                  sx={{
                    minWidth: 12,
                    width: 12,
                    height: 12,
                    p: 0,
                    backgroundColor: theme.palette.background.paper,
                    border: `1px solid ${theme.palette.divider}`,
                    color: theme.palette.text.primary,
                    borderRadius: '4px',
                    '&:hover': {
                      backgroundColor: alpha(theme.palette.primary.main, 0.1),
                      borderColor: theme.palette.primary.main
                    }
                  }}
                >
                  {useCompactMode ? <CompactIcon sx={{ fontSize: 12 }} /> : <FullIcon sx={{ fontSize: 12 }} />}
                </Button>
              </span>
            </Tooltip>
          </div>
        </Controls>
      </ReactFlow>
    </Box>
  );
};

export default AgentFlow;
