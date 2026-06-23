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

import { useMemo } from "react";
import { Box, Tooltip, Typography, alpha, useTheme } from "@mui/material";
import { TraceStep } from "../../context/TraceContext";
import { formatDuration } from "./traceTree";
import { styleFor } from "./traceKinds";
import { GANTT_LABEL_COL as LABEL_COL, GANTT_ROW_HEIGHT as ROW_HEIGHT } from "./traceConstants";

type Props = {
  steps: TraceStep[];
  earliestStartS: number;
  latestEndS: number;
  selectedKey?: string | null;
  onSelect?: (step: TraceStep) => void;
};

const TraceGanttView = ({ steps, earliestStartS, latestEndS, selectedKey, onSelect }: Props) => {
  const theme = useTheme();

  const rows = useMemo(() => {
    return steps
      .map((step, idx) => ({ step, idx, key: step.otrace.join(" / ") + "#" + idx }))
      .sort((a, b) => a.step.start_s - b.step.start_s);
  }, [steps]);

  const windowS = Math.max(latestEndS - earliestStartS, 0.001);

  if (rows.length === 0) {
    return (
      <Box sx={{ p: 3, color: theme.palette.text.secondary }}>
        <Typography variant="body2">
          No trace steps yet. Send a message and the Gantt view will populate.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ overflow: "auto", p: 1, fontSize: 12 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          borderBottom: `1px solid ${theme.palette.divider}`,
          py: 0.5,
          mb: 0.5,
          position: "sticky",
          top: 0,
          backgroundColor: theme.palette.background.paper,
          zIndex: 1,
        }}
      >
        <Box sx={{ width: LABEL_COL, fontWeight: 600 }}>Agent</Box>
        <Box sx={{ flex: 1, position: "relative", height: 16 }}>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <Box
              key={t}
              sx={{
                position: "absolute",
                left: `${t * 100}%`,
                top: 0,
                bottom: 0,
                borderLeft: `1px dashed ${alpha(theme.palette.text.secondary, 0.25)}`,
                pl: 0.5,
                color: theme.palette.text.secondary,
                fontSize: 10,
              }}
            >
              {formatDuration(t * windowS)}
            </Box>
          ))}
        </Box>
      </Box>

      {rows.map(({ step, key }) => {
        const startPct = ((step.start_s - earliestStartS) / windowS) * 100;
        const widthPct = Math.max((step.duration_s / windowS) * 100, 0.5);
        const isSelected = selectedKey === step.otrace.join(" / ");
        const kindStyle = styleFor(step.kind, step.otrace, step.is_network_total);
        return (
          <Box
            key={key}
            onClick={() => onSelect?.(step)}
            sx={{
              display: "flex",
              alignItems: "center",
              height: ROW_HEIGHT,
              cursor: onSelect ? "pointer" : "default",
              borderRadius: 1,
              backgroundColor: isSelected
                ? alpha(theme.palette.primary.main, 0.08)
                : "transparent",
              "&:hover": {
                backgroundColor: alpha(theme.palette.primary.main, 0.05),
              },
            }}
          >
            <Box
              sx={{
                width: LABEL_COL,
                pr: 1,
                pl: `${Math.min(step.depth, 6) * 8}px`,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
                display: "flex",
                alignItems: "center",
                gap: 0.75,
              }}
              title={`${kindStyle.label} — ${step.otrace.join(" / ")}`}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  color: kindStyle.color,
                  flexShrink: 0,
                }}
              >
                {kindStyle.icon}
              </Box>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {step.agent}
              </span>
            </Box>
            <Box sx={{ flex: 1, position: "relative", height: ROW_HEIGHT - 8 }}>
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  borderTop: `1px dashed ${alpha(theme.palette.text.secondary, 0.1)}`,
                }}
              />
              <Tooltip
                title={
                  <Box sx={{ fontSize: 11 }}>
                    <div>
                      [{kindStyle.label}] {step.otrace.join(" / ")}
                    </div>
                    <div>duration: {formatDuration(step.duration_s)}</div>
                    {step.total_tokens ? <div>tokens: {step.total_tokens.toLocaleString()}</div> : null}
                  </Box>
                }
                arrow
              >
                <Box
                  sx={{
                    position: "absolute",
                    left: `${Math.max(startPct, 0)}%`,
                    width: `${Math.min(widthPct, 100 - startPct)}%`,
                    top: 2,
                    bottom: 2,
                    backgroundColor: kindStyle.color,
                    borderRadius: 0.5,
                    minWidth: 2,
                  }}
                />
              </Tooltip>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};

export default TraceGanttView;
