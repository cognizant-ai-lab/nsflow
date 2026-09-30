
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

import { useState } from "react";
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
import { useConsultantFixtures } from "../hooks/useConsultantFixtures";
import { useNetworkConsultantJob } from "../hooks/useNetworkConsultantJob";
import type { ConsultantEndpoint, ConsultantJobOrigin, FixtureResult } from "../types/networkConsultant";
import NetworkConsultantOutput from "./networkConsultant/NetworkConsultantOutput";
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

const NetworkConsultantPanel = ({ selectedNetwork }: { selectedNetwork: string }) => {
  const { apiUrl } = useApiPort();
  const { sessionId } = useChatContext();
  const theme = useTheme();

  const [direction, setDirection] = useState("");
  const [testLevel, setTestLevel] = useState<TestLevel>("normal");
  const [maxIterations, setMaxIterations] = useState(DEFAULT_MAX_ITERATIONS);
  const [successRatio, setSuccessRatio] = useState("3/3");
  const [gitVersions, setGitVersions] = useState(false);
  const [testGuidance, setTestGuidance] = useState("");
  const [fixturesDialogOpen, setFixturesDialogOpen] = useState(false);
  const [answerText, setAnswerText] = useState("");
  const { fixtureNames, fixtureError, refresh: refreshFixtures } = useConsultantFixtures(apiUrl, selectedNetwork);
  const {
    jobId,
    jobOrigin,
    running,
    returncode,
    error: jobError,
    pendingQuestion,
    toolIssues,
    ungrounded,
    progressChart,
    gitBranch,
    results,
    submittingAnswer,
    stopping,
    start,
    submitAnswer,
    stop,
  } = useNetworkConsultantJob({
    apiUrl,
    networkName: selectedNetwork,
    sessionId,
    themeMode: theme.palette.mode,
    onFinished: refreshFixtures,
  });
  const error = jobError ?? fixtureError;

  const startJob = (
    endpoint: ConsultantEndpoint,
    origin: ConsultantJobOrigin,
    body: Record<string, unknown>,
  ) => {
    setAnswerText("");
    return start(endpoint, origin, body);
  };

  const handleGenerateTests = () =>
    startJob("generate-tests", "generate", {
      network_name: selectedNetwork,
      test_level: testLevel,
      test_guidance: testGuidance,
    });

  const handleRunAll = () => startJob("run-tests", "tests", { network_name: selectedNetwork });

  const handleRunOne = (fixtureName: string) =>
    startJob("run-tests", "tests", { network_name: selectedNetwork, fixture_name: fixtureName });

  const handleImprove = () =>
    startJob("improve", "improve", {
      network_name: selectedNetwork,
      direction,
      test_level: testLevel,
      max_iterations: maxIterations,
      success_ratio: successRatio,
      git_versions: gitVersions,
    });

  const handleSubmitAnswer = async () => {
    if (await submitAnswer(answerText)) setAnswerText("");
  };

  const canSubmit = Boolean(selectedNetwork) && !running;

  const verdicts = fixtureNames.map((name) => results[name]).filter(Boolean) as FixtureResult[];
  const passingCount = verdicts.filter((r) => r.passed).length;
  const failingCount = verdicts.length - passingCount;
  const failures = verdicts.filter((r) => !r.passed);
  const outputBlock = jobOrigin && (
    <NetworkConsultantOutput
      key={`${selectedNetwork}:${jobOrigin}:${jobId ?? "pending"}`}
      failures={failures}
      progressChart={progressChart}
      running={running}
    />
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
        <Button variant="outlined" color="error" disabled={!running || stopping} onClick={stop}>
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
          void refreshFixtures();
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
