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
import EditableAgentNode from "./EditableAgentNode";
import FloatingEdge from "./FloatingEdge";
import AgentContextMenu from "./AgentContextMenu";
import { useApiPort } from "../context/ApiPortContext";

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

const EditorAgentFlow = ({ selectedNetwork }: { selectedNetwork: string }) => {
  const { apiUrl } = useApiPort();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { fitView } = useReactFlow();
  
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
    if (!selectedNetwork || !apiUrl) return;

    try {
      const response = await fetch(`${apiUrl}/api/v1/editor/state/connectivity/${selectedNetwork}`);
      
      if (!response.ok) {
        console.error(`Failed to fetch network data: ${response.statusText}`);
        return;
      }

      const data: StateConnectivityResponse = await response.json();
      
      // Transform nodes to include selection state
      const transformedNodes = data.nodes.map((node: Node) => ({
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
          stroke: "#64748b",
          strokeWidth: 2,
        },
        type: "floating",
      }));

      setNodes(transformedNodes);
      setEdges(transformedEdges);

      // Auto-fit view after loading
      setTimeout(() => {
        fitView({ padding: 0.1, duration: 800 });
      }, 100);

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
          stroke: "#64748b",
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

  // Context menu actions
  const handleEditAgent = (nodeId: string) => {
    console.log("Edit agent:", nodeId);
    // TODO: Open edit dialog
    setContextMenu({ visible: false, x: 0, y: 0, nodeId: "" });
  };

  const handleDeleteAgent = (nodeId: string) => {
    console.log("Delete agent:", nodeId);
    // Remove node and connected edges
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setContextMenu({ visible: false, x: 0, y: 0, nodeId: "" });
    setSelectedNodeId("");
  };

  const handleAddAgent = (x: number, y: number) => {
    console.log("Add agent at:", x, y);
    // TODO: Open add agent dialog
    setContextMenu({ visible: false, x: 0, y: 0, nodeId: "" });
  };

  // Load data when network changes
  useEffect(() => {
    if (selectedNetwork) {
      fetchNetworkData();
    } else {
      setNodes([]);
      setEdges([]);
    }
  }, [selectedNetwork]);

  return (
    <div className="h-full bg-gray-900 relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
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
        <Background color="#374151" />
        <Controls 
          position="top-right"
          className="bg-gray-800 border border-gray-600"
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
        onAdd={handleAddAgent}
        onClose={() => setContextMenu({ visible: false, x: 0, y: 0, nodeId: "" })}
      />

      {/* Network Info Panel */}
      {selectedNetwork && (
        <div className="absolute top-4 left-4 bg-gray-800 border border-gray-600 rounded-lg p-3 text-white text-sm shadow-lg">
          <h3 className="font-semibold mb-1">Editing: {selectedNetwork}</h3>
          <div className="text-gray-300">
            <div>Nodes: {nodes.length}</div>
            <div>Edges: {edges.length}</div>
            {selectedNodeId && (
              <div className="mt-2 pt-2 border-t border-gray-600">
                Selected: {selectedNodeId}
              </div>
            )}
          </div>
        </div>
      )}

      {!selectedNetwork && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-gray-400 text-lg">
            Select a network from the sidebar to start editing
          </div>
        </div>
      )}
    </div>
  );
};

export default EditorAgentFlow;
