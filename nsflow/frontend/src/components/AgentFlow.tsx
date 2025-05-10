
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
import { useEffect, useState } from "react";
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
import AgentNode from "./AgentNode";
import FloatingEdge from "./FloatingEdge";
import { useApiPort } from "../context/ApiPortContext";
import { hierarchicalRadialLayout } from "../utils/hierarchicalRadialLayout";
import { FaBoxOpen, FaBox } from "react-icons/fa";

const nodeTypes = { agent: AgentNode };
const edgeTypes = { floating: FloatingEdge };

const AgentFlow = ({ selectedNetwork }: { selectedNetwork: string }) => {
  const { apiPort } = useApiPort();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { fitView } = useReactFlow();

  // ** State for highlighting active agents & edges **
  const [activeAgents, setActiveAgents] = useState<Set<string>>(new Set());
  const [activeEdges, setActiveEdges] = useState<Set<string>>(new Set());

  // ** State for actual values (used in API calls) **
  const [baseRadius, setBaseRadius] = useState(110);
  const [levelSpacing, setLevelSpacing] = useState(125);

  // ** State for temporary values while scrubbing **
  const [tempBaseRadius, setTempBaseRadius] = useState(baseRadius);
  const [tempLevelSpacing, setTempLevelSpacing] = useState(levelSpacing);

  // ** Get access to the ReactFlow setViewport instance **
  const { setViewport } = useReactFlow();

  // ** Add a diagramKey to force a full remount of ReactFlow **
  const [diagramKey, setDiagramKey] = useState(0);
  // ** Add a compact mode option for connectivity **
  const [useCompactMode, setUseCompactMode] = useState(true);

  const resetFlow = () => {
    setNodes([]);
    setEdges([]);
    setDiagramKey(prev => prev + 1); // This forces a full remount
  };

  useEffect(() => {
    // Set zoom to 0.75 and center at (0, 0)
    setViewport({ x: 0, y: 0, zoom: 0.5 }, { duration: 800 }); // Optional animation
  }, []);
    
  useEffect(() => {
    if (!selectedNetwork) return;

    const endpoint = useCompactMode ? "connectivity" : "compact_connectivity";

    fetch(`http://127.0.0.1:${apiPort}/api/v1/${endpoint}/${selectedNetwork}`)
      .then((res) => res.json())
      .then((data) => {
        const { nodes: arrangedNodes, edges: arrangedEdges } = hierarchicalRadialLayout(
          data.nodes,
          data.edges,
          baseRadius,
          levelSpacing
        );

        setNodes(arrangedNodes as Node<any>[]);
        setEdges(
          arrangedEdges.map((edge: Edge) => ({
            ...edge,
            type: "floating",
            animated: true,
            markerEnd: "arrowclosed" as EdgeMarkerType,
          }))
        );
        fitView();
        // console.log("received data", data);
        // You can change zoom and center values as needed
        setViewport({ x: 0, y: 20, zoom: 0.5 }, { duration: 800 });
      })
      .catch((err) => console.error("Error loading network:", err));
  }, [selectedNetwork, baseRadius, levelSpacing, useCompactMode]);

  useEffect(() => {
    if (!selectedNetwork) return;
    
    const ws = new WebSocket(`ws://localhost:${apiPort}/api/v1/ws/logs/${selectedNetwork}`);

    ws.onopen = () => console.log("Logs WebSocket Connected.");
    ws.onmessage = (event: MessageEvent) => {
      try {
        // Validate the outer JSON message
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
  }, [selectedNetwork, apiPort]);

  // Utility function to validate JSON
  const isValidJson = (str: string): boolean => {
    try {
      JSON.parse(str);
      return true;
    } catch (error) {
      return false;
    }
  };

  // ** Updates the temporary value on slider change **
  const handleSliderChange = (
    _setter: React.Dispatch<React.SetStateAction<number>>, // unused; prefix with _ to indicate so
    setTempSetter: React.Dispatch<React.SetStateAction<number>>
  ) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setTempSetter(Number(event.target.value));
  };

  // ** Updates the actual value when scrubbing stops **
  const handleSliderRelease = (
    setter: React.Dispatch<React.SetStateAction<number>>,
    value: number
  ) => () => {
    setter(value);
  };

  return (
    <div className="agent-flow-container h-full w-full bg-gray-800 relative">
      {/* Auto Arrange Button */}
      <button
        className="absolute top-2 left-2 p-1 text-xs bg-blue-500 opacity-80 hover:bg-blue-600 text-white rounded-md shadow-md transition-all z-20"
        onClick={() => {
          const { nodes: arrangedNodes, edges: arrangedEdges } = hierarchicalRadialLayout(
            nodes,
            edges,
            baseRadius,
            levelSpacing
          );
          setNodes(arrangedNodes);
          setEdges(arrangedEdges);
          fitView();
        }}
      >
        Auto Arrange
      </button>
      {/* Reset Button */}
      <button
        title="Cleanup the reactflow viewport" 
        className="absolute top-2 left-24 p-1 text-xs bg-blue-400 hover:bg-red-600 text-white rounded-md shadow-md z-20"
        onClick={resetFlow}
      >
        Reset
      </button>

      {/* Sliders for BASE_RADIUS & LEVEL_SPACING */}
      <div className="slider-container">
        <div className="slider-group">
          <label>Base Radius: {tempBaseRadius}px</label>
          <input
            type="range"
            min="10"
            max="300"
            value={tempBaseRadius}
            onChange={handleSliderChange(setBaseRadius, setTempBaseRadius)}
            onMouseUp={handleSliderRelease(setBaseRadius, tempBaseRadius)}
            onTouchEnd={handleSliderRelease(setBaseRadius, tempBaseRadius)}
          />
        </div>
        <div className="slider-group">
          <label>Level Spacing: {tempLevelSpacing}px</label>
          <input
            type="range"
            min="10"
            max="300"
            value={tempLevelSpacing}
            onChange={handleSliderChange(setLevelSpacing, setTempLevelSpacing)}
            onMouseUp={handleSliderRelease(setLevelSpacing, tempLevelSpacing)}
            onTouchEnd={handleSliderRelease(setLevelSpacing, tempLevelSpacing)}
          />
        </div>
      </div>

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
            strokeWidth: activeEdges.has(`${edge.source}-${edge.target}`) ? 3 : 1,
            stroke: activeEdges.has(`${edge.source}-${edge.target}`) ? "#ffcc00" : "var(--agentflow-edge)",
          },
        }))}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
      >
        <Background />
        <Controls>
          <div className="react-flow__controls-button" title="Toggle connectivity mode">
            <button
              onClick={() => setUseCompactMode(!useCompactMode)}
              className="agent-flow-container p-1 flex items-center justify-center text-white bg-gray-700 hover:bg-gray-600 rounded shadow-sm"
              title={useCompactMode ? "Switch to compact connectivity" : "Switch to full connectivity"}
            >
              {useCompactMode ? <FaBoxOpen size={14} /> : <FaBox size={14} />}
            </button>
          </div>
        </Controls>

      </ReactFlow>
    </div>
  );
};

export default AgentFlow;
