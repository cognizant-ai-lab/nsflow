
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
  Button,
  Paper,
  Alert,
  CircularProgress,
  Divider,
  useTheme,
} from "@mui/material";
import { useApiPort } from "../context/ApiPortContext";
import { useChatContext } from "../context/ChatContext";
import { useConsultantFixtures } from "../hooks/useConsultantFixtures";
import { useNetworkConsultantJob } from "../hooks/useNetworkConsultantJob";
import type { ConsultantEndpoint, ConsultantJobOrigin, FixtureResult } from "../types/networkConsultant";
import ConsultantControls from "./networkConsultant/ConsultantControls";
import type { TestLevel } from "./networkConsultant/ConsultantControls";
import ConsultantJobMessages from "./networkConsultant/ConsultantJobMessages";
import NetworkConsultantOutput from "./networkConsultant/NetworkConsultantOutput";
import TestFixturesDialog from "./TestFixturesDialog";

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
  const [testGuidance, setTestGuidance] = useState("");
  const [fixturesDialogOpen, setFixturesDialogOpen] = useState(false);
  const [answerText, setAnswerText] = useState("");
  const { fixtureNames, fixtureError, refresh: refreshFixtures } = useConsultantFixtures(apiUrl, selectedNetwork);
  const {
    jobId,
    jobOrigin,
    busy,
    running,
    returncode,
    error: jobError,
    pendingQuestion,
    toolIssues,
    ungrounded,
    progressChart,
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
    });

  const handleSubmitAnswer = async () => {
    if (await submitAnswer(answerText)) setAnswerText("");
  };

  const canSubmit = Boolean(selectedNetwork) && !busy;

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
        <ConsultantJobMessages
          pendingQuestion={pendingQuestion}
          answerText={answerText}
          submittingAnswer={submittingAnswer}
          ungrounded={ungrounded}
          toolIssues={toolIssues}
          onAnswerChange={setAnswerText}
          onSubmitAnswer={handleSubmitAnswer}
        />

        <ConsultantControls
          selectedNetwork={selectedNetwork}
          canSubmit={canSubmit}
          fixtureCount={fixtureNames.length}
          passingCount={passingCount}
          failingCount={failingCount}
          testsOutput={jobOrigin === "tests" ? outputBlock : null}
          generateOutput={jobOrigin === "generate" ? outputBlock : null}
          improveOutput={jobOrigin === "improve" ? outputBlock : null}
          testLevel={testLevel}
          testGuidance={testGuidance}
          maxIterations={maxIterations}
          successRatio={successRatio}
          direction={direction}
          onViewTests={() => setFixturesDialogOpen(true)}
          onRunAll={handleRunAll}
          onGenerate={handleGenerateTests}
          onImprove={handleImprove}
          onTestLevelChange={setTestLevel}
          onTestGuidanceChange={setTestGuidance}
          onMaxIterationsChange={setMaxIterations}
          onSuccessRatioChange={setSuccessRatio}
          onDirectionChange={setDirection}
        />
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
        jobRunning={busy}
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
