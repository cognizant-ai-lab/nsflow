
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

import { Position, Node } from "@xyflow/react";

// A node as it comes out of the React Flow store. @xyflow/react 12 moved the
// rendered dimensions from `width`/`height` onto `measured`, so read that first
// and fall back to the user-set props for nodes that were given explicit sizes.
export type MeasuredNode = Node & {
  measured?: { width?: number; height?: number };
};

function getNodeSize(node: MeasuredNode): { width: number; height: number } {
  return {
    width: node.measured?.width ?? node.width ?? 0,
    height: node.measured?.height ?? node.height ?? 0,
  };
}

// Get the center of a node
function getNodeCenter(node: MeasuredNode): { x: number; y: number } {
  const { width, height } = getNodeSize(node);
  return {
    x: node.position.x + width / 2,
    y: node.position.y + height / 2,
  };
}

// Determine the closest handle position based on node proximity
function getParams(nodeA: MeasuredNode, nodeB: MeasuredNode): [number, number, Position] {
  const centerA = getNodeCenter(nodeA);
  const centerB = getNodeCenter(nodeB);

  const horizontalDiff = Math.abs(centerA.x - centerB.x);
  const verticalDiff = Math.abs(centerA.y - centerB.y);

  let position: Position;

  if (horizontalDiff > verticalDiff) {
    position = centerA.x > centerB.x ? Position.Left : Position.Right;
  } else {
    position = centerA.y > centerB.y ? Position.Top : Position.Bottom;
  }

  return [...getHandleCoordsByPosition(nodeA, position), position];
}

// Get handle coordinates dynamically based on node size
function getHandleCoordsByPosition(node: MeasuredNode, handlePosition: Position): [number, number] {
  const nodeX = node.position.x;
  const nodeY = node.position.y;
  const { width: nodeWidth, height: nodeHeight } = getNodeSize(node);

  let x = nodeX;
  let y = nodeY;

  switch (handlePosition) {
    case Position.Left:
      x = nodeX;
      y = nodeY + nodeHeight / 2;
      break;
    case Position.Right:
      x = nodeX + nodeWidth;
      y = nodeY + nodeHeight / 2;
      break;
    case Position.Top:
      x = nodeX + nodeWidth / 2;
      y = nodeY;
      break;
    case Position.Bottom:
      x = nodeX + nodeWidth / 2;
      y = nodeY + nodeHeight;
      break;
  }

  return [x, y];
}

// Get edge params for dynamic edge placement
export function getEdgeParams(source: MeasuredNode, target: MeasuredNode) {
  const [sx, sy, sourcePos] = getParams(source, target);
  const [tx, ty, targetPos] = getParams(target, source);

  return {
    sx,
    sy,
    tx,
    ty,
    sourcePos,
    targetPos,
  };
}
