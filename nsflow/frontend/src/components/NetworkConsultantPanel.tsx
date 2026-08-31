
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
  FormControlLabel,
  Divider,
  useTheme,
  alpha,
} from "@mui/material";
import { useApiPort } from "../context/ApiPortContext";
import { useChatContext } from "../context/ChatContext";
import TestFixturesDialog from "./TestFixturesDialog";

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

const NetworkConsultantPanel = ({ selectedNetwork }: { selectedNetwork: string }) => {
  const { apiUrl } = useApiPort();
  const { sessionId } = useChatContext();
  const theme = useTheme();

  const [direction, setDirection] = useState("");
  const [testLevel, setTestLevel] = useState<TestLevel>("normal");
  const [maxIterations, setMaxIterations] = useState(DEFAULT_MAX_ITERATIONS);
  const [successRatio, setSuccessRatio] = useState("3/3");
  const [gitVersions, setGitVersions] = useState(false);
  const [fixturesDialogOpen, setFixturesDialogOpen] = useState(false);

  const [jobId, setJobId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [returncode, setReturncode] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [toolIssues, setToolIssues] = useState<string[]>([]);
  const [progressChart, setProgressChart] = useState<string | null>(null);
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => stopPolling, []);

  // A chart belongs to one network. Preserve it between Generate and Improve for that network,
  // but never let it linger after the user selects a different one.
  useEffect(() => setProgressChart(null), [selectedNetwork]);

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
        if (data.progress_chart) setProgressChart(data.progress_chart);
        setGitBranch(data.git_branch ?? null);
        if (!data.running) stopPolling();
      } catch (err: any) {
        setError(err.message);
        stopPolling();
      }
    }, POLL_INTERVAL_MS);
  };

  const startJob = async (endpoint: string, body: Record<string, unknown>) => {
    setError(null);
    setReturncode(null);
    setJobId(null);
    setPendingQuestion(null);
    setAnswerText("");
    setToolIssues([]);
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
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleGenerateTests = () =>
    startJob("generate-tests", { network_name: selectedNetwork, test_level: testLevel });

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
    } catch (err: any) {
      setError(err.message);
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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setStopping(false);
    }
  };

  const canSubmit = Boolean(selectedNetwork) && !running;

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
            <Button
              variant="contained"
              disabled={!selectedNetwork}
              onClick={() => setFixturesDialogOpen(true)}
            >
              View
            </Button>
          </Box>
        </Paper>

        <Paper
          variant="outlined"
          sx={{
            p: 2,
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

        <Paper
          variant="outlined"
          sx={{
            p: 2,
            mt: 2,
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
        onClose={() => setFixturesDialogOpen(false)}
        networkName={selectedNetwork}
      />
    </Paper>
  );
};

export default NetworkConsultantPanel;
