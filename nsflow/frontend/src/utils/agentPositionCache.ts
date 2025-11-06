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

export interface AgentPosition {
  x: number;
  y: number;
}

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface NetworkPositions {
  [agentId: string]: AgentPosition;
}

export interface NetworkCache {
  positions: NetworkPositions;
  viewport?: ViewportState;
}

export interface PositionCache {
  [networkName: string]: NetworkCache;
}

const CACHE_KEY = 'nsflow_agent_positions';
const CACHE_VERSION = '1.0';
const CACHE_EXPIRY_DAYS = 30;

interface CacheData {
  version: string;
  timestamp: number;
  positions: PositionCache;
}

/**
 * Agent Position Cache Utility
 * 
 * Provides methods to save and load agent positions for different networks
 * to maintain consistent layouts across app reloads.
 */
export class AgentPositionCache {
  private static instance: AgentPositionCache;
  private cache: PositionCache = {};

  private constructor() {
    this.loadFromStorage();
  }

  public static getInstance(): AgentPositionCache {
    if (!AgentPositionCache.instance) {
      AgentPositionCache.instance = new AgentPositionCache();
    }
    return AgentPositionCache.instance;
  }

  /**
   * Load positions from localStorage
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(CACHE_KEY);
      if (!stored) return;

      const data: CacheData = JSON.parse(stored);
      
      // Check version and expiry
      const now = Date.now();
      const expiryTime = data.timestamp + (CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
      
      if (data.version === CACHE_VERSION && now < expiryTime) {
        this.cache = data.positions || {};
      } else {
        // Clear expired or incompatible cache
        localStorage.removeItem(CACHE_KEY);
      }
    } catch (error) {
      console.warn('Failed to load agent position cache:', error);
      localStorage.removeItem(CACHE_KEY);
    }
  }

  /**
   * Save positions to localStorage
   */
  private saveToStorage(): void {
    try {
      const data: CacheData = {
        version: CACHE_VERSION,
        timestamp: Date.now(),
        positions: this.cache
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save agent position cache:', error);
    }
  }

  /**
   * Get cached positions for a network
   */
  public getNetworkPositions(networkName: string): NetworkPositions | null {
    const networkCache = this.cache[networkName];
    return networkCache ? networkCache.positions : null;
  }

  /**
   * Get cached viewport for a network
   */
  public getNetworkViewport(networkName: string): ViewportState | null {
    const networkCache = this.cache[networkName];
    return networkCache?.viewport || null;
  }

  /**
   * Save positions for a network
   */
  public saveNetworkPositions(networkName: string, nodes: Node[]): void {
    if (!networkName || !nodes || nodes.length === 0) return;

    const positions: NetworkPositions = {};
    nodes.forEach(node => {
      if (node.id && node.position) {
        positions[node.id] = {
          x: node.position.x,
          y: node.position.y
        };
      }
    });

    this.cache[networkName] = { positions };
    this.saveToStorage();
  }

  /**
   * Apply cached positions to nodes
   */
  public applyCachedPositions(networkName: string, nodes: Node[]): Node[] {
    const cachedPositions = this.getNetworkPositions(networkName);
    if (!cachedPositions) return nodes;

    return nodes.map(node => {
      const cachedPos = cachedPositions[node.id];
      if (cachedPos) {
        return {
          ...node,
          position: {
            x: cachedPos.x,
            y: cachedPos.y
          }
        };
      }
      return node;
    });
  }

  /**
   * Check if network has cached positions
   */
  public hasNetworkPositions(networkName: string): boolean {
    const networkCache = this.cache[networkName];
    return networkCache && networkCache.positions && Object.keys(networkCache.positions).length > 0;
  }

  /**
   * Clear positions for a specific network
   */
  public clearNetworkPositions(networkName: string): void {
    delete this.cache[networkName];
    this.saveToStorage();
  }

  /**
   * Clear all cached positions
   */
  public clearAllPositions(): void {
    this.cache = {};
    localStorage.removeItem(CACHE_KEY);
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { networks: number; totalAgents: number } {
    const networks = Object.keys(this.cache).length;
    const totalAgents = Object.values(this.cache).reduce(
      (sum, networkCache) => sum + Object.keys(networkCache.positions || {}).length, 
      0
    );
    return { networks, totalAgents };
  }
}

/**
 * Convenience function to get the singleton instance
 */
export const getPositionCache = (): AgentPositionCache => {
  return AgentPositionCache.getInstance();
};
