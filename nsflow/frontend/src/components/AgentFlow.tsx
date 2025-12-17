
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

import { useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  useEdgesState,
  useNodesState,
  useReactFlow,
  Node,
  Edge,
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
import { useChatContext } from "../context/ChatContext";
import { useAgentLayoutManager } from "../hooks/useAgentLayoutManager";
import { useAgentHighlighting } from "../hooks/useAgentHighlighting";
import { useAgentFlowData } from "../hooks/useAgentFlowData";

const nodeTypes = { agent: AgentNode };
const edgeTypes = { floating: FloatingEdge };

const AgentFlow = ({ selectedNetwork }: { selectedNetwork: string }) => {
  const { apiUrl, wsUrl } = useApiPort();
  const { sessionId } = useChatContext();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node[]>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const { fitView, setViewport } = useReactFlow();
  const theme = useTheme();

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

  const resetFlow = () => {
    setNodes([]);
    setEdges([]);
    setDiagramKey(prev => prev + 1); // This forces a full remount
  };

  // Use layout manager hook
  const { applyLayout, forceLayout, handleNodesChange } = useAgentLayoutManager({
    selectedNetwork,
    baseRadius,
    levelSpacing,
    onNodesChange,
    setNodes,
    enableDragging: true,
  });

  // Use agent highlighting hook
  const { activeAgents, activeEdges } = useAgentHighlighting({
    selectedNetwork,
    wsUrl,
    sessionId,
  });

  // Use agent flow data hook
  useAgentFlowData({
    selectedNetwork,
    apiUrl,
    useCompactMode,
    applyLayout,
    setNodes,
    setEdges,
    fitView,
    setViewport,
    viewportConfig: {
      x: 0,
      y: 0,
      zoom: 0.5,
      duration: 800,
    },
  });

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
        <Tooltip title="Auto arrange nodes to original state">
          <span style={{ display: 'inline-block' }}>
            <Button
              size="small"
              variant="contained"
              startIcon={<AutoArrangeIcon />}
              onClick={() => {
                const laidOutNodes = forceLayout(nodes, edges);
                setNodes(laidOutNodes);
                fitView();
              }}
              sx={{
                backgroundColor: theme.palette.primary.main,
                '&:hover': { backgroundColor: theme.palette.primary.dark },
                fontSize: '0.6rem',
                minWidth: 'auto',
                px: 1.5,
                textTransform: 'none'
              }}
            >
              Auto Arrange
            </Button>
          </span>
        </Tooltip>
        
        <Tooltip title="Reset (Clear) viewport">
          <span style={{ display: 'inline-block' }}>
            <Button
              size="small"
              variant="contained"
              startIcon={<ResetIcon />}
              onClick={resetFlow}
              sx={{
                backgroundColor: theme.palette.secondary.main,
                '&:hover': { backgroundColor: theme.palette.secondary.dark },
                fontSize: '0.6rem',
                minWidth: 'auto',
                px: 1.5,
                textTransform: 'none'
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
        minZoom={0.01}
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
