import { Node, Edge } from "reactflow";

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

  // Calculate maximum node size
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

  edges.forEach(({ source, target }: { source: string; target: string }) => {
    if (nodeMap.has(target) && nodeMap.has(source)) {
      const parentNode = nodeMap.get(source)!;
      const childNode = nodeMap.get(target)!;
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

  nodeMap.get(rootNode.id)!.position = { x: centerX, y: centerY };

  levelMap.forEach((nodesAtLevel, depth) => {
    if (depth === 0) return;

    const parentNodes = levelMap.get(depth - 1) || [];
    const angleStep = (2 * Math.PI) / Math.max(nodesAtLevel.length, 3);

    nodesAtLevel.forEach((node: ExtendedNode, index: number) => {
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
}
