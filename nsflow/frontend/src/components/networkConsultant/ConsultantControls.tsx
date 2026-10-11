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

import type { ReactNode } from "react";
import {
  alpha,
  Box,
  Button,
  Chip,
  MenuItem,
  Paper,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";

export type TestLevel = "minimum" | "normal" | "max";

interface ConsultantControlsProps {
  selectedNetwork: string;
  canSubmit: boolean;
  fixtureCount: number;
  passingCount: number;
  failingCount: number;
  testsOutput: ReactNode;
  generateOutput: ReactNode;
  improveOutput: ReactNode;
  testLevel: TestLevel;
  testGuidance: string;
  maxIterations: number;
  successRatio: string;
  direction: string;
  onViewTests: () => void;
  onRunAll: () => void;
  onGenerate: () => void;
  onImprove: () => void;
  onTestLevelChange: (level: TestLevel) => void;
  onTestGuidanceChange: (guidance: string) => void;
  onMaxIterationsChange: (iterations: number) => void;
  onSuccessRatioChange: (ratio: string) => void;
  onDirectionChange: (direction: string) => void;
}

const TEST_LEVELS: TestLevel[] = ["minimum", "normal", "max"];
const TEST_LEVEL_HINTS: Record<TestLevel, string> = { minimum: "2-3", normal: "5-7", max: "10-15" };
const TEST_LEVEL_LABELS: Record<TestLevel, string> = { minimum: "minimum", normal: "normal", max: "maximum" };
const SUCCESS_RATIO_PATTERN = /^\d+\/\d+$/;
const SECTION_HEADING_SX = { fontWeight: 600, mb: 2 };

const ConsultantControls = ({
  selectedNetwork,
  canSubmit,
  fixtureCount,
  passingCount,
  failingCount,
  testsOutput,
  generateOutput,
  improveOutput,
  testLevel,
  testGuidance,
  maxIterations,
  successRatio,
  direction,
  onViewTests,
  onRunAll,
  onGenerate,
  onImprove,
  onTestLevelChange,
  onTestGuidanceChange,
  onMaxIterationsChange,
  onSuccessRatioChange,
  onDirectionChange,
}: ConsultantControlsProps) => {
  const theme = useTheme();
  const cardSx = {
    p: 2,
    mb: 2,
    borderRadius: 2,
    backgroundColor: alpha(theme.palette.info.main, 0.04),
    borderColor: alpha(theme.palette.info.main, 0.3),
  };
  const ratioValid = SUCCESS_RATIO_PATTERN.test(successRatio);
  return (
    <>
      <Paper variant="outlined" sx={cardSx}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, ...SECTION_HEADING_SX }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>Tests</Typography>
          {fixtureCount > 0 && <Chip size="small" color="primary" label={fixtureCount} />}
        </Box>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center" }}>
          <Button variant="contained" disabled={!canSubmit || !fixtureCount} onClick={onRunAll}>Run all</Button>
          <Button variant="contained" disabled={!selectedNetwork} onClick={onViewTests}>View</Button>
          {passingCount + failingCount > 0 && (
            <>
              <Chip size="small" color="success" variant="outlined" label={`${passingCount} passing`} />
              {failingCount > 0 && (
                <Chip size="small" color="error" variant="outlined" label={`${failingCount} failing`} />
              )}
            </>
          )}
        </Box>
      </Paper>
      {testsOutput}

      <Paper variant="outlined" sx={cardSx}>
        <Typography variant="subtitle1" sx={{ ...SECTION_HEADING_SX, color: theme.palette.text.primary }}>
          Generate Tests
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "center" }}>
          <TextField
            select
            size="small"
            label="Test level"
            value={testLevel}
            onChange={(event) => onTestLevelChange(event.target.value as TestLevel)}
            sx={{ width: 190 }}
          >
            {TEST_LEVELS.map((level) => (
              <MenuItem key={level} value={level}>
                {TEST_LEVEL_LABELS[level]} ({TEST_LEVEL_HINTS[level]})
              </MenuItem>
            ))}
          </TextField>
          <Button variant="contained" disabled={!canSubmit} onClick={onGenerate}>Generate</Button>
        </Box>
        <TextField
          label="What should the tests focus on? (optional)"
          placeholder="e.g. the vendor onboarding path and the ambiguous-request clarification flow"
          value={testGuidance}
          onChange={(event) => onTestGuidanceChange(event.target.value)}
          size="small"
          fullWidth
          sx={{ mt: 1, "& .MuiInputBase-input": { fontSize: "0.8rem" }, "& .MuiInputLabel-root": { fontSize: "0.8rem" } }}
        />
      </Paper>
      {generateOutput}

      <Paper variant="outlined" sx={cardSx}>
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
            onChange={(event) => onMaxIterationsChange(Math.max(1, Number(event.target.value) || 1))}
            sx={{ width: 120 }}
          />
          <TextField
            required
            size="small"
            label="Success ratio"
            placeholder="3/3"
            value={successRatio}
            onChange={(event) => onSuccessRatioChange(event.target.value)}
            error={!ratioValid}
            helperText={ratioValid ? undefined : "Must look like N/M, e.g. 3/3"}
            sx={{ width: 110 }}
          />
          <Button
            variant="contained"
            disabled={!canSubmit || !ratioValid}
            onClick={onImprove}
            sx={{ flexShrink: 1, minWidth: 0 }}
          >
            Improve
          </Button>
        </Box>
        <TextField
          label="What do you want this network to do? (optional)"
          placeholder="e.g. Preserve order lookup, but stop asking for a ZIP code unless the user gives a location"
          value={direction}
          onChange={(event) => onDirectionChange(event.target.value)}
          size="small"
          fullWidth
          sx={{ mt: 1, "& .MuiInputBase-input": { fontSize: "0.8rem" }, "& .MuiInputLabel-root": { fontSize: "0.8rem" } }}
        />
      </Paper>
      {improveOutput}
    </>
  );
};

export default ConsultantControls;
