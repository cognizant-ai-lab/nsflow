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
  ContentCopy as CopyIcon,
  Delete as DeleteIcon,
  ErrorOutlined as FailIcon,
  ExpandMore as ExpandMoreIcon,
  CheckCircleOutlined as PassIcon,
  PlayArrow as RunIcon,
  ReportProblemOutlined as InfraIcon,
} from "@mui/icons-material";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  alpha,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";

import InteractionsEditor from "./InteractionsEditor";
import { formatCheckTypeLabel, SUCCESS_RATIO_PATTERN } from "../../state/networkConsultantFixtures";
import type { DraftFixture } from "../../state/networkConsultantFixtures";
import type { ConsultantFixture, FixtureResult } from "../../types/networkConsultant";
import type { ViewableFile } from "../FileViewerDialog";

interface ConsultantFixtureCardProps {
  fixture: ConsultantFixture;
  result?: FixtureResult;
  draft?: DraftFixture;
  isEditing: boolean;
  defaultExpanded: boolean;
  errors: string[];
  saving: boolean;
  duplicating: boolean;
  deleting: boolean;
  jobRunning?: boolean;
  slyDataKeys: string[];
  onRun?: (fixtureName: string) => void;
  onDuplicate: (fixture: ConsultantFixture) => void;
  onDelete: (fixture: ConsultantFixture) => void;
  onSave: (fixture: ConsultantFixture) => void;
  onCancel: (fixtureName: string) => void;
  onDraftChange: (fixtureName: string, updater: (draft: DraftFixture) => DraftFixture) => void;
  onViewRaw: (file: ViewableFile) => void;
}

const CheckValue = ({ value }: { value: unknown }) => {
  const theme = useTheme();
  if (Array.isArray(value)) {
    return (
      <Box component="ul" sx={{ m: 0, pl: 4 }}>
        {value.map((item, index) => (
          <Typography key={index} component="li" variant="body2" sx={{ color: theme.palette.text.primary }}>
            {String(item)}
          </Typography>
        ))}
      </Box>
    );
  }
  return (
    <Typography variant="body2" sx={{ color: theme.palette.text.primary }}>
      {String(value)}
    </Typography>
  );
};

