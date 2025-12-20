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

import { useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useEdgesState,
  useNodesState,
  useReactFlow,
  Node,
  Edge,
} from "reactflow";
import "reactflow/dist/style.css";
import { Box, Paper, Typography, alpha, Tooltip, Button } from "@mui/material";
import { AutoFixHigh as AutoArrangeIcon } from "@mui/icons-material";
import AgentNode from "./AgentNode";
import FloatingEdge from "./FloatingEdge";
import { useApiPort } from "../context/ApiPortContext";
import { useChatContext } from "../context/ChatContext";
import { useZenMode } from "../hooks/useZenMode";
import { useTheme } from "../context/ThemeContext";
import { useAgentLayoutManager } from "../hooks/useAgentLayoutManager";
import { useAgentHighlighting } from "../hooks/useAgentHighlighting";
import { useAgentFlowData } from "../hooks/useAgentFlowData";

const nodeTypes = { agent: AgentNode };
const edgeTypes = { floating: FloatingEdge };

interface ZenModeAgentFlowProps {
  zoomLevel?: number;
}

/**
 * ZenModeAgentFlow - A distraction-free version of AgentFlow for presentations
 * 
 * This component reuses the core AgentFlow logic but provides a cleaner UI
 * suitable for Zen Mode. It respects the zenModeConfig settings for which
 * controls to show/hide.
 */
