
# Copyright (C) 2019-2021 Cognizant Digital Business, Evolutionary AI.
# All Rights Reserved.
# Issued under the Academic Public License.
#
# You can be released from the terms, and requirements of the Academic Public
# License by purchasing a commercial license.
# Purchase of a commercial license is mandatory for any use of the
# ENN-release SDK Software in commercial settings.
#
# END COPYRIGHT
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

const nodeTypes = { agent: AgentNode };
const edgeTypes = { floating: FloatingEdge };

// Define an interface for extended nodes (used in the layout)
interface ExtendedNode extends Node {
  style?: {
    width?: number;
    height?: number;
  };
  data: any;
  children: ExtendedNode[];
  parent?: ExtendedNode;
  depth: number;
  position: { x: number; y: number };
}

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

  useEffect(() => {
    if (!selectedNetwork) return;

    fetch(`http://127.0.0.1:${apiPort}/api/v1/network/${selectedNetwork}`)
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
      })
      .catch((err) => console.error("Error loading network:", err));
  }, [selectedNetwork, baseRadius, levelSpacing]);

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

  // ** A hierarchical radial layout for nodes **
  const hierarchicalRadialLayout = (
    nodes: any[],
    edges: any[],
    BASE_RADIUS: number,
    LEVEL_SPACING: number
  ): { nodes: ExtendedNode[]; edges: any[] } => {
    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
      console.error("Invalid nodes or edges:", nodes, edges);
      return { nodes: [], edges: [] };
    }

    console.log("Received nodes and edges:", { nodes, edges });

    // **Dynamic node size calculation**
    const nodeDimensions = nodes.map((node) => ({
      width: node.style?.width || 100,
      height: node.style?.height || 50,
    }));
    const NODE_SIZE = Math.max(
      ...nodeDimensions.map((n) => n.width),
      ...nodeDimensions.map((n) => n.height)
    );
    const PADDING = NODE_SIZE * 0.4;

    console.log(`NODE_SIZE: ${NODE_SIZE}, PADDING: ${PADDING}`);

    const rootNode = nodes.find((node) => !edges.some((edge) => edge.target === node.id));
    if (!rootNode) {
      console.error("No root node found!");
      return { nodes, edges };
    }

    // Create a map of ExtendedNodes.
    const nodeMap = new Map<string, ExtendedNode>(
      nodes.map((node: any) => [
        node.id,
        {...node,children: [],depth: -1,position: { x: 0, y: 0 },} as ExtendedNode,])
    );

    // Build parent-child relationships.
    edges.forEach(({ source, target }: { source: string; target: string }) => {
      if (nodeMap.has(target) && nodeMap.has(source)) {
        const parentNode = nodeMap.get(source)!;
        const childNode = nodeMap.get(target)!;
        childNode.parent = parentNode;
        parentNode.children.push(childNode);
      }
    });

    // Set depth for each node recursively.
     const setDepth = (node: ExtendedNode, depth: number = 0): void => {
      node.depth = depth;
       node.children.forEach((child: ExtendedNode) => setDepth(child, depth + 1));
    };
     setDepth(nodeMap.get(rootNode.id)!);

    // Organize nodes by depth level.
    const levelMap = new Map<number, ExtendedNode[]>();
    Array.from(nodeMap.values()).forEach((node) => {
      if (!levelMap.has(node.depth)) levelMap.set(node.depth, []);
      levelMap.get(node.depth)!.push(node);
    });

    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    // Set the root node's position at the center.
    nodeMap.get(rootNode.id)!.position = { x: centerX, y: centerY };

    // Arrange nodes for each level (depth).
    levelMap.forEach((nodesAtLevel, depth) => {
      if (depth === 0) return;

      const parentNodes = levelMap.get(depth - 1) || [];
      const angleStep = (2 * Math.PI) / Math.max(nodesAtLevel.length, 3);

      nodesAtLevel.forEach((node: ExtendedNode, index: number) => {
        const parent = node.parent || parentNodes[Math.floor(index / 2)];
        const parentX = parent.position.x;
        const parentY = parent.position.y;
        const radius = BASE_RADIUS + depth * LEVEL_SPACING;
        const angle = index * angleStep;
        node.position = {
          x: parentX + radius * Math.cos(angle),
          y: parentY + radius * Math.sin(angle),
        };
      });
    });

    const positionedNodes = Array.from(nodeMap.values());
    const positionedEdges = edges.map((edge) => ({
      ...edge,
      type: "floating",
      animated: true,
      style: { strokeWidth: 2, stroke: "#ffffff" },
    }));

    return { nodes: positionedNodes, edges: positionedEdges };
  };

  return (
    <div className="h-full w-full bg-gray-800 relative">
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

      <ReactFlow
        nodes={nodes.map((node) => ({
          ...node,
          data: { ...node.data, isActive: activeAgents.has(node.id) },
        }))}
        edges={edges.map((edge) => ({
          ...edge,
          animated: activeEdges.has(`${edge.source}-${edge.target}`),
          style: {
            strokeWidth: activeEdges.has(`${edge.source}-${edge.target}`) ? 3 : 1,
            stroke: activeEdges.has(`${edge.source}-${edge.target}`) ? "#ffcc00" : "#ffffff",
          },
        }))}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
};

export default AgentFlow;