const ConsultantFixtureCard = ({
  fixture,
  result,
  draft,
  isEditing,
  defaultExpanded,
  errors,
  saving,
  duplicating,
  deleting,
  jobRunning,
  slyDataKeys,
  onRun,
  onDuplicate,
  onDelete,
  onSave,
  onCancel,
  onDraftChange,
  onViewRaw,
}: ConsultantFixtureCardProps) => {
  const theme = useTheme();
  const ratioValid = !draft || SUCCESS_RATIO_PATTERN.test(draft.successRatio);
  const viewRaw = () =>
    onViewRaw({
      file: new File([fixture.raw_hocon], fixture.name, { type: "text/plain" }),
      content: fixture.raw_hocon,
    });

  return (
    <Accordion
      variant="outlined"
      defaultExpanded={defaultExpanded}
      sx={{
        mb: 1,
        backgroundColor: alpha(theme.palette.info.main, 0.08),
        borderColor: alpha(theme.palette.info.main, 0.3),
        "&:before": { display: "none" },
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", width: "100%" }}>
          {!(isEditing && draft) && result &&
            (result.infrastructure_error ? (
              <InfraIcon fontSize="small" color="warning" titleAccess="Could not reach a verdict" />
            ) : result.passed ? (
              <PassIcon fontSize="small" color="success" titleAccess="Passing" />
            ) : (
              <FailIcon fontSize="small" color="error" titleAccess="Failing" />
            ))}
          {!(isEditing && draft) && (
            <Typography sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
              {fixture.name.replace(/\.hocon$/, "")}
            </Typography>
          )}
          {isEditing && draft ? (
            <>
              <TextField
                size="small"
                label="File Name"
                value={draft.fileName}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) =>
                  onDraftChange(fixture.name, (current) => ({ ...current, fileName: event.target.value }))
                }
                sx={{ width: 220 }}
              />
              <TextField
                size="small"
                label="Success Ratio"
                value={draft.successRatio}
                error={!ratioValid}
                helperText={ratioValid ? "" : "N/M, e.g. 1/1"}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) =>
                  onDraftChange(fixture.name, (current) => ({ ...current, successRatio: event.target.value }))
                }
                sx={{ width: 130 }}
              />
            </>
          ) : (
            fixture.success_ratio && <Chip size="small" color="primary" label={fixture.success_ratio} />
          )}
          <Box sx={{ flexGrow: 1 }} />
          {onRun && !fixture.parse_error && (
            <IconButton
              size="small"
              color="primary"
              title={jobRunning ? "A run is already in progress" : "Run just this test"}
              disabled={jobRunning}
              onClick={(event) => {
                event.stopPropagation();
                onRun(fixture.name);
              }}
            >
              <RunIcon fontSize="small" />
            </IconButton>
          )}
          {!fixture.parse_error && (
            <IconButton
              size="small"
              title="Duplicate this test"
              disabled={duplicating}
              onClick={(event) => {
                event.stopPropagation();
                onDuplicate(fixture);
              }}
            >
              <CopyIcon fontSize="small" />
            </IconButton>
          )}
          <IconButton
            size="small"
            title="Delete this test"
            disabled={deleting}
            onClick={(event) => {
              event.stopPropagation();
              onDelete(fixture);
            }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        {result && !result.passed && result.message && (
          <Alert
            severity={result.infrastructure_error ? "warning" : "error"}
            sx={{ mb: 2, "& .MuiAlert-message": { overflow: "hidden" } }}
          >
            <Box
              component="pre"
              sx={{ m: 0, fontSize: "0.72rem", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 220,
                overflowY: "auto" }}
            >
              {result.message}
            </Box>
          </Alert>
        )}
        {fixture.parse_error ? (
          <>
            <Alert severity="warning" sx={{ mb: 1 }}>
              Could not parse this fixture: {fixture.parse_error}
            </Alert>
            <Button size="small" onClick={viewRaw}>View raw HOCON</Button>
          </>
        ) : isEditing && draft ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <InteractionsEditor
              interactions={draft.interactions}
              onChange={(next) =>
                onDraftChange(fixture.name, (current) => ({ ...current, interactions: next }))
              }
              slyDataKeys={slyDataKeys}
            />
            {errors.length > 0 && (
              <Alert severity="error">
                {errors.map((message, index) => <div key={index}>{message}</div>)}
              </Alert>
            )}
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button variant="contained" size="small" disabled={!ratioValid || saving} onClick={() => onSave(fixture)}>
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button size="small" disabled={saving} onClick={() => onCancel(fixture.name)}>Cancel</Button>
              <Button size="small" onClick={viewRaw}>View raw HOCON</Button>
            </Box>
          </Box>
        ) : (
          <>
            {fixture.interactions.map((interaction, index) => (
              <Box key={index} sx={{ mb: index < fixture.interactions.length - 1 ? 2 : 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
                  Question:
                </Typography>
                <Typography variant="body2" sx={{ mb: 1, color: theme.palette.text.primary }}>
                  {interaction.text}
                </Typography>
                {Object.keys(interaction.response_checks).length > 0 && (
                  <Typography variant="body2" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
                    Expected Response:
                  </Typography>
                )}
                {Object.entries(interaction.response_checks).map(([checkType, checkValue]) => (
                  <Box
                    key={checkType}
                    sx={
                      Array.isArray(checkValue)
                        ? { mb: 0.5 }
                        : { display: "flex", gap: 0.5, alignItems: "flex-start", mb: 0.5 }
                    }
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
                      {formatCheckTypeLabel(checkType)} -
                    </Typography>
                    <CheckValue value={checkValue} />
                  </Box>
                ))}
                {index < fixture.interactions.length - 1 && <Divider sx={{ mt: 2 }} />}
              </Box>
            ))}
            <Button size="small" sx={{ mt: 1 }} onClick={viewRaw}>View raw HOCON</Button>
          </>
        )}
      </AccordionDetails>
    </Accordion>
  );
};

export default ConsultantFixtureCard;
