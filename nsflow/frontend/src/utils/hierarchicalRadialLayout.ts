
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

import { Node } from "reactflow";

export interface ExtendedNode extends Node {
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

interface AngleRange {
  start: number;
  end: number;
}

export function hierarchicalRadialLayout(
  nodes: any[],
  edges: any[],
  BASE_RADIUS: number,
  LEVEL_SPACING: number
): { nodes: ExtendedNode[]; edges: any[] } {
  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    console.error("Invalid nodes or edges:", nodes, edges);
    return { nodes: [], edges: [] };
  }

  // Compute max node size for spacing
  const nodeDimensions = nodes.map((node) => ({
    width: node.style?.width || 100,
    height: node.style?.height || 50,
  }));

  const NODE_SIZE = Math.max(
    ...nodeDimensions.map((n) => n.width),
    ...nodeDimensions.map((n) => n.height)
  );

  const PADDING = NODE_SIZE * 0.4;

  const rootNode = nodes.find((node) => !edges.some((edge) => edge.target === node.id));
  if (!rootNode) {
    console.error("No root node found!");
    return { nodes, edges };
  }

  const nodeMap = new Map<string, ExtendedNode>(
    nodes.map((node: any) => [
      node.id,
      {
        ...node,
        children: [],
        depth: -1,
        position: { x: 0, y: 0 },
      } as ExtendedNode,
    ])
  );

  // Assign parent-child relationships
  edges.forEach(({ source, target }: { source: string; target: string }) => {
    const parentNode = nodeMap.get(source);
    const childNode = nodeMap.get(target);
    if (parentNode && childNode) {
      childNode.parent = parentNode;
      parentNode.children.push(childNode);
    }
  });

  const setDepth = (node: ExtendedNode, depth: number = 0): void => {
    node.depth = depth;
    node.children.forEach((child) => setDepth(child, depth + 1));
  };

  setDepth(nodeMap.get(rootNode.id)!);

  const levelMap = new Map<number, ExtendedNode[]>();
  Array.from(nodeMap.values()).forEach((node) => {
    if (!levelMap.has(node.depth)) levelMap.set(node.depth, []);
    levelMap.get(node.depth)!.push(node);
  });

  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  const root = nodeMap.get(rootNode.id)!;
  root.position = { x: centerX, y: centerY };

  // Recursive placement with angular range tracking
  const placeChildren = (
    node: ExtendedNode,
    level: number,
    angleRange: AngleRange
  ) => {
    const children = node.children;
    if (!children.length) return;

    const angleStep = (angleRange.end - angleRange.start) / children.length;
    let currentAngle = angleRange.start;

    children.forEach((child) => {
      const childAngle = currentAngle + angleStep / 2;
      const radius = 4 * BASE_RADIUS + level * (LEVEL_SPACING + NODE_SIZE + PADDING);
      const rad = (childAngle * Math.PI) / 180;

      child.position = {
        x: centerX + radius * Math.cos(rad),
        y: centerY + radius * Math.sin(rad),
      };

      // Assign new angular range to each child
      const childRange = {
        start: currentAngle,
        end: currentAngle + angleStep,
      };

      placeChildren(child, level + 1, childRange);
      currentAngle += angleStep;
    });
  };

  placeChildren(root, 1, { start: 0, end: 360 });

  const positionedNodes = Array.from(nodeMap.values());
  const positionedEdges = edges.map((edge) => ({
    ...edge,
    type: "floating",
    animated: true,
    style: { strokeWidth: 2, stroke: "#ffffff" },
  }));

  return { nodes: positionedNodes, edges: positionedEdges };
}
