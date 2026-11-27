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

import { alpha, Box, Button, Paper, TextField, Typography, useTheme } from "@mui/material";

interface ConsultantJobMessagesProps {
  pendingQuestion: string | null;
  answerText: string;
  submittingAnswer: boolean;
  ungrounded: string[];
  toolIssues: string[];
  onAnswerChange: (answer: string) => void;
  onSubmitAnswer: () => void;
}

const ConsultantJobMessages = ({
  pendingQuestion,
  answerText,
  submittingAnswer,
  ungrounded,
  toolIssues,
  onAnswerChange,
  onSubmitAnswer,
}: ConsultantJobMessagesProps) => {
  const theme = useTheme();
  return (
    <>
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
              onChange={(event) => onAnswerChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  onSubmitAnswer();
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
              onClick={onSubmitAnswer}
              sx={{ whiteSpace: "nowrap" }}
            >
              {submittingAnswer ? "Sending..." : "Send Answer"}
            </Button>
          </Box>
        </Paper>
      )}
      {ungrounded.length > 0 && (
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
            These criteria ask for facts no tool in this network can supply -- the tool it depends on returns no
            data. No instruction change can satisfy them: wire up the data source, or remove the criteria.
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
    </>
  );
};

export default ConsultantJobMessages;
