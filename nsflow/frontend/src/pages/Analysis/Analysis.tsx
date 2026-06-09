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

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
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
  TextField,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import { Refresh as RefreshIcon } from "@mui/icons-material";
import Header from "../../components/Header";
import { useApiPort } from "../../context/ApiPortContext";
import { useChatContext } from "../../context/ChatContext";
import { styleFor } from "../../components/trace/traceKinds";
import {
  formatCost,
  formatDuration,
  formatTokens,
  invocationStatsFromSummaries,
} from "./analysisRollups";
import {
  AgentRollupRow,
  InvocationSummary,
  KeyedRollupRow,
  fetchAgentRollups,
  fetchInvocations,
  fetchKeyedRollups,
} from "./analysisApi";
import { getInitialTheme } from "../../utils/theme";

const ALL = "__all__";

const toDateInput = (epochSeconds: number | null): string => {
  if (epochSeconds == null) return "";
  const d = new Date(epochSeconds * 1000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const fromDateInput = (value: string, endOfDay = false): number | null => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay) d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
};

const defaultSince = (): number =>
  Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);

const Analysis = () => {
  const theme = useTheme();
  const { apiUrl } = useApiPort();
  const { activeNetwork } = useChatContext();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", getInitialTheme());
  }, []);

  // Filters
  const [networkScope, setNetworkScope] = useState<string>(ALL);
  const [sinceInput, setSinceInput] = useState<string>(toDateInput(defaultSince()));
  const [untilInput, setUntilInput] = useState<string>("");

  // Data
  const [invocations, setInvocations] = useState<InvocationSummary[]>([]);
  const [networkRows, setNetworkRows] = useState<KeyedRollupRow[]>([]);
  const [modelRows, setModelRows] = useState<KeyedRollupRow[]>([]);
  const [agentRows, setAgentRows] = useState<AgentRollupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!apiUrl) return;
    setLoading(true);
    setError(null);
    const since = fromDateInput(sinceInput, false);
    const until = fromDateInput(untilInput, true);
    const network = networkScope === ALL ? null : networkScope;
    try {
      // Network rollup is intentionally unfiltered by `network` so the
      // table still shows the full breakdown across networks even when
      // the user has scoped the other sections to one.
      const [invs, byNet, byMdl, byAgt] = await Promise.all([
        fetchInvocations(apiUrl, { network, since, until, limit: 500 }),
        fetchKeyedRollups(apiUrl, "network", { since, until }),
        fetchKeyedRollups(apiUrl, "model", { network, since, until }),
        fetchAgentRollups(apiUrl, { network, since, until }),
      ]);
      setInvocations(invs);
      setNetworkRows(byNet);
      setModelRows(byMdl);
      setAgentRows(byAgt);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [apiUrl, networkScope, sinceInput, untilInput]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Keep network filter valid if the chosen network drops out of the rollup.
  useEffect(() => {
    if (
      networkScope !== ALL &&
      !networkRows.some((r) => r.key === networkScope)
    ) {
      setNetworkScope(ALL);
    }
  }, [networkRows, networkScope]);

  const stats = useMemo(() => invocationStatsFromSummaries(invocations), [invocations]);

  // Tile totals come from network_total rows (the frontman's authoritative
  // aggregate) so they match the Cost-by-network table. When the user has
  // filtered to one network, we sum that row only; otherwise we sum all.
  const tileTotals = useMemo(() => {
    const rows =
      networkScope === ALL
        ? networkRows
        : networkRows.filter((r) => r.key === networkScope);
    return {
      invocations: rows.reduce((acc, r) => acc + r.invocations, 0),
      cost: rows.reduce((acc, r) => acc + r.cost, 0),
      tokens: rows.reduce((acc, r) => acc + r.tokens, 0),
      llmCalls: rows.reduce((acc, r) => acc + r.llm_calls, 0),
    };
  }, [networkRows, networkScope]);

  const isEmpty = invocations.length === 0 && networkRows.length === 0;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw" }}>
      <Header selectedNetwork={activeNetwork || ""} />

      <Box
        sx={{
          flex: 1,
          overflow: "auto",
          p: 3,
          backgroundColor: theme.palette.background.default,
          width: "100%",
        }}
      >
        <Typography variant="h5" sx={{ mb: 0.5, fontWeight: 600 }}>
          Trace Analysis
        </Typography>
        <Typography variant="body2" sx={{ color: theme.palette.text.secondary, mb: 2 }}>
          Aggregated metrics across persisted trace history. Use the filters to scope by
          network or time range. The live Trace tab remains the source of truth for the
          current session.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!error && isEmpty && !loading && (
          <Alert severity="info" sx={{ mb: 2 }}>
            No invocations recorded in the selected range. Run an agent network on the
            Home page, then reload here.
          </Alert>
        )}

        <Stack
          direction="row"
          spacing={2}
          sx={{ mb: 3, alignItems: "flex-end", flexWrap: "wrap", rowGap: 1 }}
        >
          <SummaryTile label="Invocations" value={tileTotals.invocations.toString()} />
          <SummaryTile label="Total cost" value={formatCost(tileTotals.cost)} />
          <SummaryTile label="Total tokens" value={formatTokens(tileTotals.tokens)} />
          <SummaryTile label="Total LLM calls" value={tileTotals.llmCalls.toLocaleString()} />
          <Box sx={{ flex: 1 }} />

          <FilterField label="From">
            <TextField
              type="date"
              size="small"
              value={sinceInput}
              onChange={(e) => setSinceInput(e.target.value)}
              sx={{ width: 160 }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </FilterField>
          <FilterField label="To">
            <TextField
              type="date"
              size="small"
              value={untilInput}
              onChange={(e) => setUntilInput(e.target.value)}
              sx={{ width: 160 }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </FilterField>
          <FilterField label="Network">
            <Select
              size="small"
              value={networkScope}
              onChange={(e) => setNetworkScope(e.target.value)}
              sx={{ minWidth: 240, fontSize: 13 }}
            >
              <MenuItem value={ALL}>All networks combined</MenuItem>
              {networkRows.map((r) => (
                <MenuItem key={r.key ?? ""} value={r.key ?? ""}>
                  {r.key}
                </MenuItem>
              ))}
            </Select>
          </FilterField>

          <Button
            variant="outlined"
            size="small"
            startIcon={loading ? <CircularProgress size={14} /> : <RefreshIcon />}
            onClick={reload}
            disabled={loading}
          >
            Reload
          </Button>
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
                {networkRows.length === 0 ? (
                  <EmptyRow cols={6} />
                ) : (
                  (() => {
                    const totalCost = networkRows.reduce((acc, r) => acc + r.cost, 0);
                    return networkRows.map((r) => {
                      const pct = totalCost > 0 ? (r.cost / totalCost) * 100 : 0;
                      return (
                        <TableRow key={r.key ?? ""}>
                          <Td>{r.key}</Td>
                          <Td align="right">{r.invocations}</Td>
                          <Td align="right">{formatCost(r.cost)}</Td>
                          <Td align="right">
                            <PctBar value={pct} />
                          </Td>
                          <Td align="right">{formatTokens(r.tokens)}</Td>
                          <Td align="right">{r.llm_calls.toLocaleString()}</Td>
                        </TableRow>
                      );
                    });
                  })()
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Section>

        <Section
          title="Per-invocation distribution"
          subtitle="Min / Avg / P50 / P90 / Max. Filter by network for a fair comparison across complexity."
        >
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
        </Section>

        <Section
          title="LLM calls by agent"
          subtitle="Which agents burn the most calls/tokens within the selected scope"
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
                {agentRows.length === 0 ? (
                  <EmptyRow cols={7} />
                ) : (
                  agentRows.map((r) => {
                    const k = styleFor(r.kind, [r.agent ?? ""]);
                    return (
                      <TableRow key={`${r.agent}::${r.kind}`}>
                        <Td>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Box sx={{ display: "flex", color: k.color }}>{k.icon}</Box>
                            {r.agent || "(unknown)"}
                          </Box>
                        </Td>
                        <Td>{k.label}</Td>
                        <Td align="right">{r.hits}</Td>
                        <Td align="right">{r.llm_calls.toLocaleString()}</Td>
                        <Td align="right">{formatTokens(r.tokens)}</Td>
                        <Td align="right">{formatCost(r.cost)}</Td>
                        <Td align="right">{formatDuration(r.total_duration_s)}</Td>
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
          subtitle="Per-model totals. Reflects per-invocation primary model from frontman aggregates."
        >
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <Th>Model</Th>
                  <Th align="right">Invocations</Th>
                  <Th align="right">Cost</Th>
                  <Th align="right">Tokens</Th>
                  <Th align="right">LLM calls</Th>
                </TableRow>
              </TableHead>
              <TableBody>
                {modelRows.length === 0 ? (
                  <EmptyRow cols={5} />
                ) : (
                  modelRows.map((r) => (
                    <TableRow key={r.key ?? "(unknown)"}>
                      <Td>{r.key || "(unknown)"}</Td>
                      <Td align="right">{r.invocations}</Td>
                      <Td align="right">{formatCost(r.cost)}</Td>
                      <Td align="right">{formatTokens(r.tokens)}</Td>
                      <Td align="right">{r.llm_calls.toLocaleString()}</Td>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Section>
      </Box>
    </Box>
  );
};

const FilterField = ({ label, children }: { label: string; children: React.ReactNode }) => {
  const theme = useTheme();
  return (
    <Box>
      <Typography
        variant="caption"
        sx={{ display: "block", color: theme.palette.text.secondary, mb: 0.5 }}
      >
        {label}
      </Typography>
      {children}
    </Box>
  );
};

const Section = ({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
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
      sx={{
        px: 2,
        py: 1.5,
        minWidth: 160,
        backgroundColor: alpha(theme.palette.background.paper, 0.8),
      }}
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
  <TableCell
    align={align}
    sx={{ fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}
  >
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
