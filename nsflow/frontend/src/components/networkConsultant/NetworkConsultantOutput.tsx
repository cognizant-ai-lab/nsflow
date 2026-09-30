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

import { useState } from "react";
import { Box, Chip, CircularProgress, Paper, Typography, alpha, useTheme } from "@mui/material";

import type { FixtureResult } from "../../types/networkConsultant";

interface NetworkConsultantOutputProps {
  failures: FixtureResult[];
  progressChart: string | null;
  running: boolean;
}

const failureSummary = (message?: string | null): string => {
  if (!message) return "";
  const afterCriteria = message.split(/acceptance_criteria:\s*/i)[1];
  const lines = (afterCriteria ?? message).split("\n").map((line) => line.trim());
  return lines.find((line) => line && !/^False is not true/i.test(line)) ?? "";
};

const NetworkConsultantOutput = ({ failures, progressChart, running }: NetworkConsultantOutputProps) => {
  const theme = useTheme();
  const [openFailure, setOpenFailure] = useState<string | null>(null);
  const soleFailure = failures.length === 1 ? failures[0].fixture : null;

  return (
    <>
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
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
              Failing tests
            </Typography>
            <Chip size="small" color="error" label={failures.length} />
          </Box>
          <Box sx={{ maxHeight: 260, overflowY: "auto" }}>
            {failures.map((result) => {
              const isOpen = openFailure === result.fixture || soleFailure === result.fixture;
              const accent = result.infrastructure_error ? theme.palette.warning.main : theme.palette.error.main;
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
                      <Typography variant="caption" noWrap sx={{ display: "block", color: theme.palette.text.secondary }}>
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
};

export default NetworkConsultantOutput;
