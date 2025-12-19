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

import { useEffect } from "react";
import { Node, Edge, EdgeMarkerType, FitViewOptions } from "reactflow";

interface UseAgentFlowDataProps {
  selectedNetwork: string | null;
  apiUrl: string;
  useCompactMode?: boolean;
  applyLayout: (nodes: Node[], edges: Edge[]) => Node[];
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  fitView: (options?: FitViewOptions) => void;
  setViewport: (viewport: { x: number; y: number; zoom: number }, options?: { duration: number }) => void;
  viewportConfig?: {
    x: number;
    y: number;
    zoom: number;
    duration: number;
    padding?: number;
    fitViewDuration?: number;
  };
}

/**
 * Hook to fetch and manage agent flow network data
 * Handles API calls, edge transformation, and layout application
 */
export const useAgentFlowData = ({
  selectedNetwork,
  apiUrl,
  useCompactMode = true,
  applyLayout,
  setNodes,
  setEdges,
  fitView,
  setViewport,
  viewportConfig = {
    x: 0,
    y: 0,
    zoom: 0.5,
    duration: 800,
    padding: 0.2,
    fitViewDuration: 800,
  },
}: UseAgentFlowDataProps) => {
  useEffect(() => {
    if (!selectedNetwork) return;

    const endpoint = useCompactMode ? "connectivity" : "compact_connectivity";

    fetch(`${apiUrl}/api/v1/${endpoint}/${selectedNetwork}`)
      .then((res) => res.json())
      .then((data) => {
        // Transform edges with floating type and animation
        const transformedEdges: Edge[] = (data.edges as Edge[]).map((edge) => ({
          ...edge,
          type: "floating",
          animated: true,
          markerEnd: "arrowclosed" as EdgeMarkerType,
        }));

        // Get raw nodes from API
        const rawNodes: Node[] = data.nodes as Node[];

        // Apply layout (handles caching and positioning)
        const finalNodes = applyLayout(rawNodes, transformedEdges);

        setNodes(finalNodes);
        setEdges(transformedEdges);

        // Fit view with optional padding
        if (viewportConfig.padding !== undefined) {
          setTimeout(() => {
            fitView({ padding: viewportConfig.padding, duration: viewportConfig.fitViewDuration });
          }, 300);
        } else {
          fitView();
        }

        // Set viewport with animation
        setTimeout(() => {
          setViewport(
            { x: viewportConfig.x, y: viewportConfig.y, zoom: viewportConfig.zoom },
            { duration: viewportConfig.duration }
          );
        }, 100);
      })
      .catch((err) => console.error("[useAgentFlowData] Error loading network:", err));
  }, [
    selectedNetwork,
    apiUrl,
    useCompactMode,
    applyLayout,
    setNodes,
    setEdges,
    fitView,
    setViewport,
    viewportConfig.x,
    viewportConfig.y,
    viewportConfig.zoom,
    viewportConfig.duration,
    viewportConfig.padding,
    viewportConfig.fitViewDuration,
  ]);
};

