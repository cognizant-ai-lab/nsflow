
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

import { useEffect, useRef, useState } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  MenuItem,
  Alert,
  CircularProgress,
  Checkbox,
  Chip,
  FormControlLabel,
  Divider,
  useTheme,
  alpha,
} from "@mui/material";
import { useApiPort } from "../context/ApiPortContext";
import { useChatContext } from "../context/ChatContext";
import TestFixturesDialog from "./TestFixturesDialog";
import type { FixtureResult } from "./TestFixturesDialog";

const TEST_LEVELS = ["minimum", "normal", "max"] as const;
type TestLevel = (typeof TEST_LEVELS)[number];

// Scenario-count ranges the test generator's own instructions target per level (see
// registries/agent_network_test_generator.hocon) -- not enforced here, just surfaced as a hint.
const TEST_LEVEL_HINTS: Record<TestLevel, string> = {
  minimum: "2-3",
  normal: "5-7",
  max: "10-15",
};

// Display-only labels -- "max" stays the wire value (backend/registry enum), "Maximum" is just
// how it reads in the dropdown.
const TEST_LEVEL_LABELS: Record<TestLevel, string> = {
  minimum: "minimum",
  normal: "normal",
  max: "maximum",
};

// Matches Config/Connectors section headings (variant="subtitle1", fontWeight 600, default size).
const SECTION_HEADING_SX = { fontWeight: 600, mb: 2 };

// Matches the backend's ImproveNetworkRequest.success_ratio pattern (^\d+/\d+$).
const SUCCESS_RATIO_PATTERN = /^\d+\/\d+$/;

// Matches the backend's ImproveNetworkRequest.max_iterations default.
const DEFAULT_MAX_ITERATIONS = 10;

// Polling cadence while a job is running -- fast enough to feel live, cheap enough not to
// hammer the backend since a run can take many minutes.
const POLL_INTERVAL_MS = 2000;

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : "An unexpected error occurred.";

