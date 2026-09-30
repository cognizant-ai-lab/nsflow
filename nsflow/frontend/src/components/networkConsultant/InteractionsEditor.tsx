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

import { Add as AddIcon, Delete as DeleteIcon } from "@mui/icons-material";
import { Box, Button, Divider, IconButton, MenuItem, TextField, Typography, useTheme } from "@mui/material";

import {
  emptyInteraction,
  formatCheckTypeLabel,
  newDraftId,
  NUMERIC_CHECK_TYPES,
  STOCK_TEST_KEYS,
} from "../../state/networkConsultantFixtures";
import type { DraftInteraction } from "../../state/networkConsultantFixtures";

interface InteractionsEditorProps {
  interactions: DraftInteraction[];
  onChange: (next: DraftInteraction[]) => void;
  slyDataKeys: string[];
}

const InteractionsEditor = ({ interactions, onChange, slyDataKeys }: InteractionsEditorProps) => {
  const theme = useTheme();
  const updateOne = (id: string, updater: (interaction: DraftInteraction) => DraftInteraction) =>
    onChange(interactions.map((interaction) => (interaction.id === id ? updater(interaction) : interaction)));

  return (
    <>
      {interactions.map((interaction, index) => (
        <Box key={interaction.id} sx={{ p: 2, borderRadius: 1, border: `1px solid ${theme.palette.divider}` }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: theme.palette.text.primary, flexGrow: 1 }}>
              Turn {index + 1}
            </Typography>
            <IconButton
              size="small"
              title="Remove this turn"
              disabled={interactions.length <= 1}
              onClick={() => onChange(interactions.filter((item) => item.id !== interaction.id))}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: theme.palette.text.secondary, mb: 2 }}>
              User Input
            </Typography>
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, pl: 2 }}>
              <TextField
                label="Prompt"
                size="small"
                fullWidth
                multiline
                value={interaction.text}
                onChange={(event) => updateOne(interaction.id, (item) => ({ ...item, text: event.target.value }))}
              />
              <TextField
                label="Timeout (s)"
                size="small"
                type="number"
                value={interaction.timeoutInSeconds}
                onChange={(event) =>
                  updateOne(interaction.id, (item) => ({ ...item, timeoutInSeconds: event.target.value }))
                }
                sx={{ width: 160 }}
              />
            </Box>
          </Box>

          <Divider sx={{ mb: 2 }} />
          <ResponseChecksEditor interaction={interaction} updateOne={updateOne} />
          <Divider sx={{ mb: 2 }} />
          <SlyDataEditor interaction={interaction} slyDataKeys={slyDataKeys} updateOne={updateOne} />
        </Box>
      ))}

      <Button
        size="small"
        startIcon={<AddIcon />}
        sx={{ alignSelf: "flex-start" }}
        onClick={() => onChange([...interactions, emptyInteraction()])}
      >
        Add Turn
      </Button>
    </>
  );
};

interface SectionEditorProps {
  interaction: DraftInteraction;
  updateOne: (id: string, updater: (interaction: DraftInteraction) => DraftInteraction) => void;
}

