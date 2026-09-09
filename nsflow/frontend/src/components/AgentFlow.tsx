
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

import { useEffect, useState, useCallback, useMemo } from "react";
import { ReactFlow,
  Background,
  Controls,
  useEdgesState,
  useNodesState,
  useReactFlow,
  Node,
  Edge,
  EdgeMarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Alert,
  Box,
  Button,
  Slider,
  Snackbar,
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
import NetworkFileActions from "./NetworkFileActions";
import { toConnectivityList } from "../state/definitionShape";
import { useEditorNetworkStore } from "../state/editorNetworkStore";
import { sendEditorUpdate } from "../state/editorRoundTrip";
import { waitForServedNetwork } from "../state/servedNetworks";
import { useApiPort } from "../context/ApiPortContext";
import { useChatContext } from "../context/ChatContext";
import { createLayoutManager } from "../utils/agentLayoutManager";

const nodeTypes = { agent: AgentNode };
const edgeTypes = { floating: FloatingEdge };

interface AgentFlowProps {
  selectedNetwork: string;
  /**
   * Called with the name of a network just imported and saved, so the page can
   * select it. AgentFlow cannot select for itself: the Home page owns that state.
   */
  onNetworkImported?: (networkName: string) => void;
}

const AgentFlow = ({ selectedNetwork, onNetworkImported }: AgentFlowProps) => {
  const { apiUrl, wsUrl } = useApiPort();
  const { sessionId } = useChatContext();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { fitView, setViewport } = useReactFlow();
  const theme = useTheme();
  /** Why the last import failed, or undefined. */
  const [importError, setImportError] = useState<string | undefined>(undefined);
  /** True while an import is being parsed and saved, which takes a round trip. */
  const [importing, setImporting] = useState(false);

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

        // Only setViewport here, deliberately. @xyflow/react 12 queues fitView
        // until the fresh nodes are measured, so it would land after (and override)
        // setViewport's animation. Under v11 fitView was a no-op against unmeasured
        // nodes and setViewport always won, so dropping it preserves the
        // pre-upgrade behaviour. You can change zoom and center values as needed.
        setViewport({ x: 0, y: 0, zoom: 0.5 }, { duration: 800 });
      })
      .catch((err) => console.error("Error loading network:", err));
  }, [selectedNetwork, apiUrl, useCompactMode, baseRadius, levelSpacing]); // keep deps so sliders still reflow

  // WebSocket highlighting (unchanged)
  useEffect(() => {
    if (!selectedNetwork) return;

    const ws = new WebSocket(`${wsUrl}/api/v1/ws/logs/${selectedNetwork}/${sessionId}`);

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
  }, [selectedNetwork, wsUrl, sessionId]);

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

  /**
   * Download the selected network's .hocon.
   *
   * Straight from the registry, because Home only ever shows a network that is
   * already served. There is no notebook option: it was stale, depended on the
   * server's working directory, and is not what anyone reached for here.
   */
  const handleExportHocon = useCallback(async () => {
    if (!selectedNetwork || !apiUrl) return;
    const response = await fetch(
      `${apiUrl}/api/v1/export/agent_network/${encodeURIComponent(selectedNetwork)}`
    );
    if (!response.ok) return;
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedNetwork}.hocon`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [apiUrl, selectedNetwork]);

  /**
   * Import a .hocon, save it, and open it here for chat.
   *
   * Saving is the step that matters. Parsing alone gives a definition the browser can
   * draw but neuro-san does not serve, so the network would not be chattable and
   * would not appear anywhere else. The save goes through the designer with
   * `skip_designer` set, which persists the network exactly as imported, under its
   * own name, alongside every other generated network.
   */
  const handleImport = useCallback(
    async (file: File) => {
      if (!apiUrl) return;
      setImporting(true);
      try {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch(`${apiUrl}/api/v1/hocon/import`, { method: "POST", body });
        const payload = await response.json().catch(() => undefined);
        if (!response.ok) {
          setImportError(payload?.detail || "Could not read that file.");
          return;
        }

        const definition = toConnectivityList(payload.definition);
        const networkName: string | undefined = payload.network_name;
        if (!definition || !networkName) {
          setImportError("That file parsed but produced no agents.");
          return;
        }

        // Seed the editor store under the network's own name before saving, because
        // sendEditorUpdate reads the name from there when the caller omits it, and a
        // later visit to the Editor should find the same network already loaded.
        useEditorNetworkStore.getState().reconcileFromServer(networkName, {
          definition,
          networkName,
          hocon: payload.hocon,
        });

        await sendEditorUpdate({
          apiUrl,
          networkId: networkName,
          agentName: definition[0]?.origin ?? "",
          definition,
          networkName,
          message: `Import agent network "${networkName}"`,
        });

        // Saved is not the same as servable: neuro-san picks the file up on its next
        // registry reload. Selecting before then fetches connectivity for a network
        // that does not exist yet, which fails quietly and leaves a blank canvas.
        const served = await waitForServedNetwork(apiUrl, networkName);
        if (!served) {
          setImportError(
            `Imported "${networkName}", but the server has not picked it up yet. It should appear in the sidebar shortly.`
          );
          return;
        }
        onNetworkImported?.(served);
      } catch (error) {
        setImportError(error instanceof Error ? error.message : "Could not import that file.");
      } finally {
        setImporting(false);
      }
    },
    [apiUrl, onNetworkImported]
  );

  // Utility function to validate JSON
  const isValidJson = (str: string): boolean => {
    try {
      JSON.parse(str);
      return true;
    } catch (_error) {
      return false;
    }
  };

  // Derive the render arrays once per relevant change instead of rebuilding new node/edge
  // objects on every render. Stable references let React.memo on the node/edge components
  // skip re-rendering unchanged elements, which is what keeps large graphs responsive.
  const displayNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: { ...node.data, isActive: activeAgents.has(node.id), selectedNetwork },
      })),
    [nodes, activeAgents, selectedNetwork]
  );

  const displayEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        animated: activeEdges.has(`${edge.source}-${edge.target}`),
        style: {
          strokeWidth: activeEdges.has(`${edge.source}-${edge.target}`) ? 4 : 1,
          stroke: activeEdges.has(`${edge.source}-${edge.target}`)
            ? theme.palette.warning.main
            : theme.palette.mode === "dark"
              ? "rgba(255, 255, 255, 0.35)"
              : "rgba(0, 0, 0, 0.3)",
        },
      })),
    [edges, activeEdges, theme.palette.warning.main, theme.palette.mode]
  );

  return (
    <Box sx={{
      height: '100%', 
      width: '100%', 
      backgroundColor: theme.palette.background.default,
      position: 'relative',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/*
        File actions, stacked below the layout row rather than beside it. Both used
        the same corner and the panel won, hiding these completely.
      */}
      <Box sx={{ position: 'absolute', top: 56, right: 60, zIndex: 20 }}>
        <NetworkFileActions
          size={40}
          onExportHocon={handleExportHocon}
          onImport={importing ? undefined : handleImport}
          importTooltip="Import a .hocon file, saved and opened here for chat"
          exportDisabledReason={selectedNetwork ? undefined : "Select an agent network first"}
        />
      </Box>

      {/* Why an import failed. */}
      <Snackbar
        open={Boolean(importError)}
        autoHideDuration={8000}
        onClose={() => setImportError(undefined)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="error" onClose={() => setImportError(undefined)} sx={{ maxWidth: 520 }}>
          {importError}
        </Alert>
      </Snackbar>

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

      {/*
        Layout controls, as a single row.
        This was a tall narrow panel pinned to the same corner as the canvas actions,
        which it covered completely. Matching the Editor's one-row form frees the
        corner and keeps both readable at any canvas width.
      */}
      <Paper
        elevation={1}
        sx={{
          position: 'absolute',
          top: 8,
          right: 60, // Clear of the ReactFlow controls
          zIndex: 20,
          px: 1.25,
          py: 0.5,
          borderRadius: 2,
          backgroundColor: alpha(theme.palette.background.paper, 0.95),
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        {([
          { label: 'Radius', value: tempBaseRadius, set: setTempBaseRadius, commit: () => setBaseRadius(tempBaseRadius), min: 10, max: 300 },
          { label: 'Spacing', value: tempLevelSpacing, set: setTempLevelSpacing, commit: () => setLevelSpacing(tempLevelSpacing), min: 20, max: 400 },
        ]).map((control) => (
          <Box key={control.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography
              variant="caption"
              sx={{ color: theme.palette.text.secondary, fontSize: '0.6rem', whiteSpace: 'nowrap' }}
            >
              {control.label} {control.value}
            </Typography>
            <Slider
              size="small"
              value={control.value}
              min={control.min}
              max={control.max}
              onChange={(_, value) => control.set(value as number)}
              onMouseUp={control.commit}
              onTouchEnd={control.commit}
              sx={{
                color: theme.palette.primary.main,
                height: 2,
                width: 64,
                '& .MuiSlider-thumb': { width: 8, height: 8 },
                '& .MuiSlider-track': { height: 2 },
                '& .MuiSlider-rail': { height: 2 },
              }}
            />
          </Box>
        ))}
      </Paper>

      {/* React Flow Component */}
      <ReactFlow
        key={diagramKey} // Force remount on network change
        // @xyflow/react 12 defaults --xy-controls-button-color-default to
        // `inherit`, so the Controls icons pick up the app's text colour (white
        // under the dark theme) while the button background stays on v12's light
        // palette, rendering them white-on-white. Handing v12 the palette mode
        // switches it to its own .dark variables. (v11 hardcoded the icon fill,
        // which is why this only appeared after the upgrade.)
        colorMode={theme.palette.mode}
        nodes={displayNodes}
        edges={displayEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        onlyRenderVisibleElements
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        minZoom={0.01}
        maxZoom={3}
        // style={{ backgroundColor: theme.palette.background.default }}
      >
        <Background/>
        <Controls
          position="top-right"
          style={{
            backgroundColor: theme.palette.background.paper,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: '8px'
          }}
        >
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