const NetworkConsultantPanel = ({ selectedNetwork }: { selectedNetwork: string }) => {
  const { apiUrl } = useApiPort();
  const { sessionId } = useChatContext();
  const theme = useTheme();

  const [direction, setDirection] = useState("");
  const [testLevel, setTestLevel] = useState<TestLevel>("normal");
  const [maxIterations, setMaxIterations] = useState(DEFAULT_MAX_ITERATIONS);
  const [successRatio, setSuccessRatio] = useState("3/3");
  const [gitVersions, setGitVersions] = useState(false);
  // Which failure is showing its full text. Null means "only the one that opens itself".
  const [openFailure, setOpenFailure] = useState<string | null>(null);
  // Which card started the current job, so its chart and failures render directly beneath it.
  // Output that appears somewhere other than where you clicked reads as unrelated to the click.
  const [jobOrigin, setJobOrigin] = useState<"tests" | "generate" | "improve" | null>(null);
  const [testGuidance, setTestGuidance] = useState("");
  const [fixturesDialogOpen, setFixturesDialogOpen] = useState(false);

  const [fixtureNames, setFixtureNames] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, FixtureResult>>({});

  const [jobId, setJobId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [returncode, setReturncode] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [toolIssues, setToolIssues] = useState<string[]>([]);
  const [ungrounded, setUngrounded] = useState<string[]>([]);
  const [progressChart, setProgressChart] = useState<string | null>(null);
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // The line worth showing when a failure is collapsed. A gist failure's own first line is
  // "False is not true :" -- true and useless. What was actually wanted comes after the
  // "acceptance_criteria:" header, so prefer that; keyword failures have no such header and
  // their first line already says which keyword was missing.
  const failureSummary = (message?: string | null): string => {
    if (!message) return "";
    const afterCriteria = message.split(/acceptance_criteria:\s*/i)[1];
    const lines = (afterCriteria ?? message).split("\n").map((line) => line.trim());
    return lines.find((line) => line && !/^False is not true/i.test(line)) ?? "";
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => stopPolling, []);

  // A chart belongs to one network. Preserve it between Generate and Improve for that network,
  // but never let it linger after the user selects a different one. Verdicts are per-network
  // too, and a stale ✓ against a different network's fixture would be a lie, not just clutter.
  useEffect(() => {
    setProgressChart(null);
    setResults({});
    setOpenFailure(null);
    setJobOrigin(null);
    loadFixtures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNetwork]);

  const pollJob = (id: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${apiUrl}/api/v1/network_consultant/jobs/${id}?theme=${theme.palette.mode}`);
        if (!res.ok) throw new Error(`Status check failed (${res.status})`);
        const data = await res.json();
        setRunning(data.running);
        setReturncode(data.returncode);
        setPendingQuestion(data.pending_question ?? null);
        setToolIssues(data.tool_issues ?? []);
        setUngrounded(data.ungrounded ?? []);
        // Keyed by name rather than stored as a list: the backend already carries forward the
        // verdict of any fixture this round did not re-run, so this is the whole suite.
        if (Array.isArray(data.results) && data.results.length) {
          setResults(Object.fromEntries(data.results.map((r: FixtureResult) => [r.fixture, r])));
        }
        if (data.progress_chart) setProgressChart(data.progress_chart);
        setGitBranch(data.git_branch ?? null);
        if (!data.running) {
          stopPolling();
          // Generation adds fixtures, so the list this panel shows can be stale the moment a
          // job ends. Cheap call, and only on the edge from running to finished.
          loadFixtures();
        }
      } catch (error: unknown) {
        setError(describeError(error));
        stopPolling();
      }
    }, POLL_INTERVAL_MS);
  };

  const startJob = async (endpoint: string, body: Record<string, unknown>) => {
    setJobOrigin(endpoint === "improve" ? "improve" : endpoint === "generate-tests" ? "generate" : "tests");
    setError(null);
    setReturncode(null);
    setJobId(null);
    setPendingQuestion(null);
    setAnswerText("");
    setToolIssues([]);
    setUngrounded([]);
    // Verdicts belong to one job. Carrying them into the next makes a run that has not produced
    // results yet look like it already has -- the previous run's failures, shown under whichever
    // card just started, reading as if nothing happened.
    setResults({});
    setOpenFailure(null);
    setGitBranch(null);
    if (endpoint === "generate-tests") setProgressChart(null);
    try {
      const res = await fetch(`${apiUrl}/api/v1/network_consultant/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, session_id: sessionId }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail ?? `Request failed (${res.status})`);
      }
      const data = await res.json();
      setJobId(data.job_id);
      setRunning(true);
      pollJob(data.job_id);
    } catch (error: unknown) {
      setError(describeError(error));
    }
  };

  // Same endpoint TestFixturesDialog uses; only the names are needed here.
  const loadFixtures = async () => {
    if (!selectedNetwork) {
      setFixtureNames([]);
      return;
    }
    try {
      const res = await fetch(
        `${apiUrl}/api/v1/network_consultant/fixtures?network_name=${encodeURIComponent(selectedNetwork)}`,
      );
      if (!res.ok) throw new Error(`Could not list tests (${res.status})`);
      const data = await res.json();
      setFixtureNames((data.fixtures ?? []).map((f: { name: string }) => f.name));
    } catch (error: unknown) {
      setError(describeError(error));
    }
  };

  const handleGenerateTests = () =>
    startJob("generate-tests", {
      network_name: selectedNetwork,
      test_level: testLevel,
      test_guidance: testGuidance,
    });

  const handleRunAll = () => startJob("run-tests", { network_name: selectedNetwork });

  const handleRunOne = (fixtureName: string) =>
    startJob("run-tests", { network_name: selectedNetwork, fixture_name: fixtureName });

  const handleImprove = () =>
    startJob("improve", {
      network_name: selectedNetwork,
      direction,
      test_level: testLevel,
      max_iterations: maxIterations,
      success_ratio: successRatio,
      git_versions: gitVersions,
    });

  const handleSubmitAnswer = async () => {
    if (!jobId || !answerText.trim()) return;
    setSubmittingAnswer(true);
    try {
      const res = await fetch(`${apiUrl}/api/v1/network_consultant/jobs/${jobId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: answerText }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail ?? `Request failed (${res.status})`);
      }
      setAnswerText("");
      // The next poll tick picks up pending_question clearing once the job consumes the answer.
    } catch (error: unknown) {
      setError(describeError(error));
    } finally {
      setSubmittingAnswer(false);
    }
  };

  const [stopping, setStopping] = useState(false);

  const handleStop = async () => {
    if (!jobId) return;
    setStopping(true);
    try {
      const res = await fetch(`${apiUrl}/api/v1/network_consultant/jobs/${jobId}/stop`, { method: "POST" });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail ?? `Request failed (${res.status})`);
      }
      // The next poll tick (POLL_INTERVAL_MS) picks up running:false; no need to stop polling here.
    } catch (error: unknown) {
      setError(describeError(error));
    } finally {
      setStopping(false);
    }
  };

  const canSubmit = Boolean(selectedNetwork) && !running;

  const verdicts = fixtureNames.map((name) => results[name]).filter(Boolean) as FixtureResult[];
  const passingCount = verdicts.filter((r) => r.passed).length;
  const failingCount = verdicts.length - passingCount;
  const failures = verdicts.filter((r) => !r.passed);
  // One failure is the whole story, so it opens itself. Six are a list to triage, and six
  // expanded assertion texts would push everything below off the panel.
  const soleFailure = failures.length === 1 ? failures[0].fixture : null;


  // A run's output -- its chart and whatever failed -- rendered directly under whichever card
  // started it, rather than in one fixed place at the bottom of the panel.
  const outputBlock = jobOrigin && (
    <>
    {/* Its own card, with the same chrome as the rest of the panel -- an unlabelled strip of
        red under the Tests controls did not say what it was. Error-tinted rather than
        info-tinted, and absent entirely on a clean run. */}
    {failures.length > 0 && (
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          mb: 2,
          borderRadius: 2,
          backgroundColor: alpha(theme.palette.error.main, 0.04),
          borderColor: alpha(theme.palette.error.main, 0.3),
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, ...SECTION_HEADING_SX }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
            Failing tests
          </Typography>
          <Chip size="small" color="error" label={failures.length} />
        </Box>
        {/* Bounded and scrollable: however many fail, the cards below stay where they are. */}
        <Box sx={{ maxHeight: 260, overflowY: "auto" }}>
          {failures.map((result) => {
            const isOpen = openFailure === result.fixture || soleFailure === result.fixture;
            const accent = result.infrastructure_error
              ? theme.palette.warning.main
              : theme.palette.error.main;
            return (
              <Box
                key={result.fixture}
                onClick={() => setOpenFailure(isOpen ? "" : result.fixture)}
                sx={{
                  mb: 1,
                  p: 1,
                  borderRadius: 1,
                  cursor: "pointer",
                  borderLeft: `3px solid ${accent}`,
                  backgroundColor: alpha(accent, 0.06),
                }}
              >
                <Typography
                  variant="body2"
                  noWrap
                  title={result.fixture}
                  sx={{ fontWeight: 600, color: theme.palette.text.primary }}
                >
                  {result.fixture.replace(/\.hocon$/, "")}
                </Typography>
                {result.infrastructure_error && (
                  // A timeout or an API-key fault is not a defect in the network. Saying so
                  // is the difference between fixing the harness and rewriting an agent that
                  // was never at fault.
                  <Typography variant="caption" sx={{ display: "block", color: theme.palette.warning.main }}>
                    Could not reach a verdict
                  </Typography>
                )}
                {result.message &&
                  (isOpen ? (
                    <Box
                      component="pre"
                      sx={{
                        m: 0,
                        mt: 0.5,
                        fontSize: "0.7rem",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        maxHeight: 160,
                        overflowY: "auto",
                        color: theme.palette.text.secondary,
                      }}
                    >
                      {result.message}
                    </Box>
                  ) : (
                    <Typography
                      variant="caption"
                      noWrap
                      sx={{ display: "block", color: theme.palette.text.secondary }}
                    >
                      {failureSummary(result.message)}
                    </Typography>
                  ))}
              </Box>
            );
          })}
        </Box>
      </Paper>
    )}

    <Paper
      variant="outlined"
      sx={{
        p: 2,
        mb: 2,
        borderRadius: 2,
        backgroundColor: alpha(theme.palette.info.main, 0.04),
        borderColor: alpha(theme.palette.info.main, 0.3),
      }}
    >
      {progressChart ? (
        <Box
          component="img"
          src={progressChart}
          alt="Tests passing per improvement iteration"
          sx={{ width: "100%", maxWidth: 900, display: "block", mx: "auto", borderRadius: 1 }}
        />
      ) : (
        <>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: theme.palette.text.primary, mb: 1.5 }}>
            Tests Passing Per Iteration
          </Typography>
          <Box
            sx={{
              minHeight: 160,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 1.5,
              borderRadius: 1,
              border: `1px dashed ${theme.palette.divider}`,
              color: theme.palette.text.secondary,
            }}
          >
            {running && <CircularProgress size={20} />}
            <Typography variant="body2">
              {running ? "Waiting for the first test result..." : "Run Generate or Improve to see test progress."}
            </Typography>
          </Box>
        </>
      )}
    </Paper>
    </>
  );


  return (
    <Paper
      elevation={0}
      sx={{
        height: "100%",
        backgroundColor: theme.palette.background.paper,
        display: "flex",
        flexDirection: "column",
        p: 2,
        overflow: "hidden",
      }}
    >
      <Typography
        variant="h6"
        sx={{
          fontWeight: 600,
          color: theme.palette.text.primary,
          mb: 2,
          borderBottom: `1px solid ${theme.palette.divider}`,
          pb: 1,
        }}
      >
        Network Consultant: {selectedNetwork || "(no network selected)"}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ overflowY: "auto", flexGrow: 1 }}>
        {pendingQuestion && (
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              mb: 2,
              borderRadius: 2,
              backgroundColor: alpha(theme.palette.warning.main, 0.08),
              borderColor: alpha(theme.palette.warning.main, 0.4),
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: theme.palette.text.primary, mb: 1 }}>
              Question From Consultant
            </Typography>
            <Typography variant="body2" sx={{ color: theme.palette.text.primary, mb: 2 }}>
              {pendingQuestion}
            </Typography>
            <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
              <TextField
                label="Your answer"
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitAnswer();
                  }
                }}
                fullWidth
                multiline
                minRows={1}
              />
              <Button
                variant="contained"
                color="warning"
                disabled={!answerText.trim() || submittingAnswer}
                onClick={handleSubmitAnswer}
                sx={{ whiteSpace: "nowrap" }}
              >
                {submittingAnswer ? "Sending..." : "Send Answer"}
              </Button>
            </Box>
          </Paper>
        )}

        {ungrounded.length > 0 && (
          // Amber, not red, and deliberately worded away from "defect": the network is behaving
          // correctly by refusing to invent a fact it cannot look up. Reading this as an agent
          // problem is what sends the loop rewriting agents that were never at fault.
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              mb: 2,
              borderRadius: 2,
              backgroundColor: alpha(theme.palette.warning.main, 0.08),
              borderColor: alpha(theme.palette.warning.main, 0.4),
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: theme.palette.text.primary, mb: 1 }}>
              Ungrounded criteria
            </Typography>
            <Typography variant="body2" sx={{ color: theme.palette.text.secondary, mb: 1 }}>
              These criteria ask for facts no tool in this network can supply -- the tool it depends on returns
              no data. No instruction change can satisfy them: wire up the data source, or remove the criteria.
            </Typography>
            {ungrounded.map((entry, index) => (
              <Typography
                key={index}
                variant="body2"
                sx={{ fontFamily: "monospace", fontSize: "0.85rem", color: theme.palette.text.primary, mt: 1 }}
              >
                {entry}
              </Typography>
            ))}
          </Paper>
        )}

        {toolIssues.length > 0 && (
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              mb: 2,
              borderRadius: 2,
              backgroundColor: alpha(theme.palette.error.main, 0.08),
              borderColor: alpha(theme.palette.error.main, 0.4),
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: theme.palette.text.primary, mb: 1 }}>
              Tool Issue -- Run Stopped
            </Typography>
            <Typography variant="body2" sx={{ color: theme.palette.text.secondary, mb: 1 }}>
              A required coded tool is broken. This needs a human code fix -- no instructions or fixture change can
              resolve it, so the run stopped here. Fix the code, then start a new run.
            </Typography>
            {toolIssues.map((issue, index) => (
              <Typography
                key={index}
                variant="body2"
                sx={{ fontFamily: "monospace", fontSize: "0.85rem", color: theme.palette.text.primary, mt: 1 }}
              >
                {issue}
              </Typography>
            ))}
          </Paper>
        )}

        <Paper
          variant="outlined"
          sx={{
            p: 2,
            mb: 2,
            borderRadius: 2,
            backgroundColor: alpha(theme.palette.info.main, 0.04),
            borderColor: alpha(theme.palette.info.main, 0.3),
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, ...SECTION_HEADING_SX }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
              Tests
            </Typography>
            {fixtureNames.length > 0 && (
              <Chip size="small" color="primary" label={fixtureNames.length} />
            )}
          </Box>
          {/* Same shape as the two cards below: heading, then one left-aligned row of controls. */}
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center" }}>
            <Button variant="contained" disabled={!canSubmit || !fixtureNames.length} onClick={handleRunAll}>
              Run all
            </Button>
            <Button variant="contained" disabled={!selectedNetwork} onClick={() => setFixturesDialogOpen(true)}>
              View
            </Button>
            {verdicts.length > 0 && (
              <>
                <Chip size="small" color="success" variant="outlined" label={`${passingCount} passing`} />
                {failingCount > 0 && (
                  <Chip size="small" color="error" variant="outlined" label={`${failingCount} failing`} />
                )}
              </>
            )}
          </Box>
        </Paper>

        {jobOrigin === "tests" && outputBlock}

        <Paper
          variant="outlined"
          sx={{
            p: 2,
            mb: 2,
            borderRadius: 2,
            backgroundColor: alpha(theme.palette.info.main, 0.04),
            borderColor: alpha(theme.palette.info.main, 0.3),
          }}
        >
          <Typography variant="subtitle1" sx={{ ...SECTION_HEADING_SX, color: theme.palette.text.primary }}>
            Generate Tests
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "center" }}>
            <TextField
              select
              size="small"
              label="Test level"
              value={testLevel}
              onChange={(e) => setTestLevel(e.target.value as TestLevel)}
              sx={{ width: 190 }}
            >
              {TEST_LEVELS.map((level) => (
                <MenuItem key={level} value={level}>
                  {TEST_LEVEL_LABELS[level]} ({TEST_LEVEL_HINTS[level]})
                </MenuItem>
              ))}
            </TextField>
            <Button variant="contained" disabled={!canSubmit} onClick={handleGenerateTests}>
              Generate
            </Button>
          </Box>
          <TextField
            label="What should the tests focus on? (optional)"
            placeholder="e.g. the vendor onboarding path and the ambiguous-request clarification flow"
            value={testGuidance}
            onChange={(e) => setTestGuidance(e.target.value)}
            size="small"
            fullWidth
            sx={{
              mt: 1,
              "& .MuiInputBase-input": { fontSize: "0.8rem" },
              "& .MuiInputLabel-root": { fontSize: "0.8rem" },
            }}
          />
        </Paper>

        {jobOrigin === "generate" && outputBlock}

        <Paper
          variant="outlined"
          sx={{
            p: 2,
            mb: 2,
            borderRadius: 2,
            backgroundColor: alpha(theme.palette.info.main, 0.04),
            borderColor: alpha(theme.palette.info.main, 0.3),
          }}
        >
          <Typography variant="subtitle1" sx={{ ...SECTION_HEADING_SX, color: theme.palette.text.primary }}>
            Improve Network
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center" }}>
            <TextField
              required
              size="small"
              type="number"
              label="Max iterations"
              value={maxIterations}
              onChange={(e) => setMaxIterations(Math.max(1, Number(e.target.value) || 1))}
              sx={{ width: 120 }}
            />
            <TextField
              required
              size="small"
              label="Success ratio"
              placeholder="3/3"
              value={successRatio}
              onChange={(e) => setSuccessRatio(e.target.value)}
              error={!SUCCESS_RATIO_PATTERN.test(successRatio)}
              helperText={SUCCESS_RATIO_PATTERN.test(successRatio) ? undefined : "Must look like N/M, e.g. 3/3"}
              sx={{ width: 110 }}
            />
            <Button
              variant="contained"
              disabled={!canSubmit || !SUCCESS_RATIO_PATTERN.test(successRatio)}
              onClick={handleImprove}
              sx={{ flexShrink: 1, minWidth: 0 }}
            >
              Improve
            </Button>
          </Box>
          <TextField
            label="What do you want this network to do? (optional)"
            placeholder="e.g. Preserve order lookup, but stop asking for a ZIP code unless the user gives a location"
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            size="small"
            fullWidth
            sx={{
              mt: 1,
              "& .MuiInputBase-input": { fontSize: "0.8rem" },
              "& .MuiInputLabel-root": { fontSize: "0.8rem" },
            }}
          />
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={gitVersions}
                onChange={(e) => setGitVersions(e.target.checked)}
                disabled={!canSubmit}
              />
            }
            label="Save each version to GitHub (requires an active GitHub MCP connection)"
            sx={{ mt: 0.5, "& .MuiFormControlLabel-label": { fontSize: "0.8rem", color: theme.palette.text.secondary } }}
          />
          {gitBranch && (
            <Typography
              variant="caption"
              sx={{ display: "block", fontFamily: "monospace", color: theme.palette.text.secondary, mt: 0.5 }}
            >
              Versions pushed to branch: {gitBranch}
            </Typography>
          )}
        </Paper>

        {jobOrigin === "improve" && outputBlock}
      </Box>

      <Divider sx={{ my: 2 }} />

      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Button variant="outlined" color="error" disabled={!running || stopping} onClick={handleStop}>
          {stopping ? "Stopping..." : "Stop"}
        </Button>
        {running && <CircularProgress size={24} />}
        {jobId && (
          <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
            Job {jobId} -- {running ? "running" : `finished (exit code ${returncode})`} -- see the Logs panel for live output.
          </Typography>
        )}
      </Box>

      <TestFixturesDialog
        open={fixturesDialogOpen}
        onClose={() => {
          setFixturesDialogOpen(false);
          loadFixtures();
        }}
        jobRunning={running}
        results={results}
        onRunFixture={(name) => {
          // Close on the way out so the panel's status footer and counts are visible while it
          // runs; reopening shows the new verdict and, for a failure, its reason.
          setFixturesDialogOpen(false);
          handleRunOne(name);
        }}
        networkName={selectedNetwork}
      />
    </Paper>
  );
};

export default NetworkConsultantPanel;
