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

import { Node, Edge } from "reactflow";
import { hierarchicalRadialLayout } from "./hierarchicalRadialLayout";
import { getPositionCache } from "./agentPositionCache";

export interface LayoutConfig {
  baseRadius?: number;
  levelSpacing?: number;
  freeAgentSpacing?: number;
  freeAgentStartAngle?: number;
}

const DEFAULT_CONFIG: Required<LayoutConfig> = {
  baseRadius: 150,
  levelSpacing: 200,
  freeAgentSpacing: 100,
  freeAgentStartAngle: 0
};

/**
 * Agent Layout Manager
 * 
 * Provides intelligent layout management for agent networks with:
 * - Hierarchical radial layout for connected components
 * - Circular arrangement for free agents
 * - Position caching for consistent layouts
 * - Automatic fallback strategies
 */
export class AgentLayoutManager {
  private networkName: string;
  private config: Required<LayoutConfig>;
  private positionCache = getPositionCache();

  constructor(networkName: string, config: LayoutConfig = {}) {
    this.networkName = networkName;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Apply layout to nodes and edges with caching support
   */
  public applyLayout(nodes: Node[], edges: Edge[], forceLayout: boolean = false): { nodes: Node[]; edges: Edge[] } {
    if (!nodes || nodes.length === 0) {
      return { nodes: [], edges: [] };
    }

    // Try to use cached positions first (unless forced layout)
    if (!forceLayout && this.positionCache.hasNetworkPositions(this.networkName)) {
      const cachedNodes = this.positionCache.applyCachedPositions(this.networkName, nodes);
      
      // Verify all nodes have valid positions
      const allPositioned = cachedNodes.every(node => 
        node.position && 
        typeof node.position.x === 'number' && 
        typeof node.position.y === 'number' &&
        !isNaN(node.position.x) && 
        !isNaN(node.position.y)
      );

      if (allPositioned) {
        return { nodes: cachedNodes, edges };
      }
    }

    // Apply fresh layout
    const layoutResult = this.calculateLayout(nodes, edges);
    
    // Cache the new positions
    this.positionCache.saveNetworkPositions(this.networkName, layoutResult.nodes);
    
    return layoutResult;
  }

  /**
   * Calculate fresh layout for nodes and edges
   */
  private calculateLayout(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
    // Separate connected and free agents
    const { connectedNodes, freeNodes } = this.separateConnectedAndFreeNodes(nodes, edges);

    let layoutNodes: Node[] = [];

    // Apply hierarchical layout to connected components
    if (connectedNodes.length > 0) {
      const connectedEdges = edges.filter(edge => 
        connectedNodes.some(n => n.id === edge.source) && 
        connectedNodes.some(n => n.id === edge.target)
      );

      if (connectedEdges.length > 0) {
        // Use hierarchical radial layout for connected components
        const hierarchicalResult = hierarchicalRadialLayout(
          connectedNodes,
          connectedEdges,
          this.config.baseRadius,
          this.config.levelSpacing
        );
        layoutNodes.push(...hierarchicalResult.nodes);
      } else {
        // If no edges but multiple nodes, arrange in a circle
        layoutNodes.push(...this.arrangeInCircle(connectedNodes, this.config.baseRadius));
      }
    }

    // Arrange free agents in a separate area
    if (freeNodes.length > 0) {
      const freeAgentNodes = this.arrangeFreeAgents(freeNodes, layoutNodes);
      layoutNodes.push(...freeAgentNodes);
    }

    return { nodes: layoutNodes, edges };
  }

  /**
   * Separate nodes into connected and free agents
   */
  private separateConnectedAndFreeNodes(nodes: Node[], edges: Edge[]): { connectedNodes: Node[]; freeNodes: Node[] } {
    const connectedNodeIds = new Set<string>();
    
    // Mark all nodes that have edges
    edges.forEach(edge => {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    });

    const connectedNodes = nodes.filter(node => connectedNodeIds.has(node.id));
    const freeNodes = nodes.filter(node => !connectedNodeIds.has(node.id));

    return { connectedNodes, freeNodes };
  }

  /**
   * Arrange nodes in a circle
   */
  private arrangeInCircle(nodes: Node[], radius: number): Node[] {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    if (nodes.length === 1) {
      return [{
        ...nodes[0],
        position: { x: centerX, y: centerY }
      }];
    }

    const angleStep = (2 * Math.PI) / nodes.length;
    
    return nodes.map((node, index) => {
      const angle = index * angleStep;
      return {
        ...node,
        position: {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle)
        }
      };
    });
  }

  /**
   * Arrange free agents around the main network
   */
  private arrangeFreeAgents(freeNodes: Node[], existingNodes: Node[]): Node[] {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    // Calculate bounding box of existing nodes
    let minX = centerX, maxX = centerX, minY = centerY, maxY = centerY;
    
    if (existingNodes.length > 0) {
      existingNodes.forEach(node => {
        if (node.position) {
          minX = Math.min(minX, node.position.x);
          maxX = Math.max(maxX, node.position.x);
          minY = Math.min(minY, node.position.y);
          maxY = Math.max(maxY, node.position.y);
        }
      });
    }

    // Calculate radius for free agents (outside the main network)
    const networkRadius = Math.max(
      Math.abs(maxX - centerX),
      Math.abs(minX - centerX),
      Math.abs(maxY - centerY),
      Math.abs(minY - centerY)
    );

    const freeAgentRadius = networkRadius + this.config.freeAgentSpacing + 100;
    const angleStep = (2 * Math.PI) / Math.max(freeNodes.length, 8); // Minimum 8 positions for spacing

    return freeNodes.map((node, index) => {
      const angle = this.config.freeAgentStartAngle + (index * angleStep);
      return {
        ...node,
        position: {
          x: centerX + freeAgentRadius * Math.cos(angle),
          y: centerY + freeAgentRadius * Math.sin(angle)
        }
      };
    });
  }

  /**
   * Force a fresh layout calculation
   */
  public forceLayout(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
    return this.applyLayout(nodes, edges, true);
  }

  /**
   * Save current positions to cache
   */
  public savePositions(nodes: Node[]): void {
    this.positionCache.saveNetworkPositions(this.networkName, nodes);
  }

  /**
   * Clear cached positions for this network
   */
  public clearCache(): void {
    this.positionCache.clearNetworkPositions(this.networkName);
  }

  /**
   * Check if network has cached positions
   */
  public hasCachedPositions(): boolean {
    return this.positionCache.hasNetworkPositions(this.networkName);
  }
}

/**
 * Convenience function to create a layout manager
 */
export const createLayoutManager = (networkName: string, config?: LayoutConfig): AgentLayoutManager => {
  return new AgentLayoutManager(networkName, config);
};
