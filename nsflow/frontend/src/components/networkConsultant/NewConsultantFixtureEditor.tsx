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

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  alpha,
  Box,
  Button,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";

import InteractionsEditor from "./InteractionsEditor";
import { SUCCESS_RATIO_PATTERN } from "../../state/networkConsultantFixtures";
import type { DraftFixture } from "../../state/networkConsultantFixtures";

interface NewConsultantFixtureEditorProps {
  draft: DraftFixture;
  errors: string[];
  creating: boolean;
  slyDataKeys: string[];
  onChange: (draft: DraftFixture) => void;
  onCreate: () => void;
  onCancel: () => void;
}

const NewConsultantFixtureEditor = ({
  draft,
  errors,
  creating,
  slyDataKeys,
  onChange,
  onCreate,
  onCancel,
}: NewConsultantFixtureEditorProps) => {
  const theme = useTheme();
  const ratioValid = SUCCESS_RATIO_PATTERN.test(draft.successRatio);
  return (
    <Accordion
      expanded
      variant="outlined"
      sx={{
        mb: 1,
        backgroundColor: alpha(theme.palette.success.main, 0.08),
        borderColor: alpha(theme.palette.success.main, 0.3),
        "&:before": { display: "none" },
      }}
    >
      <AccordionSummary>
        <Typography sx={{ fontWeight: 600, color: theme.palette.text.primary }}>New Test</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Box sx={{ display: "flex", gap: 2 }}>
            <TextField
              label="File Name"
              size="small"
              autoFocus
              placeholder="my_new_test"
              value={draft.fileName}
              onChange={(event) => onChange({ ...draft, fileName: event.target.value })}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Success Ratio"
              size="small"
              value={draft.successRatio}
              error={!ratioValid}
              helperText={ratioValid ? "" : "N/M, e.g. 1/1"}
              onChange={(event) => onChange({ ...draft, successRatio: event.target.value })}
              sx={{ width: 130 }}
            />
          </Box>
          <InteractionsEditor
            interactions={draft.interactions}
            onChange={(interactions) => onChange({ ...draft, interactions })}
            slyDataKeys={slyDataKeys}
          />
          {errors.length > 0 && (
            <Alert severity="error">
              {errors.map((message, index) => <div key={index}>{message}</div>)}
            </Alert>
          )}
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button variant="contained" size="small" disabled={creating} onClick={onCreate}>
              {creating ? "Creating..." : "Create"}
            </Button>
            <Button size="small" disabled={creating} onClick={onCancel}>Cancel</Button>
          </Box>
        </Box>
      </AccordionDetails>
    </Accordion>
  );
};

export default NewConsultantFixtureEditor;
