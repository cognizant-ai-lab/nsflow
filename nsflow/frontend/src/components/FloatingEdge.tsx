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
import { getBezierPath, useStore, EdgeProps, ReactFlowState } from "@xyflow/react";
import { useTheme } from "@mui/material/styles";
import { getEdgeParams, MeasuredNode } from "../utils/utils";

/** Half-length of the bar drawn at the source end, in flow units. */
const SOURCE_BAR_HALF_LENGTH = 9;
/** Radius of the grab notch drawn at the middle of the edge. */
const NOTCH_RADIUS = 5;

const FloatingEdge: React.FC<EdgeProps> = ({ id, source, target, markerEnd, style, selected }) => {
  const theme = useTheme();

  // Look the two endpoints up directly from the store's node map (O(1) each) rather
  // than useNodes() + Array.find() (O(N) each, O(N*E) across all edges per render).
  // This is the single biggest cost for large graphs on every highlight/drag tick.
  // (@xyflow/react 12 renamed this map from `nodeInternals` to `nodeLookup`.)
  const sourceNode = useStore((s: ReactFlowState) => s.nodeLookup.get(source)) as MeasuredNode | undefined;
  const targetNode = useStore((s: ReactFlowState) => s.nodeLookup.get(target)) as MeasuredNode | undefined;

  if (!sourceNode || !targetNode) {
    return null;
  }

  // Get correct edge parameters
  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode);

  // labelX/labelY are the curve's midpoint, which is where the notch goes.
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetPosition: targetPos,
    targetX: tx,
    targetY: ty,
  });

  const stroke = selected ? theme.palette.primary.main : style?.stroke || theme.palette.text.primary;
  const strokeWidth = selected ? 5 : 3;

  // A bar across the source end and an arrow at the target end, so the direction of
  // the chain is readable without following the curve. The bar is drawn
  // perpendicular to the line leaving the source rather than using a marker, because
  // neuro-san's flow direction is the point and xyflow only ships arrow markers.
  const angle = Math.atan2(ty - sy, tx - sx);
  const barDx = Math.sin(angle) * SOURCE_BAR_HALF_LENGTH;
  const barDy = Math.cos(angle) * SOURCE_BAR_HALF_LENGTH;

  return (
    <g>
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke,
          strokeWidth,
        }}
      />

      {/*
        Decorations only. pointer-events stays off so every click and right-click
        falls through to the wide transparent interaction path xyflow renders behind
        the edge, which is what fires onEdgeClick and onEdgeContextMenu. Without
        that, the notch would swallow the very interaction it advertises.
      */}
      <line
        x1={sx - barDx}
        y1={sy + barDy}
        x2={sx + barDx}
        y2={sy - barDy}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        style={{ pointerEvents: "none" }}
      />
      <circle
        cx={labelX}
        cy={labelY}
        r={selected ? NOTCH_RADIUS + 2 : NOTCH_RADIUS}
        fill={selected ? theme.palette.primary.main : theme.palette.background.paper}
        stroke={stroke}
        strokeWidth={2}
        style={{ pointerEvents: "none" }}
      />
    </g>
  );
};

export default memo(FloatingEdge);
