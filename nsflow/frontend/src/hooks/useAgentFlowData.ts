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
import { Node, Edge, EdgeMarkerType, FitViewOptions, useStore } from "reactflow";

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
  const containerWidth = useStore((s) => s.width);
  const containerHeight = useStore((s) => s.height);
  const containerReady = containerWidth > 0 && containerHeight > 0;

  useEffect(() => {
    if (!selectedNetwork) return;
    if (!containerReady) return;

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const endpoint = useCompactMode ? "connectivity" : "compact_connectivity";

    fetch(`${apiUrl}/api/v1/${endpoint}/${selectedNetwork}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;

        const rawEdges = Array.isArray(data?.edges) ? (data.edges as Edge[]) : [];
        const rawNodes = Array.isArray(data?.nodes) ? (data.nodes as Node[]) : [];

        if (rawNodes.length === 0) return;

        const transformedEdges: Edge[] = rawEdges.map((edge) => ({
          ...edge,
          type: "floating",
          animated: true,
          markerEnd: "arrowclosed" as EdgeMarkerType,
        }));

        const finalNodes = applyLayout(rawNodes, transformedEdges).map((node) => {
          const px = node.position?.x;
          const py = node.position?.y;
          if (Number.isFinite(px) && Number.isFinite(py)) return node;
          return {
            ...node,
            position: {
              x: Number.isFinite(px) ? px : 0,
              y: Number.isFinite(py) ? py : 0,
            },
          };
        });

        setNodes(finalNodes);
        setEdges(transformedEdges);

        const { x, y, zoom, duration, padding, fitViewDuration } = viewportConfig;
        const targetFinite = Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(zoom);

        timers.push(
          setTimeout(() => {
            if (cancelled) return;
            // Safe to animate: containerReady gates this effect, so the ReactFlow
            // container is measured before fitView/setViewport run (no NaN viewport).
            if (padding !== undefined) {
              fitView({ padding, duration: fitViewDuration });
            } else {
              fitView();
            }

            if (!targetFinite) return;

            timers.push(
              setTimeout(() => {
                if (cancelled) return;
                setViewport({ x, y, zoom }, { duration });
              }, (fitViewDuration ?? 0) + 50)
            );
          }, 300)
        );
      })
      .catch((err) => console.error("[useAgentFlowData] Error loading network:", err));

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [
    selectedNetwork,
    apiUrl,
    useCompactMode,
    applyLayout,
    setNodes,
    setEdges,
    fitView,
    setViewport,
    containerReady,
    viewportConfig.x,
    viewportConfig.y,
    viewportConfig.zoom,
    viewportConfig.duration,
    viewportConfig.padding,
    viewportConfig.fitViewDuration,
  ]);
};

