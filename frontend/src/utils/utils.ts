import { Position } from "reactflow";

// Get the center of a node
function getNodeCenter(node) {
  return {
    x: node.position.x + node.width / 2,
    y: node.position.y + node.height / 2,
  };
}

// Determine the closest handle position based on node proximity
function getParams(nodeA, nodeB) {
  const centerA = getNodeCenter(nodeA);
  const centerB = getNodeCenter(nodeB);

  const horizontalDiff = Math.abs(centerA.x - centerB.x);
  const verticalDiff = Math.abs(centerA.y - centerB.y);

  let position;

  if (horizontalDiff > verticalDiff) {
    position = centerA.x > centerB.x ? Position.Left : Position.Right;
  } else {
    position = centerA.y > centerB.y ? Position.Top : Position.Bottom;
  }

  return [...getHandleCoordsByPosition(nodeA, position), position];
}

// Get handle coordinates dynamically based on node size
function getHandleCoordsByPosition(node, handlePosition) {
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
export function getEdgeParams(source, target) {
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