const ZenModeAgentFlow = ({ zoomLevel = 1 }: ZenModeAgentFlowProps) => {
  const { apiUrl, wsUrl } = useApiPort();
  const { sessionId, activeNetwork } = useChatContext();
  const { config } = useZenMode();
  const { theme } = useTheme();
  
  const [nodes, setNodes, onNodesChange] = useNodesState<Node[]>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const { fitView, setViewport, zoomTo } = useReactFlow();

  // Layout settings - using fixed values for cleaner presentation
  const baseRadius = 30;
  const levelSpacing = 80;

  // Apply zoom level from Zen Mode context
  useEffect(() => {
    if (zoomLevel && zoomLevel !== 1) {
      zoomTo(zoomLevel, { duration: 200 });
    }
  }, [zoomLevel, zoomTo]);

  // Use layout manager hook
  const { applyLayout, forceLayout, handleNodesChange } = useAgentLayoutManager({
    selectedNetwork: activeNetwork,
    baseRadius,
    levelSpacing,
    onNodesChange,
    setNodes,
    enableDragging: config.features.enableNodeDragging,
  });

  // Use agent highlighting hook
  const { activeAgents, activeEdges } = useAgentHighlighting({
    selectedNetwork: activeNetwork,
    wsUrl,
    sessionId,
  });

  // Use agent flow data hook
  useAgentFlowData({
    selectedNetwork: activeNetwork,
    apiUrl,
    useCompactMode: true,
    applyLayout,
    setNodes,
    setEdges,
    fitView,
    setViewport,
    viewportConfig: {
      x: 0,
      y: 0,
      zoom: 0.7,
      duration: 800,
      padding: 0.2,
      fitViewDuration: 800,
    },
  });

  // Auto arrange function
  const handleAutoArrange = () => {
    const laidOutNodes = forceLayout(nodes, edges);
    setNodes(laidOutNodes);
    fitView({ padding: 0.2, duration: 800 });
  };

  // Custom styling for active/inactive states
  const getNodeStyle = (isActive: boolean) => ({
    boxShadow: isActive ? config.theme.activeAgentGlow : "none",
    borderColor: isActive ? config.theme.activeAgentBorder : undefined,
    transition: "box-shadow 0.3s ease, border-color 0.3s ease",
  });

  return (
    <Box
      sx={{
        height: "100%",
        width: "100%",
        position: "relative",
        backgroundColor: config.features.showAgentFlowBackground
          ? theme.palette.background.default
          : "transparent",
      }}
    >
      {/* Top Controls (if enabled) */}
      {config.features.showAgentFlowControls && (
        <Box
          sx={{
            position: "absolute",
            top: 12,
            left: 12,
            zIndex: 20,
            display: "flex",
            gap: 1,
          }}
        >
          <Tooltip title="Auto arrange nodes">
            <Button
              size="small"
              variant="contained"
              startIcon={<AutoArrangeIcon />}
              onClick={handleAutoArrange}
              sx={{
                backgroundColor: alpha(theme.palette.primary.main, 0.9),
                backdropFilter: "blur(8px)",
                "&:hover": {
                  backgroundColor: theme.palette.primary.main,
                },
                fontSize: "0.7rem",
                textTransform: "none",
                px: 1.5,
              }}
            >
              Auto Arrange
            </Button>
          </Tooltip>
        </Box>
      )}

      {/* Active Agent Indicator */}
      {config.features.showActiveAgentIndicator && activeAgents.size > 0 && (
        <Paper
          elevation={0}
          sx={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 20,
            px: 2,
            py: 1,
            backgroundColor: alpha(theme.palette.background.paper, 0.85),
            backdropFilter: "blur(8px)",
            borderRadius: 2,
            border: `1px solid ${alpha(config.theme.activeAgentBorder, 0.3)}`,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              color: theme.palette.text.secondary,
              display: "block",
              mb: 0.5,
              fontSize: "0.65rem",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Active Agents
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {Array.from(activeAgents).map((agent) => (
              <Box
                key={agent}
                sx={{
                  px: 1,
                  py: 0.25,
                  borderRadius: 1,
                  backgroundColor: alpha(config.theme.activeAgentBorder, 0.2),
                  border: `1px solid ${config.theme.activeAgentBorder}`,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    color: config.theme.activeAgentBorder,
                    fontWeight: 600,
                    fontSize: "0.7rem",
                  }}
                >
                  {agent}
                </Typography>
              </Box>
            ))}
          </Box>
        </Paper>
      )}

      {/* React Flow */}
      <ReactFlow
        nodes={nodes.map((node) => ({
          ...node,
          data: {
            ...node.data,
            isActive: activeAgents.has(node.id),
            selectedNetwork: activeNetwork,
          },
          style: getNodeStyle(activeAgents.has(node.id)),
        }))}
        edges={edges.map((edge) => ({
          ...edge,
          animated: activeEdges.has(`${edge.source}-${edge.target}`),
          style: {
            strokeWidth: activeEdges.has(`${edge.source}-${edge.target}`) ? 4 : 1.5,
            stroke: activeEdges.has(`${edge.source}-${edge.target}`)
              ? config.theme.activeAgentBorder
              : alpha(theme.palette.text.secondary, 0.3),
            transition: "stroke-width 0.3s ease, stroke 0.3s ease",
          },
        }))}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        minZoom={0.01}
        maxZoom={3}
        nodesDraggable={config.features.enableNodeDragging}
        proOptions={{ hideAttribution: true }}
      >
        {/* Background */}
        {config.features.showAgentFlowBackground && (
          <Background
            color={alpha(theme.palette.primary.main, 0.1)}
            gap={20}
            size={1}
          />
        )}

        {/* Controls (if enabled) */}
        {config.features.showAgentFlowControls && (
          <Controls
            showZoom={true}
            showFitView={true}
            showInteractive={false}
            style={{
              background: alpha(theme.palette.background.paper, 0.8),
              backdropFilter: "blur(8px)",
              borderRadius: 8,
              border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
            }}
          />
        )}

        {/* MiniMap (if enabled) */}
        {config.features.showMinimap && (
          <MiniMap
            nodeColor={(node) =>
              activeAgents.has(node.id)
                ? config.theme.activeAgentBorder
                : alpha(theme.palette.primary.main, 0.5)
            }
            maskColor={alpha(theme.palette.background.default, 0.8)}
            style={{
              background: alpha(theme.palette.background.paper, 0.9),
              border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
              borderRadius: 8,
            }}
          />
        )}
      </ReactFlow>

      {/* No Network Selected State */}
      {!activeNetwork && (
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            textAlign: "center",
          }}
        >
          <Typography
            variant="h6"
            sx={{
              color: alpha(theme.palette.text.secondary, 0.6),
              fontWeight: 300,
            }}
          >
            Select an agent network to visualize
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default ZenModeAgentFlow;
