
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
import { getBezierPath, useNodes, EdgeProps, Node } from "reactflow";
import { getEdgeParams } from "../utils/utils";

// Define a type for the node with required properties
interface CustomNode extends Node {
  width: number;
  height: number;
}

// Explicitly type the FloatingEdge component using ReactFlow's EdgeProps
const FloatingEdge: React.FC<EdgeProps> = ({ id, source, target, markerEnd, style }) => {
  const nodes = useNodes();

  // Ensure we correctly type sourceNode and targetNode
  const sourceNode = nodes.find((node) => node.id === source) as CustomNode | undefined;
  const targetNode = nodes.find((node) => node.id === target) as CustomNode | undefined;

  if (!sourceNode || !targetNode) {
    return null;
  }

  // Get correct edge parameters
  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode);

  // Generate the bezier path for a smooth curve
  const [edgePath] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetPosition: targetPos,
    targetX: tx,
    targetY: ty,
  });

  return (
    <path
      id={id}
      className="react-flow__edge-path"
      d={edgePath}
      strokeWidth={2}
      stroke="white"
      markerEnd={markerEnd}
      style={style}
    />
  );
};

export default FloatingEdge;
