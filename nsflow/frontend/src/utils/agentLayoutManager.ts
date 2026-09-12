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

import { Node, Edge } from "@xyflow/react";
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

    // Try to use cached positions first (unless forced layout).
    //
    // Every node must actually BE in the cache, not merely end up with numbers in
    // its position. applyCachedPositions returns an uncached node untouched, and
    // callers hand in placeholder coordinates, so checking the resulting position
    // (as this did) treats a node the cache has never seen as already laid out: a
    // newly added agent kept its placeholder and rendered stacked on top of another
    // node, looking as though the edit had not applied at all. It only appeared
    // after a reload, which happens to trigger a forced re-layout.
    //
    // A missing node means the graph has changed shape, so the whole thing is laid
    // out again. That does discard manual drags when an agent is added or removed,
    // which is the same thing the "Reorganize Layout" button does, and is much
    // better than the new agent being invisible.
    if (!forceLayout) {
      const cachedPositions = this.positionCache.getNetworkPositions(this.networkName);
      const everyNodeCached =
        Boolean(cachedPositions) && nodes.every((node) => Boolean(cachedPositions?.[node.id]));

      if (everyNodeCached) {
        return { nodes: this.positionCache.applyCachedPositions(this.networkName, nodes), edges };
      }
    }

    // Apply fresh layout
    const layoutResult = this.calculateLayout(nodes, edges);
    const spread = { nodes: AgentLayoutManager.separateOverlaps(layoutResult.nodes), edges: layoutResult.edges };

    // Cache the positions actually used, so the nudge is applied once and then
    // stays put rather than being recomputed differently on the next render.
    this.positionCache.saveNetworkPositions(this.networkName, spread.nodes);

    return spread;
  }

  /**
   * Nudge apart any nodes the layout put on the same spot.
   *
   * A safety net rather than the mechanism: the hierarchical layout normally spaces
   * nodes properly, but a degenerate case (one agent under a parent that already has
   * a child at that angle, or two free agents at the same index) can collide, and two
   * nodes on the same coordinate look like one node and a missing one.
   *
   * The offset walks a fixed spiral rather than being random, so the same graph
   * always lays out identically and the canvas does not shuffle on re-render.
   *
   * Public only so it can be tested directly: the layouts it guards against are hard
   * to provoke through applyLayout, which is the point of it being a safety net.
   */
  public static separateOverlaps(nodes: Node[]): Node[] {
    // Node cards are wider than they are tall, so a collision is judged on both axes
    // at roughly card size.
    const MIN_GAP = 60;
    const STEP = MIN_GAP;

    const placed: { x: number; y: number }[] = [];
    const collides = (x: number, y: number): boolean =>
      placed.some((seen) => Math.abs(seen.x - x) < MIN_GAP && Math.abs(seen.y - y) < MIN_GAP);

    return nodes.map((node) => {
      let { x, y } = node.position;
      // Bounded so a pathological graph cannot spin here; after this many tries the
      // node is left where it is, which is no worse than before.
      for (let attempt = 1; collides(x, y) && attempt <= 64; attempt += 1) {
        const ring = Math.ceil(attempt / 8);
        const angle = ((attempt % 8) * Math.PI) / 4;
        x = node.position.x + Math.round(Math.cos(angle) * STEP * ring);
        y = node.position.y + Math.round(Math.sin(angle) * STEP * ring);
      }
      placed.push({ x, y });
      return x === node.position.x && y === node.position.y ? node : { ...node, position: { x, y } };
    });
  }

  /**
   * Calculate fresh layout for nodes and edges
   */
  private calculateLayout(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
    // Separate connected and free agents
    const { connectedNodes, freeNodes } = this.separateConnectedAndFreeNodes(nodes, edges);

    const layoutNodes: Node[] = [];

    // Apply hierarchical layout to connected components
    if (connectedNodes.length > 0) {
      // Membership test via a Set is O(1); the previous .some() inside .filter()
      // was O(E*N) and dominated layout time for large graphs.
      const connectedNodeIds = new Set(connectedNodes.map((n) => n.id));
      const connectedEdges = edges.filter(
        (edge) => connectedNodeIds.has(edge.source) && connectedNodeIds.has(edge.target)
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
