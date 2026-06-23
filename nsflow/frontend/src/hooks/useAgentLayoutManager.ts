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

import { useCallback, useMemo } from "react";
import { Node, Edge, NodeChange } from "reactflow";
import { createLayoutManager } from "../utils/agentLayoutManager";

interface UseAgentLayoutManagerProps {
  selectedNetwork: string | null;
  baseRadius: number;
  levelSpacing: number;
  onNodesChange: (changes: NodeChange[]) => void;
  setNodes: (nodes: Node[] | ((nodes: Node[]) => Node[])) => void;
  enableDragging?: boolean;
}

/**
 * Hook to manage agent flow layout positioning and persistence
 */
export const useAgentLayoutManager = ({
  selectedNetwork,
  baseRadius,
  levelSpacing,
  onNodesChange,
  setNodes,
  enableDragging = true,
}: UseAgentLayoutManagerProps) => {
  // Create layout manager
  const layoutManager = useMemo(() => {
    return selectedNetwork
      ? createLayoutManager(selectedNetwork, { baseRadius, levelSpacing })
      : null;
  }, [selectedNetwork, baseRadius, levelSpacing]);

  // Apply layout to nodes
  const applyLayout = useCallback(
    (nodes: Node[], edges: Edge[]) => {
      if (!layoutManager || nodes.length === 0) {
        return nodes;
      }

      try {
        const layoutResult = layoutManager.applyLayout(nodes, edges);
        return layoutResult.nodes as Node[];
      } catch (error) {
        console.warn("[useAgentLayoutManager] applyLayout failed:", error);
        return nodes;
      }
    },
    [layoutManager]
  );

  // Force layout (re-arrange all nodes)
  const forceLayout = useCallback(
    (nodes: Node[], edges: Edge[]) => {
      if (!layoutManager || nodes.length === 0) {
        return nodes;
      }

      try {
        const { nodes: laidOut } = layoutManager.forceLayout(nodes, edges);
        const finalNodes = laidOut as Node[];
        // Persist immediately so the view sticks next load
        layoutManager.savePositions(finalNodes);
        return finalNodes;
      } catch (error) {
        console.warn("[useAgentLayoutManager] forceLayout failed:", error);
        return nodes;
      }
    },
    [layoutManager]
  );

  // Handle node position changes with persistence
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (!enableDragging) {
        // Filter out position changes if dragging is disabled
        const filteredChanges = changes.filter(
          (c) => c.type !== "position" || !("dragging" in c) || c.dragging === undefined
        );
        onNodesChange(filteredChanges);
        return;
      }

      onNodesChange(changes);

      // Detect drag end and save positions
      const ended = changes.some(
        (c) => c.type === "position" && "dragging" in c && c.dragging === false
      );

      if (ended && layoutManager) {
        setTimeout(() => {
          setNodes((currentNodes) => {
            try {
              layoutManager.savePositions(currentNodes);
            } catch (error) {
              console.warn("[useAgentLayoutManager] savePositions failed:", error);
            }
            return currentNodes;
          });
        }, 400);
      }
    },
    [enableDragging, onNodesChange, layoutManager, setNodes]
  );

  return {
    layoutManager,
    applyLayout,
    forceLayout,
    handleNodesChange,
  };
};

