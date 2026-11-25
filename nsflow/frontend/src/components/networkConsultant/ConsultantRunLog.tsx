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

import { Box, Paper, Typography, useTheme } from "@mui/material";

const ConsultantRunLog = ({ content }: { content: string }) => {
  const theme = useTheme();
  if (!content) return null;

  return (
    <Paper component="details" variant="outlined" sx={{ mb: 2, borderRadius: 2 }}>
      <Box component="summary" sx={{ p: 1.5, cursor: "pointer" }}>
        <Typography component="span" variant="subtitle2" sx={{ fontWeight: 600 }}>
          Run log
        </Typography>
      </Box>
      <Box
        component="pre"
        aria-label="Persisted run log"
        sx={{
          m: 0,
          p: 1.5,
          maxHeight: 320,
          overflow: "auto",
          borderTop: `1px solid ${theme.palette.divider}`,
          backgroundColor: theme.palette.background.default,
          color: theme.palette.text.secondary,
          fontSize: "0.75rem",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {content}
      </Box>
    </Paper>
  );
};

export default ConsultantRunLog;
