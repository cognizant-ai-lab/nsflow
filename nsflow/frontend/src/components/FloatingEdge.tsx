
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

import { memo } from "react";
import { getBezierPath, useStore, EdgeProps, Node, ReactFlowState } from "reactflow";
import { useTheme } from "@mui/material/styles";
import { getEdgeParams } from "../utils/utils";

// Define a type for the node with required properties
interface CustomNode extends Node {
  width: number;
  height: number;
}

// Explicitly type the FloatingEdge component using ReactFlow's EdgeProps
const FloatingEdge: React.FC<EdgeProps> = ({ id, source, target, markerEnd, style }) => {
  const theme = useTheme();

  // Look the two endpoints up directly from the store's node map (O(1) each) rather
  // than useNodes() + Array.find() (O(N) each, O(N*E) across all edges per render).
  // This is the single biggest cost for large graphs on every highlight/drag tick.
  const sourceNode = useStore((s: ReactFlowState) => s.nodeInternals.get(source)) as CustomNode | undefined;
  const targetNode = useStore((s: ReactFlowState) => s.nodeInternals.get(target)) as CustomNode | undefined;

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
      stroke={theme.palette.text.secondary}
      markerEnd={markerEnd}
      style={{
        ...style,
        stroke: style?.stroke || theme.palette.text.primary,
        strokeWidth: 3,
      }}
    />
  );
};

export default memo(FloatingEdge);