const ResponseChecksEditor = ({ interaction, updateOne }: SectionEditorProps) => {
  const theme = useTheme();
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: theme.palette.text.secondary, mb: 2 }}>
        Expected Response
      </Typography>
      <Box sx={{ pl: 2 }}>
        {interaction.checks.map((check) => {
          const usedTypes = new Set(
            interaction.checks.filter((candidate) => candidate.id !== check.id).map((candidate) => candidate.checkType),
          );
          return (
            <Box key={check.id} sx={{ display: "flex", gap: 1, alignItems: "flex-start", mb: 0.5 }}>
              <TextField
                select
                size="small"
                label="Type"
                value={check.checkType}
                sx={{ width: 160 }}
                onChange={(event) =>
                  updateOne(interaction.id, (item) => ({
                    ...item,
                    checks: item.checks.map((candidate) =>
                      candidate.id === check.id ? { ...candidate, checkType: event.target.value } : candidate,
                    ),
                  }))
                }
              >
                {STOCK_TEST_KEYS.map((key) => (
                  <MenuItem key={key} value={key} disabled={usedTypes.has(key)}>
                    {formatCheckTypeLabel(key)}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                fullWidth
                multiline={!NUMERIC_CHECK_TYPES.has(check.checkType)}
                type={NUMERIC_CHECK_TYPES.has(check.checkType) ? "number" : "text"}
                label="Expected"
                value={check.value}
                onChange={(event) =>
                  updateOne(interaction.id, (item) => ({
                    ...item,
                    checks: item.checks.map((candidate) =>
                      candidate.id === check.id ? { ...candidate, value: event.target.value } : candidate,
                    ),
                  }))
                }
              />
              <IconButton
                size="small"
                title="Remove this check"
                disabled={interaction.checks.length <= 1}
                onClick={() =>
                  updateOne(interaction.id, (item) => ({
                    ...item,
                    checks: item.checks.filter((candidate) => candidate.id !== check.id),
                  }))
                }
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          );
        })}
        <Button
          size="small"
          startIcon={<AddIcon />}
          sx={{ mt: 0.5 }}
          disabled={interaction.checks.length >= STOCK_TEST_KEYS.length}
          onClick={() => addCheck(interaction, updateOne)}
        >
          Add Check
        </Button>
      </Box>
    </Box>
  );
};

const addCheck = (interaction: DraftInteraction, updateOne: SectionEditorProps["updateOne"]) => {
  const usedTypes = new Set(interaction.checks.map((check) => check.checkType));
  const checkType = STOCK_TEST_KEYS.find((key) => !usedTypes.has(key)) ?? STOCK_TEST_KEYS[0];
  updateOne(interaction.id, (item) => ({
    ...item,
    checks: [...item.checks, { id: newDraftId(), checkType, value: "" }],
  }));
};

interface SlyDataEditorProps extends SectionEditorProps {
  slyDataKeys: string[];
}

const SlyDataEditor = ({ interaction, slyDataKeys, updateOne }: SlyDataEditorProps) => {
  const theme = useTheme();
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: theme.palette.text.secondary, mb: 2 }}>
        Sly Data Input
      </Typography>
      <Box sx={{ pl: 2 }}>
        {interaction.slyData.map((entry) => {
          const options = entry.key && !slyDataKeys.includes(entry.key) ? [...slyDataKeys, entry.key] : slyDataKeys;
          return (
            <Box key={entry.id} sx={{ display: "flex", gap: 1, alignItems: "flex-start", mb: 0.5 }}>
              <TextField
                select
                size="small"
                label="Key"
                value={entry.key}
                sx={{ width: 160 }}
                onChange={(event) =>
                  updateOne(interaction.id, (item) => ({
                    ...item,
                    slyData: item.slyData.map((candidate) =>
                      candidate.id === entry.id ? { ...candidate, key: event.target.value } : candidate,
                    ),
                  }))
                }
              >
                {options.map((key) => (
                  <MenuItem key={key} value={key}>
                    {key}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                fullWidth
                label="Override Value"
                value={entry.value}
                onChange={(event) =>
                  updateOne(interaction.id, (item) => ({
                    ...item,
                    slyData: item.slyData.map((candidate) =>
                      candidate.id === entry.id ? { ...candidate, value: event.target.value } : candidate,
                    ),
                  }))
                }
              />
              <IconButton
                size="small"
                title="Remove this sly_data entry"
                onClick={() =>
                  updateOne(interaction.id, (item) => ({
                    ...item,
                    slyData: item.slyData.filter((candidate) => candidate.id !== entry.id),
                  }))
                }
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          );
        })}
        <Button
          size="small"
          startIcon={<AddIcon />}
          sx={{ mt: 0.5 }}
          onClick={() =>
            updateOne(interaction.id, (item) => ({
              ...item,
              slyData: [...item.slyData, { id: newDraftId(), key: "", value: "" }],
            }))
          }
        >
          Add Sly Data
        </Button>
      </Box>
    </Box>
  );
};

export default InteractionsEditor;
