/*
Copyright © 2025-2026 Cognizant Technology Solutions Corp, www.cognizant.com.

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

import { Box, Typography, alpha, useTheme } from "@mui/material";

import type { ConsultantProgressEntry } from "../../types/networkConsultant";

const PASS_THRESHOLD = 0.8;
const CHART_HEIGHT = 190;
const CHART_TOP = 38;
const CHART_BOTTOM = CHART_TOP + CHART_HEIGHT;
const LEFT_MARGIN = 42;
const RIGHT_MARGIN = 20;
const BAR_SLOT_WIDTH = 92;
const BAR_WIDTH = 44;

const entryLabel = (entry: ConsultantProgressEntry, index: number): string => {
  if (entry.checkpoint === "before") return "Before";
  if (entry.checkpoint === "after") return "After";
  if (entry.checkpoint === "generated") return "Test run";
  return String(entry.improvement_iteration ?? entry.check ?? index + 1);
};

const normalizedSegments = (entry: ConsultantProgressEntry): number[] => {
  const passed = Math.max(entry.passed, 0);
  if (entry.checkpoint !== "iteration" || !entry.segments) return [passed];
  let remaining = passed;
  const segments = entry.segments.map((value) => {
    const segment = Math.min(Math.max(value, 0), remaining);
    remaining -= segment;
    return segment;
  });
  if (remaining > 0) segments.push(remaining);
  return segments.length > 0 ? segments : [0];
};

const ConsultantProgressChart = ({ progress }: { progress: ConsultantProgressEntry[] }) => {
  const theme = useTheme();
  const maxTotal = Math.max(...progress.flatMap((entry) => [entry.total, entry.passed]), 1);
  const width = Math.max(480, LEFT_MARGIN + RIGHT_MARGIN + progress.length * BAR_SLOT_WIDTH);
  const chartColor = theme.palette.info.main;
  const iterationColors = [
    chartColor,
    alpha(chartColor, 0.82),
    alpha(chartColor, 0.64),
    alpha(chartColor, 0.46),
  ];
  const yPosition = (value: number) => CHART_BOTTOM - (Math.max(value, 0) / maxTotal) * CHART_HEIGHT;
  const tickValues = [...new Set([0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(maxTotal * ratio)))];

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, color: theme.palette.text.primary, mb: 1 }}>
        Tests Passing Per Iteration
      </Typography>
      <Box sx={{ width: "100%", overflowX: "auto" }}>
        <svg
          role="img"
          aria-label="Tests passing per improvement iteration"
          viewBox={`0 0 ${width} 270`}
          style={{ display: "block", minWidth: Math.min(width, 640), width: "100%" }}
        >
          {tickValues.map((value) => {
            const y = yPosition(value);
            return (
              <g key={value}>
                <line
                  x1={LEFT_MARGIN}
                  x2={width - RIGHT_MARGIN}
                  y1={y}
                  y2={y}
                  stroke={theme.palette.divider}
                  strokeWidth="1"
                />
                <text x={LEFT_MARGIN - 8} y={y + 4} textAnchor="end" fill={theme.palette.text.secondary} fontSize="11">
                  {value}
                </text>
              </g>
            );
          })}

          {progress.map((entry, index) => {
            const x = LEFT_MARGIN + index * BAR_SLOT_WIDTH + (BAR_SLOT_WIDTH - BAR_WIDTH) / 2;
            const segments = normalizedSegments(entry);
            const checkpointColor =
              entry.total > 0 && entry.passed / entry.total >= PASS_THRESHOLD
                ? theme.palette.success.main
                : theme.palette.error.main;
            let stackedValue = 0;
            const percentage = entry.total > 0 ? Math.round((entry.passed / entry.total) * 100) : 0;
            return (
              <g key={`${entry.check ?? index}-${entry.checkpoint}`}>
                <title>{`${entryLabel(entry, index)}: ${entry.passed}/${entry.total} tests passing (${percentage}%)`}</title>
                {segments.map((segment, segmentIndex) => {
                  const segmentTop = yPosition(stackedValue + segment);
                  const segmentHeight = yPosition(stackedValue) - segmentTop;
                  stackedValue += segment;
                  return (
                    <rect
                      key={segmentIndex}
                      x={x}
                      y={segmentTop}
                      width={BAR_WIDTH}
                      height={segmentHeight}
                      rx="3"
                      fill={entry.checkpoint === "iteration" ? iterationColors[segmentIndex % iterationColors.length] : checkpointColor}
                      stroke={theme.palette.background.paper}
                      strokeWidth="1"
                    />
                  );
                })}
                <text
                  x={x + BAR_WIDTH / 2}
                  y={Math.max(yPosition(entry.passed) - 8, 14)}
                  textAnchor="middle"
                  fill={theme.palette.text.primary}
                  fontSize="11"
                  fontWeight="600"
                >
                  {`${entry.passed}/${entry.total} (${percentage}%)`}
                </text>
                <text
                  x={x + BAR_WIDTH / 2}
                  y={CHART_BOTTOM + 22}
                  textAnchor="middle"
                  fill={theme.palette.text.secondary}
                  fontSize="12"
                >
                  {entryLabel(entry, index)}
                </text>
              </g>
            );
          })}
          <text
            x={14}
            y={(CHART_TOP + CHART_BOTTOM) / 2}
            textAnchor="middle"
            fill={theme.palette.text.secondary}
            fontSize="12"
            transform={`rotate(-90 14 ${(CHART_TOP + CHART_BOTTOM) / 2})`}
          >
            Tests Passed
          </text>
        </svg>
      </Box>
    </Box>
  );
};

export default ConsultantProgressChart;
