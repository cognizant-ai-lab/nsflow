
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
  useTheme,
  alpha,
} from "@mui/material";
import { useApiPort } from "../context/ApiPortContext";

const TEST_LEVELS = ["minimum", "normal", "max"] as const;
type TestLevel = (typeof TEST_LEVELS)[number];

// Matches the backend's ImproveNetworkRequest.success_ratio pattern (^\d+/\d+$).
const SUCCESS_RATIO_PATTERN = /^\d+\/\d+$/;

// Polling cadence while a job is running -- fast enough to feel live, cheap enough not to
// hammer the backend since a run can take many minutes.
const POLL_INTERVAL_MS = 2000;

const NetworkConsultantPanel = ({ selectedNetwork }: { selectedNetwork: string }) => {
  const { apiUrl } = useApiPort();
  const theme = useTheme();

  const [direction, setDirection] = useState("");
  const [testLevel, setTestLevel] = useState<TestLevel>("normal");
  const [maxIterations, setMaxIterations] = useState(20);
  const [successRatio, setSuccessRatio] = useState("3/3");

  const [jobId, setJobId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [returncode, setReturncode] = useState<number | null>(null);
  const [logTail, setLogTail] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => stopPolling, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [logTail]);

  const pollJob = (id: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${apiUrl}/api/v1/network_consultant/jobs/${id}`);
        if (!res.ok) throw new Error(`Status check failed (${res.status})`);
        const data = await res.json();
        setRunning(data.running);
        setReturncode(data.returncode);
        setLogTail(data.log_tail ?? []);
        if (!data.running) stopPolling();
      } catch (err: any) {
        setError(err.message);
        stopPolling();
      }
    }, POLL_INTERVAL_MS);
  };

  const startJob = async (endpoint: string, body: Record<string, unknown>) => {
    setError(null);
    setLogTail([]);
    setReturncode(null);
    setJobId(null);
    try {
      const res = await fetch(`${apiUrl}/api/v1/network_consultant/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

      <TextField
        label="What do you want this network to do? (direction for Improve Agent Network)"
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
          select
          label="Test level"
          value={testLevel}
          onChange={(e) => setTestLevel(e.target.value as TestLevel)}
          sx={{ minWidth: 160 }}
        >
          {TEST_LEVELS.map((level) => (
            <MenuItem key={level} value={level}>
              {level}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          type="number"
          label="Max iterations"
          value={maxIterations}
          onChange={(e) => setMaxIterations(Math.max(1, Number(e.target.value) || 1))}
          sx={{ minWidth: 160 }}
        />
        <TextField
          label="Success ratio (Improve only)"
          placeholder="3/3"
          value={successRatio}
          onChange={(e) => setSuccessRatio(e.target.value)}
          error={!SUCCESS_RATIO_PATTERN.test(successRatio)}
          helperText={SUCCESS_RATIO_PATTERN.test(successRatio) ? " " : "Must look like N/M, e.g. 3/3"}
          sx={{ minWidth: 160 }}
        />
      </Box>

      <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
        <Button variant="outlined" disabled={!canSubmit} onClick={handleGenerateTests}>
          Generate Tests
        </Button>
        <Button
          variant="contained"
          disabled={!canSubmit || !direction.trim() || !SUCCESS_RATIO_PATTERN.test(successRatio)}
          onClick={handleImprove}
        >
          Improve Agent Network
        </Button>
        <Button
          variant="outlined"
          color="error"
          disabled={!running || stopping}
          onClick={handleStop}
        >
          {stopping ? "Stopping..." : "Stop"}
        </Button>
        {running && <CircularProgress size={24} sx={{ alignSelf: "center" }} />}
      </Box>

      {jobId && (
        <Typography variant="caption" sx={{ color: theme.palette.text.secondary, mb: 1 }}>
          Job {jobId} -- {running ? "running" : `finished (exit code ${returncode})`}
        </Typography>
      )}

      <Box
        sx={{
          flexGrow: 1,
          overflow: "auto",
          backgroundColor: alpha(theme.palette.background.default, 0.5),
          borderRadius: 1,
          p: 1,
          fontFamily: "monospace",
          fontSize: "0.75rem",
          whiteSpace: "pre-wrap",
        }}
      >
        {logTail.length > 0 ? (
          logTail.map((line, index) => <div key={index}>{line}</div>)
        ) : (
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary, fontStyle: "italic" }}>
            No job run yet.
          </Typography>
        )}
        <div ref={logEndRef} />
      </Box>
    </Paper>
  );
};

export default NetworkConsultantPanel;
