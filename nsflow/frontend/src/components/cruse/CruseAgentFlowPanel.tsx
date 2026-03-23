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

import { useRef, useState, useEffect } from "react";
import { Box, Typography, useTheme } from "@mui/material";
import { ReactFlowProvider } from "reactflow";
import AgentFlow from "../AgentFlow";

const INTERNAL_WIDTH = 750;
const INTERNAL_HEIGHT = 680;

interface CruseAgentFlowPanelProps {
  network: string;
}

const CruseAgentFlowPanel: React.FC<CruseAgentFlowPanelProps> = ({ network }) => {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.62);

  // Compute scale from container size
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setScale(Math.min(width / INTERNAL_WIDTH, height / INTERNAL_HEIGHT));
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (!network) {
    return (
      <Box sx={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Typography variant="body2" sx={{ color: theme.palette.text.secondary, fontSize: '0.8rem' }}>
          Select an agent to view the network flow
        </Typography>
      </Box>
    );
  }

  return (
    <ReactFlowProvider>
      <Box ref={containerRef} sx={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
      }}>
        <Box sx={{
          width: INTERNAL_WIDTH,
          height: INTERNAL_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          // Hide AgentFlow overlay controls
          '& > div > div[style*="position"]': {
            // Fallback: hide via more specific targeting below
          },
          // Hide top-left controls (Auto Arrange, Reset buttons)
          '& > div > div:first-of-type > div:first-of-type': {
            display: 'none !important',
          },
          // Hide top-right Layout controls Paper
          '& > div > div:first-of-type > .MuiPaper-root': {
            display: 'none !important',
          },
          // Hide ReactFlow zoom/fit controls
          '& .react-flow__controls': {
            display: 'none !important',
          },
        }}>
          <AgentFlow selectedNetwork={network} />
        </Box>
      </Box>
    </ReactFlowProvider>
  );
};

export default CruseAgentFlowPanel;
