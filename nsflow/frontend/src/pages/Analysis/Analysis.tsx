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
  Alert,
  Box,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import Header from "../../components/Header";
import { useTraceContext } from "../../context/TraceContext";
import { useChatContext } from "../../context/ChatContext";
import { styleFor } from "../../components/trace/traceKinds";
import {
  byAgent,
  byModel,
  byNetwork,
  formatCost,
  formatDuration,
  formatTokens,
  invocationStats,
} from "./analysisRollups";
import { getInitialTheme } from "../../utils/theme";

const Analysis = () => {
  const theme = useTheme();
  const { invocations } = useTraceContext();
  const { activeNetwork } = useChatContext();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", getInitialTheme());
  }, []);

  const networks = useMemo(() => byNetwork(invocations), [invocations]);

  // One shared network filter governs three sections (distribution / agent /
  // cost-by-model). "All networks combined" averages across networks, which
  // is fine for cost roll-up but misleading for per-invocation distribution
  // when network complexity differs.
  const [networkScope, setNetworkScope] = useState<string>("__all__");
  useEffect(() => {
    if (
      networkScope !== "__all__" &&
      !networks.some((n) => n.network === networkScope)
    ) {
      setNetworkScope("__all__");
    }
  }, [networks, networkScope]);

  const scopedInvocations = useMemo(
    () =>
      networkScope === "__all__"
        ? invocations
        : invocations.filter((inv) => inv.network === networkScope),
    [invocations, networkScope]
  );

  const stats = useMemo(() => invocationStats(scopedInvocations), [scopedInvocations]);
  const models = useMemo(() => byModel(scopedInvocations), [scopedInvocations]);
  const agents = useMemo(
    () => byAgent(invocations, networkScope === "__all__" ? undefined : networkScope),
    [invocations, networkScope]
  );

  const isEmpty = invocations.length === 0;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw" }}>
      <Header selectedNetwork={activeNetwork || ""} />

      <Box sx={{ flex: 1, overflow: "auto", p: 3, backgroundColor: theme.palette.background.default, width: "100%" }}>
        <Typography variant="h5" sx={{ mb: 0.5, fontWeight: 600 }}>
          Trace Analysis
        </Typography>
        <Typography variant="body2" sx={{ color: theme.palette.text.secondary, mb: 2 }}>
          Aggregated metrics across all invocations recorded in this browser session.
          Use the filter on the right to scope every section to a single network.
          Refresh the page or click Reset in the Trace tab to clear.
        </Typography>

        {isEmpty && (
          <Alert severity="info" sx={{ mb: 2 }}>
            No invocations recorded yet. Send a chat message on the Home page to
            start collecting data.
          </Alert>
        )}

        <Stack
          direction="row"
          spacing={2}
          sx={{ mb: 3, alignItems: "center", flexWrap: "wrap", rowGap: 1 }}
        >
          <SummaryTile label="Invocations" value={invocations.length.toString()} />
          <SummaryTile label="Total cost" value={formatCost(stats.totalCost)} />
          <SummaryTile label="Total tokens" value={formatTokens(stats.totalTokens)} />
          <SummaryTile label="Total LLM calls" value={stats.totalLlmCalls.toLocaleString()} />
          <Box sx={{ flex: 1 }} />
          <Box>
            <Typography
              variant="caption"
              sx={{ display: "block", color: theme.palette.text.secondary, mb: 0.5 }}
            >
              Filter by network
            </Typography>
            <NetworkFilter
              value={networkScope}
              onChange={setNetworkScope}
              networks={networks.map((n) => n.network)}
            />
          </Box>
        </Stack>

        <Section title="Cost by network" subtitle="Where the money goes">
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <Th>Network</Th>
                  <Th align="right">Invocations</Th>
                  <Th align="right">Cost</Th>
                  <Th align="right">% of total</Th>
                  <Th align="right">Tokens</Th>
                  <Th align="right">LLM calls</Th>
                </TableRow>
              </TableHead>
              <TableBody>
                {networks.length === 0 ? (
                  <EmptyRow cols={6} />
                ) : (
                  networks.map((r) => (
                    <TableRow key={r.network}>
                      <Td>{r.network}</Td>
                      <Td align="right">{r.invocations}</Td>
                      <Td align="right">{formatCost(r.cost)}</Td>
                      <Td align="right">
                        <PctBar value={r.pctOfTotal} />
                      </Td>
                      <Td align="right">{formatTokens(r.tokens)}</Td>
                      <Td align="right">{r.llmCalls.toLocaleString()}</Td>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Section>

        <Section
          title="Per-invocation distribution"
          subtitle="Min / Avg / P50 / P90 / Max. Networks with very different complexity should not be averaged together — use the page filter to scope."
        >
          <DistributionTable stats={stats} />
        </Section>

        <Section
          title="LLM calls by agent"
          subtitle="Drill down to see which agents burn the most calls/tokens within a network"
        >
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <Th>Agent</Th>
                  <Th>Kind</Th>
                  <Th align="right">Hits</Th>
                  <Th align="right">LLM calls</Th>
                  <Th align="right">Tokens</Th>
                  <Th align="right">Cost</Th>
                  <Th align="right">Total time</Th>
                </TableRow>
              </TableHead>
              <TableBody>
                {agents.length === 0 ? (
                  <EmptyRow cols={7} />
                ) : (
                  agents.map((r) => {
                    const k = styleFor(r.kind as never, [r.agent]);
                    return (
                      <TableRow key={r.agent}>
                        <Td>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Box sx={{ display: "flex", color: k.color }}>{k.icon}</Box>
                            {r.agent}
                          </Box>
                        </Td>
                        <Td>{k.label}</Td>
                        <Td align="right">{r.hits}</Td>
                        <Td align="right">{r.llmCalls.toLocaleString()}</Td>
                        <Td align="right">{formatTokens(r.tokens)}</Td>
                        <Td align="right">{formatCost(r.cost)}</Td>
                        <Td align="right">{formatDuration(r.totalDuration)}</Td>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Section>

        <Section
          title="Cost by model"
          subtitle="Per-model totals. Only frontman aggregates carry the model name, so this reflects per-invocation primary model."
        >
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <Th>Provider</Th>
                  <Th>Model</Th>
                  <Th align="right">Invocations</Th>
                  <Th align="right">Cost</Th>
                  <Th align="right">Tokens</Th>
                  <Th align="right">LLM calls</Th>
                </TableRow>
              </TableHead>
              <TableBody>
                {models.length === 0 ? (
                  <EmptyRow cols={6} />
                ) : (
                  models.map((r) => (
                    <TableRow key={`${r.provider}::${r.model}`}>
                      <Td>{r.provider || "—"}</Td>
                      <Td>{r.model}</Td>
                      <Td align="right">{r.invocations}</Td>
                      <Td align="right">{formatCost(r.cost)}</Td>
                      <Td align="right">{formatTokens(r.tokens)}</Td>
                      <Td align="right">{r.llmCalls.toLocaleString()}</Td>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Section>

        <Typography variant="caption" sx={{ display: "block", mt: 4, color: theme.palette.text.disabled }}>
          v1 scope: in-memory, current browser session only. For week-over-week
          analytics across many runs, traces would need to be persisted to
          nss_local.db (planned follow-up).
        </Typography>
      </Box>
    </Box>
  );
};

const NetworkFilter = ({
  value,
  onChange,
  networks,
}: {
  value: string;
  onChange: (v: string) => void;
  networks: string[];
}) => (
  <Select
    size="small"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    sx={{ minWidth: 240, fontSize: 13 }}
  >
    <MenuItem value="__all__">All networks combined</MenuItem>
    {networks.map((n) => (
      <MenuItem key={n} value={n}>
        {n}
      </MenuItem>
    ))}
  </Select>
);

const DistributionTable = ({
  stats,
}: {
  stats: import("./analysisRollups").InvocationStats;
}) => {
  return (
    <Box>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <Th>Metric</Th>
              <Th align="right">Min</Th>
              <Th align="right">Avg</Th>
              <Th align="right">P50</Th>
              <Th align="right">P90</Th>
              <Th align="right">Max</Th>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <Td>Cost</Td>
              <Td align="right">{formatCost(stats.cost.min)}</Td>
              <Td align="right">{formatCost(stats.cost.avg)}</Td>
              <Td align="right">{formatCost(stats.cost.p50)}</Td>
              <Td align="right">{formatCost(stats.cost.p90)}</Td>
              <Td align="right">{formatCost(stats.cost.max)}</Td>
            </TableRow>
            <TableRow>
              <Td>Tokens</Td>
              <Td align="right">{formatTokens(stats.tokens.min)}</Td>
              <Td align="right">{formatTokens(stats.tokens.avg)}</Td>
              <Td align="right">{formatTokens(stats.tokens.p50)}</Td>
              <Td align="right">{formatTokens(stats.tokens.p90)}</Td>
              <Td align="right">{formatTokens(stats.tokens.max)}</Td>
            </TableRow>
            <TableRow>
              <Td>LLM calls</Td>
              <Td align="right">{Math.round(stats.llmCalls.min).toLocaleString()}</Td>
              <Td align="right">{stats.llmCalls.avg.toFixed(1)}</Td>
              <Td align="right">{Math.round(stats.llmCalls.p50).toLocaleString()}</Td>
              <Td align="right">{Math.round(stats.llmCalls.p90).toLocaleString()}</Td>
              <Td align="right">{Math.round(stats.llmCalls.max).toLocaleString()}</Td>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

const Section = ({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) => {
  const theme = useTheme();
  return (
    <Box sx={{ mb: 4 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {right}
      </Box>
      {children}
    </Box>
  );
};

const SummaryTile = ({ label, value }: { label: string; value: string }) => {
  const theme = useTheme();
  return (
    <Paper
      variant="outlined"
      sx={{ px: 2, py: 1.5, minWidth: 160, backgroundColor: alpha(theme.palette.background.paper, 0.8) }}
    >
      <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
        {label}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </Typography>
    </Paper>
  );
};

const PctBar = ({ value }: { value: number }) => {
  const theme = useTheme();
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, justifyContent: "flex-end" }}>
      <Box
        sx={{
          width: 80,
          height: 6,
          borderRadius: 1,
          backgroundColor: alpha(theme.palette.text.secondary, 0.15),
          position: "relative",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            width: `${Math.min(Math.max(value, 0), 100)}%`,
            backgroundColor: theme.palette.primary.main,
          }}
        />
      </Box>
      <Box sx={{ width: 50, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {value.toFixed(1)}%
      </Box>
    </Box>
  );
};

const Th = ({ children, align }: { children: React.ReactNode; align?: "right" }) => (
  <TableCell align={align} sx={{ fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
    {children}
  </TableCell>
);

const Td = ({ children, align }: { children: React.ReactNode; align?: "right" }) => (
  <TableCell align={align} sx={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
    {children}
  </TableCell>
);

const EmptyRow = ({ cols }: { cols: number }) => {
  const theme = useTheme();
  return (
    <TableRow>
      <TableCell
        colSpan={cols}
        sx={{ textAlign: "center", color: theme.palette.text.disabled, py: 3, fontSize: 13 }}
      >
        No data
      </TableCell>
    </TableRow>
  );
};

export default Analysis;
