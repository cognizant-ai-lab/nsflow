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

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import {
  AccountTree as TreeIcon,
  ViewTimeline as GanttIcon,
  Refresh as ResetIcon,
  ChevronLeft as CollapseIcon,
  ChevronRight as ExpandIcon,
} from "@mui/icons-material";
import { Invocation, useTraceContext } from "../../context/TraceContext";
import { buildTraceTree, formatCost, formatDuration } from "./traceTree";
import TraceTreeView from "./TraceTreeView";
import TraceGanttView from "./TraceGanttView";

type Mode = "tree" | "gantt";

const TracePanel = () => {
  const theme = useTheme();
  const { invocations, clearTrace, selectedInvocationId, setSelectedInvocationId } =
    useTraceContext();
  const [mode, setMode] = useState<Mode>("tree");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Pick the right invocation: explicit selection, else latest.
  const activeInvocation: Invocation | null = useMemo(() => {
    if (invocations.length === 0) return null;
    if (selectedInvocationId) {
      const hit = invocations.find((inv) => inv.id === selectedInvocationId);
      if (hit) return hit;
    }
    return invocations[invocations.length - 1];
  }, [invocations, selectedInvocationId]);

  // Auto-select the newest invocation when one shows up and nothing is chosen.
  useEffect(() => {
    if (!selectedInvocationId && invocations.length > 0) {
      setSelectedInvocationId(invocations[invocations.length - 1].id);
    }
  }, [invocations, selectedInvocationId, setSelectedInvocationId]);

  const tree = useMemo(
    () => buildTraceTree(activeInvocation?.steps ?? []),
    [activeInvocation]
  );

  const networkStep = useMemo(
    () => activeInvocation?.steps.find((s) => s.is_network_total),
    [activeInvocation]
  );
  const summaryDurationS =
    networkStep?.duration_s ??
    (activeInvocation?.endedAt && activeInvocation?.startedAt
      ? activeInvocation.endedAt - activeInvocation.startedAt
      : tree.totalDurationS);
  const summaryTokens = networkStep?.total_tokens ?? tree.totalTokens;
  const summaryCost = networkStep?.total_cost ?? tree.totalCost;
  const stepCount = (activeInvocation?.steps ?? []).filter(
    (s) =>
      s.kind !== "invocation_start" &&
      s.kind !== "invocation_end" &&
      s.kind !== "network_total"
  ).length;

  return (
    <Box
      sx={{
        display: "flex",
        height: "100%",
        width: "100%",
        backgroundColor: theme.palette.background.default,
        overflow: "hidden",
      }}
    >
      {sidebarOpen ? (
        <InvocationsList
          invocations={invocations}
          selectedId={activeInvocation?.id ?? null}
          onCollapse={() => setSidebarOpen(false)}
          onSelect={(id) => {
            setSelectedInvocationId(id);
            setSelectedKey(null);
          }}
        />
      ) : (
        <Tooltip title="Show invocations" placement="right">
          <IconButton
            size="small"
            onClick={() => setSidebarOpen(true)}
            sx={{
              alignSelf: "flex-start",
              m: 0.5,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 1,
              backgroundColor: theme.palette.background.paper,
            }}
          >
            <ExpandIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}

      <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <Box
          sx={{
            px: 1.5,
            py: 1,
            borderBottom: `1px solid ${theme.palette.divider}`,
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            backgroundColor: theme.palette.background.paper,
          }}
        >
          <ToggleButtonGroup
            value={mode}
            exclusive
            size="small"
            onChange={(_, v) => v && setMode(v)}
          >
            <ToggleButton value="tree" sx={{ gap: 0.5 }}>
              <TreeIcon fontSize="small" /> Tree
            </ToggleButton>
            <ToggleButton value="gantt" sx={{ gap: 0.5 }}>
              <GanttIcon fontSize="small" /> Gantt
            </ToggleButton>
          </ToggleButtonGroup>

          <Stack direction="row" spacing={2} sx={{ ml: 2, flex: 1 }}>
            <SummaryStat label="steps" value={stepCount.toString()} />
            <SummaryStat label="wall time" value={formatDuration(summaryDurationS)} />
            <SummaryStat
              label="tokens"
              value={summaryTokens ? summaryTokens.toLocaleString() : "—"}
            />
            <SummaryStat label="cost" value={formatCost(summaryCost ?? 0)} />
          </Stack>

          <Tooltip title="Clear all invocations">
            <span>
              <IconButton size="small" onClick={() => { clearTrace(); setSelectedKey(null); }}>
                <ResetIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>

        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            backgroundColor: alpha(theme.palette.background.paper, 0.5),
          }}
        >
          {!activeInvocation ? (
            <Box sx={{ p: 3, color: theme.palette.text.secondary }}>
              <Typography variant="body2">
                No invocations yet. Send a message to record a trace.
              </Typography>
            </Box>
          ) : mode === "tree" ? (
            <TraceTreeView
              tree={tree}
              selectedKey={selectedKey}
              onSelect={(node) => setSelectedKey(node.key)}
            />
          ) : (
            <TraceGanttView
              steps={activeInvocation.steps.filter(
                (s) =>
                  s.kind !== "invocation_start" &&
                  s.kind !== "invocation_end" &&
                  s.kind !== "network_total"
              )}
              earliestStartS={tree.earliestStartS}
              latestEndS={tree.latestEndS}
              selectedKey={selectedKey}
              onSelect={(step) => setSelectedKey(step.otrace.join(" / "))}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
};

type InvocationsListProps = {
  invocations: Invocation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCollapse: () => void;
};

const InvocationsList = ({ invocations, selectedId, onSelect, onCollapse }: InvocationsListProps) => {
  const theme = useTheme();
  return (
    <Box
      sx={{
        width: 220,
        flexShrink: 0,
        borderRight: `1px solid ${theme.palette.divider}`,
        backgroundColor: theme.palette.background.paper,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          pl: 1.5,
          pr: 0.5,
          py: 0.5,
          borderBottom: `1px solid ${theme.palette.divider}`,
          fontSize: 12,
          fontWeight: 600,
          color: theme.palette.text.secondary,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        <span>Invocations</span>
        <Tooltip title="Hide invocations">
          <IconButton size="small" onClick={onCollapse}>
            <CollapseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ flex: 1, overflow: "auto" }}>
        {invocations.length === 0 && (
          <Box sx={{ p: 1.5, color: theme.palette.text.disabled, fontSize: 12 }}>
            Waiting for first message…
          </Box>
        )}
        {invocations.map((inv, i) => {
          const wallTime =
            inv.endedAt && inv.startedAt ? inv.endedAt - inv.startedAt : null;
          const isSelected = inv.id === selectedId;
          return (
            <Box
              key={inv.id}
              onClick={() => onSelect(inv.id)}
              sx={{
                px: 1.5,
                py: 1,
                cursor: "pointer",
                borderLeft: `3px solid ${
                  isSelected ? theme.palette.primary.main : "transparent"
                }`,
                backgroundColor: isSelected
                  ? alpha(theme.palette.primary.main, 0.08)
                  : "transparent",
                "&:hover": {
                  backgroundColor: alpha(theme.palette.primary.main, 0.05),
                },
                borderBottom: `1px solid ${alpha(theme.palette.text.secondary, 0.08)}`,
              }}
            >
              <Box
                sx={{
                  fontSize: 11,
                  color: theme.palette.text.secondary,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                #{i + 1} {wallTime != null ? formatDuration(wallTime) : "running…"}
              </Box>
              <Box
                sx={{
                  fontSize: 13,
                  color: theme.palette.text.primary,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  mt: 0.25,
                }}
                title={inv.prompt}
              >
                {inv.prompt || "(no prompt)"}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

const SummaryStat = ({ label, value }: { label: string; value: string }) => {
  const theme = useTheme();
  return (
    <Box>
      <Typography
        component="div"
        sx={{ fontSize: 10, color: theme.palette.text.secondary, lineHeight: 1 }}
      >
        {label}
      </Typography>
      <Typography
        component="div"
        sx={{
          fontSize: 13,
          fontWeight: 600,
          color: theme.palette.text.primary,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
};

export default TracePanel;
