
/*
Copyright 2025 Cognizant Technology Solutions Corp, www.cognizant.com.

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

import { Position, Node } from "reactflow";

// Define a type for a node with position and dimensions
interface CustomNode extends Node {
  position: { x: number; y: number };
  width: number;
  height: number;
}

// Get the center of a node
function getNodeCenter(node: CustomNode): { x: number; y: number } {
  return {
    x: node.position.x + node.width / 2,
    y: node.position.y + node.height / 2,
  };
}

// Determine the closest handle position based on node proximity
function getParams(nodeA: CustomNode, nodeB: CustomNode): [number, number, Position] {
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
function getHandleCoordsByPosition(node: CustomNode, handlePosition: Position): [number, number] {
  const nodeX = node.position.x;
  const nodeY = node.position.y;
  const nodeWidth = node.width;
  const nodeHeight = node.height;

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
export function getEdgeParams(source: CustomNode, target: CustomNode) {
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
