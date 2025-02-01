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
import CustomEdge from "./CustomEdge";

const nodeTypes = { agent: AgentNode };
const edgeTypes = { custom: CustomEdge };

const AgentFlow = ({ selectedNetwork }: { selectedNetwork: string }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (!selectedNetwork) return;

    fetch(`http://127.0.0.1:8000/network/${selectedNetwork}`)
      .then((res) => res.json())
      .then((data) => {
        const { nodes: arrangedNodes, edges: arrangedEdges } = hierarchicalRadialLayout(data.nodes, data.edges);
        setNodes(arrangedNodes);
        setEdges(arrangedEdges);
        fitView();
      })
      .catch((err) => console.error("Error loading network:", err));
  }, [selectedNetwork]);

  const hierarchicalRadialLayout = (nodes, edges) => {
    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
      console.error("Invalid nodes or edges:", nodes, edges);
      return { nodes: [], edges: [] };
    }
  
    console.log("Received nodes and edges:", { nodes, edges });
  
    const rootNode = nodes.find(
      (node) => !edges.some((edge) => edge.target === node.id)
    );
  
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
  
    const positionedNodes = [];
    const levelMap = new Map();
  
    Array.from(nodeMap.values()).forEach((node) => {
      if (!levelMap.has(node.depth)) levelMap.set(node.depth, []);
      levelMap.get(node.depth).push(node);
    });
  
    levelMap.forEach((nodesAtLevel, depth) => {
      const radius = 250 + depth * 200;
      const angleStep = (2 * Math.PI) / nodesAtLevel.length;
  
      nodesAtLevel.forEach((node, index) => {
        const x = window.innerWidth / 2 + radius * Math.cos(index * angleStep);
        const y = window.innerHeight / 2 + radius * Math.sin(index * angleStep);
  
        node.position = {
          x: isNaN(x) ? 0 : x,
          y: isNaN(y) ? 0 : y,
        };
  
        positionedNodes.push(node);
      });
    });
  
    console.log("Final positioned nodes:", positionedNodes.map(n => ({ id: n.id, x: n.position.x, y: n.position.y })));
  
    const positionedEdges = edges.map((edge) => ({
      ...edge,
      type: "custom",
      animated: true,
      style: { strokeWidth: 2, stroke: "#ffffff" },
    }));
  
    return { nodes: positionedNodes, edges: positionedEdges };
  };
  

  return (
    <div className="h-full w-full bg-gray-800 relative">
      <button
        className="absolute top-4 left-4 p-2 bg-blue-600 text-white rounded shadow"
        onClick={() => {
          const { nodes: arrangedNodes, edges: arrangedEdges } = hierarchicalRadialLayout(nodes, edges);
          setNodes(arrangedNodes);
          setEdges(arrangedEdges);
          fitView();
        }}
      >
        Auto Arrange
      </button>

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
