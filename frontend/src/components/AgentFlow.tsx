import React, { useEffect, useState, useCallback } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";
import AgentNode from "./AgentNode";
import FloatingEdge from "./FloatingEdge";

const nodeTypes = { agent: AgentNode };
const edgeTypes = { floating: FloatingEdge };

const AgentFlow = ({ selectedNetwork }: { selectedNetwork: string }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { fitView } = useReactFlow();

  // ** State for actual values (used in API calls) **
  const [baseRadius, setBaseRadius] = useState(140);
  const [levelSpacing, setLevelSpacing] = useState(160);

  // ** State for temporary values while scrubbing **
  const [tempBaseRadius, setTempBaseRadius] = useState(baseRadius);
  const [tempLevelSpacing, setTempLevelSpacing] = useState(levelSpacing);

  useEffect(() => {
    if (!selectedNetwork) return;

    fetch(`http://127.0.0.1:8000/api/v1/network/${selectedNetwork}`)
      .then((res) => res.json())
      .then((data) => {
        const { nodes: arrangedNodes, edges: arrangedEdges } = hierarchicalRadialLayout(data.nodes, data.edges, baseRadius, levelSpacing);
        setNodes(arrangedNodes);
        setEdges(
          arrangedEdges.map((edge) => ({
            ...edge,
            type: "floating",
            animated: true,
            markerEnd: { type: "arrowclosed" },
          }))
        );
        fitView();
      })
      .catch((err) => console.error("Error loading network:", err));
  }, [selectedNetwork, baseRadius, levelSpacing]); // API call only on final values

  // ** Updates the actual values only when scrubbing stops **
  const handleSliderChange = (setter, setTempSetter) => (event) => {
    setTempSetter(Number(event.target.value));
  };

  const handleSliderRelease = (setter, value) => () => {
    setter(value); // API call only when slider is released
  };

  const hierarchicalRadialLayout = (nodes, edges, BASE_RADIUS, LEVEL_SPACING) => {
    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
      console.error("Invalid nodes or edges:", nodes, edges);
      return { nodes: [], edges: [] };
    }

    console.log("Received nodes and edges:", { nodes, edges });

    // **🔧 Dynamic node size calculation**
    const nodeDimensions = nodes.map(node => ({
      width: node.style?.width || 100,
      height: node.style?.height || 50,
    }));
    const NODE_SIZE = Math.max(...nodeDimensions.map(n => n.width), ...nodeDimensions.map(n => n.height));
    const PADDING = NODE_SIZE * 0.4;

    console.log(`📏 NODE_SIZE: ${NODE_SIZE}, PADDING: ${PADDING}`);

    const rootNode = nodes.find((node) => !edges.some((edge) => edge.target === node.id));
    if (!rootNode) {
      console.error("No root node found!");
      return { nodes, edges };
    }

    const nodeMap = new Map(
      nodes.map((node) => [node.id, { ...node, children: [], depth: -1, position: { x: 0, y: 0 } }])
    );

    edges.forEach(({ source, target }) => {
      if (nodeMap.has(target) && nodeMap.has(source)) {
        nodeMap.get(target).parent = nodeMap.get(source);
        nodeMap.get(source).children.push(nodeMap.get(target));
      }
    });

    const setDepth = (node, depth = 0) => {
      node.depth = depth;
      node.children.forEach((child) => setDepth(child, depth + 1));
    };
    setDepth(nodeMap.get(rootNode.id));

    const levelMap = new Map();
    Array.from(nodeMap.values()).forEach((node) => {
      if (!levelMap.has(node.depth)) levelMap.set(node.depth, []);
      levelMap.get(node.depth).push(node);
    });

    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    rootNode.position = { x: centerX, y: centerY };

    levelMap.forEach((nodesAtLevel, depth) => {
      if (depth === 0) return;

      const parentNodes = levelMap.get(depth - 1) || [];
      const angleStep = (2 * Math.PI) / Math.max(nodesAtLevel.length, 3);

      nodesAtLevel.forEach((node, index) => {
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
          const { nodes: arrangedNodes, edges: arrangedEdges } = hierarchicalRadialLayout(nodes, edges, baseRadius, levelSpacing);
          setNodes(arrangedNodes);
          setEdges(arrangedEdges);
          fitView();
        }}>
        Auto Arrange
      </button>

      {/* Sliders for BASE_RADIUS & LEVEL_SPACING */}
      <div className="absolute top-2 right-2 p-2 bg-gray-700 opacity-90 text-white rounded-md shadow-md z-20">
        <div>
          <label className="text-xs">Base Radius: {tempBaseRadius}px</label>
          <input
            type="range"
            min="10"
            max="300"
            value={tempBaseRadius}
            onChange={handleSliderChange(setBaseRadius, setTempBaseRadius)}
            onMouseUp={handleSliderRelease(setBaseRadius, tempBaseRadius)}
            onTouchEnd={handleSliderRelease(setBaseRadius, tempBaseRadius)}
            className="w-full cursor-pointer h-2"
          />
        </div>
        <div className="mt-2">
          <label className="text-xs">Level Spacing: {tempLevelSpacing}px</label>
          <input
            type="range"
            min="10"
            max="300"
            value={tempLevelSpacing}
            onChange={handleSliderChange(setLevelSpacing, setTempLevelSpacing)}
            onMouseUp={handleSliderRelease(setLevelSpacing, tempLevelSpacing)}
            onTouchEnd={handleSliderRelease(setLevelSpacing, tempLevelSpacing)}
            className="w-full cursor-pointer h-2"
          />
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
      >
        <Background />
        <MiniMap />
        <Controls />
      </ReactFlow>
    </div>
  );
};

export default AgentFlow;
