
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
  Divider,
  useTheme,
  alpha,
} from "@mui/material";
import { useApiPort } from "../context/ApiPortContext";
import { useChatContext } from "../context/ChatContext";

const TEST_LEVELS = ["minimum", "normal", "max"] as const;
type TestLevel = (typeof TEST_LEVELS)[number];

// Matches the backend's ImproveNetworkRequest.success_ratio pattern (^\d+/\d+$).
const SUCCESS_RATIO_PATTERN = /^\d+\/\d+$/;

// Polling cadence while a job is running -- fast enough to feel live, cheap enough not to
// hammer the backend since a run can take many minutes.
const POLL_INTERVAL_MS = 2000;

const NetworkConsultantPanel = ({ selectedNetwork }: { selectedNetwork: string }) => {
  const { apiUrl } = useApiPort();
  const { sessionId } = useChatContext();
  const theme = useTheme();

  const [direction, setDirection] = useState("");
  const [testLevel, setTestLevel] = useState<TestLevel>("normal");
  const [maxIterations, setMaxIterations] = useState(20);
  const [successRatio, setSuccessRatio] = useState("3/3");

  const [jobId, setJobId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [returncode, setReturncode] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [toolIssues, setToolIssues] = useState<string[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => stopPolling, []);

  const pollJob = (id: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${apiUrl}/api/v1/network_consultant/jobs/${id}`);
        if (!res.ok) throw new Error(`Status check failed (${res.status})`);
        const data = await res.json();
        setRunning(data.running);
        setReturncode(data.returncode);
        setPendingQuestion(data.pending_question ?? null);
        setToolIssues(data.tool_issues ?? []);
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
          <Typography variant="subtitle1" sx={{ fontWeight: 600, color: theme.palette.text.primary, mb: 1 }}>
            Generate Tests
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary, mb: 2 }}>
            Generate ANTeGen test fixtures for this network. No fix loop is run.
          </Typography>
          <TextField
            select
            label="Test level"
            value={testLevel}
            onChange={(e) => setTestLevel(e.target.value as TestLevel)}
            helperText="Also used by Improve Agent Network below."
            sx={{ minWidth: 160, mb: 2 }}
          >
            {TEST_LEVELS.map((level) => (
              <MenuItem key={level} value={level}>
                {level}
              </MenuItem>
            ))}
          </TextField>
          <Box>
            <Button variant="outlined" disabled={!canSubmit} onClick={handleGenerateTests}>
              Generate Tests
            </Button>
          </Box>
        </Paper>

        <Paper
          variant="outlined"
          sx={{
            p: 2,
            borderRadius: 2,
            backgroundColor: alpha(theme.palette.secondary.main, 0.04),
            borderColor: alpha(theme.palette.secondary.main, 0.3),
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 600, color: theme.palette.text.primary, mb: 1 }}>
            Self Improvement
          </Typography>
          <TextField
            label="What do you want this network to do?"
            placeholder="e.g. Preserve order lookup, but stop asking for a ZIP code unless the user gives a location"
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            multiline
            minRows={3}
            fullWidth
            sx={{ mb: 2 }}
          />
          <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
            <TextField
              type="number"
              label="Max iterations"
              value={maxIterations}
              onChange={(e) => setMaxIterations(Math.max(1, Number(e.target.value) || 1))}
              sx={{ minWidth: 160 }}
            />
            <TextField
              label="Success ratio"
              placeholder="3/3"
              value={successRatio}
              onChange={(e) => setSuccessRatio(e.target.value)}
              error={!SUCCESS_RATIO_PATTERN.test(successRatio)}
              helperText={SUCCESS_RATIO_PATTERN.test(successRatio) ? " " : "Must look like N/M, e.g. 3/3"}
              sx={{ minWidth: 160 }}
            />
          </Box>
          <Button
            variant="contained"
            disabled={!canSubmit || !direction.trim() || !SUCCESS_RATIO_PATTERN.test(successRatio)}
            onClick={handleImprove}
          >
            Improve Agent Network
          </Button>
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
    </Paper>
  );
};

export default NetworkConsultantPanel;
