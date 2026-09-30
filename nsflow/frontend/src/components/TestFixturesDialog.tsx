
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

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Button,
  IconButton,
  TextField,
  Typography,
  Chip,
  Alert,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
  alpha,
  useTheme,
} from "@mui/material";
import {
  Close as CloseIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Edit as EditIcon,
  ContentCopy as CopyIcon,
  PlayArrow as RunIcon,
  CheckCircleOutlined as PassIcon,
  ErrorOutlined as FailIcon,
  ReportProblemOutlined as InfraIcon,
} from "@mui/icons-material";
import { useApiPort } from "../context/ApiPortContext";
import {
  buildInteractionsPayload,
  emptyDraftFixture,
  fixtureToDraft,
  formatCheckTypeLabel,
  rawInteractionsToPayload,
  SUCCESS_RATIO_PATTERN,
  uniqueCopyName,
} from "../state/networkConsultantFixtures";
import type { DraftFixture } from "../state/networkConsultantFixtures";
import type { ConsultantFixture as Fixture, FixtureResult } from "../types/networkConsultant";
import {
  deleteConsultantFixture,
  describeError,
  describeErrors,
  listConsultantFixtures,
  listSlyDataKeys,
  saveConsultantFixture,
} from "../utils/networkConsultantApi";
import FileViewerDialog, { ViewableFile } from "./FileViewerDialog";
import InteractionsEditor from "./networkConsultant/InteractionsEditor";

interface TestFixturesDialogProps {
  open: boolean;
  onClose: () => void;
  networkName: string;
  // Run one fixture. Supplied by the panel, which owns the single job slot and its poll loop --
  // there is one job at a time, so the dialog must not start one behind the panel's back.
  onRunFixture?: (fixtureName: string) => void;
  // True while any consultant job is running: a second run cannot start until it finishes.
  jobRunning?: boolean;
  // Per-fixture verdicts from the most recent run, keyed by fixture name.
  results?: Record<string, FixtureResult>;
}

// A single check's value can be a list (gist, keywords) or a scalar (value, greater, less) --
// render either without assuming one shape. Used by the read-only view.
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


const TestFixturesDialog = ({ open, onClose, networkName, onRunFixture, jobRunning, results }: TestFixturesDialogProps) => {
  const { apiUrl } = useApiPort();
  const theme = useTheme();

  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [editingNames, setEditingNames] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, DraftFixture>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState<ViewableFile | null>(null);
  const [savingName, setSavingName] = useState<string | null>(null);
  const [saveErrors, setSaveErrors] = useState<Record<string, string[]>>({});
  const [duplicatingName, setDuplicatingName] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  // Set right before the duplicate/create it names first renders, so that Accordion's
  // defaultExpanded (read once, at mount) opens exactly that new fixture -- everything else's
  // independent open/closed state is untouched.
  const [justCreatedName, setJustCreatedName] = useState<string | null>(null);
  const [newFixture, setNewFixture] = useState<DraftFixture | null>(null);
  const [newFixtureErrors, setNewFixtureErrors] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  // Variable names this network's own coded tools actually read from sly_data -- an empty list
  // (a pure-LLM network, or one whose tools don't override anything) falls back to free text.
  const [slyDataKeys, setSlyDataKeys] = useState<string[]>([]);
  const requestGenerationRef = useRef(0);

  // Returns the freshly-loaded list so callers that need to act on the result (e.g. Duplicate,
  // which wants to open the newly-created copy) don't have to re-fetch it themselves.
  const fetchFixtures = useCallback(async (): Promise<Fixture[]> => {
    if (!networkName) return [];
    const generation = ++requestGenerationRef.current;
    setLoading(true);
    setError(null);
    try {
      const loaded = await listConsultantFixtures(apiUrl, networkName, "Failed to load tests ({status})");
      if (generation === requestGenerationRef.current) {
        setFixtures(loaded);
      }
      return loaded;
    } catch (loadError: unknown) {
      if (generation === requestGenerationRef.current) {
        setError(describeError(loadError));
      }
      return [];
    } finally {
      if (generation === requestGenerationRef.current) setLoading(false);
    }
  }, [apiUrl, networkName]);

  // Every open is a fresh read of whatever's on disk right now -- drop any fixture that was
  // mid-edit from a previous open rather than carrying stale drafts forward.
  useEffect(() => {
    if (!open) return;
    let active = true;
    setEditingNames(new Set());
    setDrafts({});
    setSaveErrors({});
    setNewFixture(null);
    void fetchFixtures();
    void listSlyDataKeys(apiUrl, networkName)
      .then((keys) => {
        if (active) setSlyDataKeys(keys);
      })
      .catch(() => {
        if (active) setSlyDataKeys([]);
      });
    return () => {
      active = false;
      requestGenerationRef.current += 1;
    };
  }, [apiUrl, fetchFixtures, networkName, open]);

  const cancelEditing = (fixtureName: string) => {
    setEditingNames((prev) => {
      const next = new Set(prev);
      next.delete(fixtureName);
      return next;
    });
  };

  // One "Edit"/"Done" toggle at the top puts every fixture into (or out of) its editable form
  // at once, rather than a separate control per fixture.
  const toggleEditAll = () => {
    if (editingNames.size > 0) {
      setEditingNames(new Set());
      return;
    }
    const editable = fixtures.filter((fixture) => !fixture.parse_error);
    setDrafts(Object.fromEntries(editable.map((fixture) => [fixture.name, fixtureToDraft(fixture)])));
    setEditingNames(new Set(editable.map((fixture) => fixture.name)));
    setSaveErrors({});
  };

  const updateDraft = (fixtureName: string, updater: (draft: DraftFixture) => DraftFixture) =>
    setDrafts((prev) => ({ ...prev, [fixtureName]: updater(prev[fixtureName]) }));

  const handleDuplicate = async (fixture: Fixture) => {
    setDuplicatingName(fixture.name);
    setError(null);
    try {
      const copyName = uniqueCopyName(fixtures, fixture.name.replace(/\.hocon$/, ""));
      await saveConsultantFixture(apiUrl, networkName, copyName, {
        agent: fixture.agent,
        success_ratio: fixture.success_ratio,
        connections: fixture.connections.length ? fixture.connections : ["direct"],
        interactions: rawInteractionsToPayload(fixture.interactions),
      });
      const loaded = await fetchFixtures();
      const created = loaded.find((f) => f.name === `${copyName}.hocon`);
      if (created) {
        setJustCreatedName(created.name);
        setDrafts((prev) => ({ ...prev, [created.name]: fixtureToDraft(created) }));
        setEditingNames((prev) => new Set(prev).add(created.name));
      }
    } catch (error: unknown) {
      setError(describeError(error));
    } finally {
      setDuplicatingName(null);
    }
  };

  const handleDelete = async (fixture: Fixture) => {
    if (!window.confirm(`Delete "${fixture.name}"? This cannot be undone.`)) return;
    setDeletingName(fixture.name);
    setError(null);
    try {
      await deleteConsultantFixture(apiUrl, networkName, fixture.name);
      cancelEditing(fixture.name);
      void fetchFixtures();
    } catch (error: unknown) {
      setError(describeError(error));
    } finally {
      setDeletingName(null);
    }
  };

  const handleSave = async (fixture: Fixture) => {
    const draft = drafts[fixture.name];
    if (!draft) return;

    const fileName = draft.fileName.trim() || fixture.name.replace(/\.hocon$/, "");
    const { interactions, errors: payloadErrors } = buildInteractionsPayload(draft.interactions);
    if (payloadErrors.length) {
      setSaveErrors((prev) => ({ ...prev, [fixture.name]: payloadErrors }));
      return;
    }

    setSavingName(fixture.name);
    setSaveErrors((prev) => ({ ...prev, [fixture.name]: [] }));
    try {
      await saveConsultantFixture(
        apiUrl,
        networkName,
        fileName,
        {
          agent: fixture.agent,
          success_ratio: draft.successRatio,
          connections: fixture.connections.length ? fixture.connections : ["direct"],
          interactions,
        },
        fixture.name,
      );
      cancelEditing(fixture.name);
      void fetchFixtures();
    } catch (error: unknown) {
      setSaveErrors((prev) => ({ ...prev, [fixture.name]: describeErrors(error) }));
    } finally {
      setSavingName(null);
    }
  };

  const handleCreate = async () => {
    if (!newFixture) return;
    const fileName = newFixture.fileName.trim();
    if (!fileName) {
      setNewFixtureErrors(["File name is required."]);
      return;
    }
    const { interactions, errors: payloadErrors } = buildInteractionsPayload(newFixture.interactions);
    if (payloadErrors.length) {
      setNewFixtureErrors(payloadErrors);
      return;
    }

    setCreating(true);
    setNewFixtureErrors([]);
    try {
      await saveConsultantFixture(apiUrl, networkName, fileName, {
        agent: networkName,
        success_ratio: newFixture.successRatio,
        connections: ["direct"],
        interactions,
      });
      setNewFixture(null);
      void fetchFixtures();
    } catch (error: unknown) {
      setNewFixtureErrors(describeErrors(error));
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="md"
        fullWidth
        slotProps={{ paper: { sx: { maxHeight: "85vh", backgroundColor: theme.palette.background.paper } } }}
      >
        <DialogTitle
          sx={{ display: "flex", alignItems: "center", gap: 1, pb: 1, borderBottom: `1px solid ${theme.palette.divider}` }}
        >
          <Typography variant="h6" sx={{ flexGrow: 1, color: theme.palette.text.primary }}>
            Generated Tests: {networkName || "(no network selected)"}
            {fixtures.length > 0 && (
              <Typography component="span" variant="body2" sx={{ color: theme.palette.text.secondary, ml: 1 }}>
                ({fixtures.length})
              </Typography>
            )}
          </Typography>
          <Button
            size="small"
            startIcon={<AddIcon fontSize="small" />}
            disabled={!!newFixture}
            onClick={() => {
              setNewFixture(emptyDraftFixture());
              setNewFixtureErrors([]);
            }}
          >
            New Test
          </Button>
          {fixtures.some((f) => !f.parse_error) && (
            <Button size="small" startIcon={<EditIcon fontSize="small" />} onClick={toggleEditAll}>
              {editingNames.size > 0 ? "Done" : "Edit"}
            </Button>
          )}
          <IconButton
            onClick={() => void fetchFixtures()}
            size="small"
            disabled={loading}
            title="Refresh (discards unsaved edits)"
          >
            <RefreshIcon />
          </IconButton>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ pt: 2, pb: 2 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {newFixture && (
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
                      value={newFixture.fileName}
                      onChange={(e) => setNewFixture((d) => d && { ...d, fileName: e.target.value })}
                      sx={{ flex: 1 }}
                    />
                    <TextField
                      label="Success Ratio"
                      size="small"
                      value={newFixture.successRatio}
                      error={!SUCCESS_RATIO_PATTERN.test(newFixture.successRatio)}
                      helperText={SUCCESS_RATIO_PATTERN.test(newFixture.successRatio) ? "" : "N/M, e.g. 1/1"}
                      onChange={(e) => setNewFixture((d) => d && { ...d, successRatio: e.target.value })}
                      sx={{ width: 130 }}
                    />
                  </Box>

                  <InteractionsEditor
                    interactions={newFixture.interactions}
                    onChange={(next) => setNewFixture((d) => d && { ...d, interactions: next })}
                    slyDataKeys={slyDataKeys}
                  />

                  {newFixtureErrors.length > 0 && (
                    <Alert severity="error">
                      {newFixtureErrors.map((message, i) => (
                        <div key={i}>{message}</div>
                      ))}
                    </Alert>
                  )}

                  <Box sx={{ display: "flex", gap: 1 }}>
                    <Button variant="contained" size="small" disabled={creating} onClick={handleCreate}>
                      {creating ? "Creating..." : "Create"}
                    </Button>
                    <Button size="small" disabled={creating} onClick={() => setNewFixture(null)}>
                      Cancel
                    </Button>
                  </Box>
                </Box>
              </AccordionDetails>
            </Accordion>
          )}

          {loading && fixtures.length === 0 ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : !loading && !error && fixtures.length === 0 && !newFixture ? (
            <Box
              sx={{
                height: 140,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 1,
                border: `1px dashed ${theme.palette.divider}`,
                color: theme.palette.text.secondary,
              }}
            >
              <Typography variant="body2">No tests generated yet -- use Generate Tests above, or New Test.</Typography>
            </Box>
          ) : (
            fixtures.map((fixture) => {
              const isEditing = editingNames.has(fixture.name);
              const draft = drafts[fixture.name];
              const ratioValid = !draft || SUCCESS_RATIO_PATTERN.test(draft.successRatio);
              const errors = saveErrors[fixture.name] ?? [];
              return (
                <Accordion
                  key={fixture.name}
                  variant="outlined"
                  defaultExpanded={fixture.name === justCreatedName}
                  sx={{
                    mb: 1,
                    backgroundColor: alpha(theme.palette.info.main, 0.08),
                    borderColor: alpha(theme.palette.info.main, 0.3),
                    "&:before": { display: "none" },
                  }}
                >
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", width: "100%" }}>
                      {!(isEditing && draft) && results?.[fixture.name] && (
                        // An infrastructure error gets its own glyph on purpose: a timeout or an
                        // API-key fault is not a defect in the network, and reading one as a
                        // defect sends the consultant rewriting agents that were never at fault.
                        results[fixture.name].infrastructure_error ? (
                          <InfraIcon fontSize="small" color="warning" titleAccess="Could not reach a verdict" />
                        ) : results[fixture.name].passed ? (
                          <PassIcon fontSize="small" color="success" titleAccess="Passing" />
                        ) : (
                          <FailIcon fontSize="small" color="error" titleAccess="Failing" />
                        )
                      )}
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
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => updateDraft(fixture.name, (d) => ({ ...d, fileName: e.target.value }))}
                            sx={{ width: 220 }}
                          />
                          <TextField
                            size="small"
                            label="Success Ratio"
                            value={draft.successRatio}
                            error={!ratioValid}
                            helperText={ratioValid ? "" : "N/M, e.g. 1/1"}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => updateDraft(fixture.name, (d) => ({ ...d, successRatio: e.target.value }))}
                            sx={{ width: 130 }}
                          />
                        </>
                      ) : (
                        fixture.success_ratio && <Chip size="small" color="primary" label={fixture.success_ratio} />
                      )}
                      <Box sx={{ flexGrow: 1 }} />
                      {onRunFixture && !fixture.parse_error && (
                        <IconButton
                          size="small"
                          color="primary"
                          title={jobRunning ? "A run is already in progress" : "Run just this test"}
                          disabled={jobRunning}
                          onClick={(e) => {
                            e.stopPropagation();
                            onRunFixture(fixture.name);
                          }}
                        >
                          <RunIcon fontSize="small" />
                        </IconButton>
                      )}
                      {!fixture.parse_error && (
                        <IconButton
                          size="small"
                          title="Duplicate this test"
                          disabled={duplicatingName === fixture.name}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicate(fixture);
                          }}
                        >
                          <CopyIcon fontSize="small" />
                        </IconButton>
                      )}
                      <IconButton
                        size="small"
                        title="Delete this test"
                        disabled={deletingName === fixture.name}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(fixture);
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    {results?.[fixture.name] && !results[fixture.name].passed && results[fixture.name].message && (
                      <Alert
                        severity={results[fixture.name].infrastructure_error ? "warning" : "error"}
                        sx={{ mb: 2, "& .MuiAlert-message": { overflow: "hidden" } }}
                      >
                        <Box
                          component="pre"
                          sx={{ m: 0, fontSize: "0.72rem", whiteSpace: "pre-wrap", wordBreak: "break-word",
                                maxHeight: 220, overflowY: "auto" }}
                        >
                          {results[fixture.name].message}
                        </Box>
                      </Alert>
                    )}
                    {fixture.parse_error ? (
                      <Alert severity="warning" sx={{ mb: 1 }}>
                        Could not parse this fixture: {fixture.parse_error}
                      </Alert>
                    ) : isEditing && draft ? (
                      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <InteractionsEditor
                          interactions={draft.interactions}
                          onChange={(next) => updateDraft(fixture.name, (d) => ({ ...d, interactions: next }))}
                          slyDataKeys={slyDataKeys}
                        />

                        {errors.length > 0 && (
                          <Alert severity="error">
                            {errors.map((message, i) => (
                              <div key={i}>{message}</div>
                            ))}
                          </Alert>
                        )}

                        <Box sx={{ display: "flex", gap: 1 }}>
                          <Button
                            variant="contained"
                            size="small"
                            disabled={!ratioValid || savingName === fixture.name}
                            onClick={() => handleSave(fixture)}
                          >
                            {savingName === fixture.name ? "Saving..." : "Save"}
                          </Button>
                          <Button size="small" disabled={savingName === fixture.name} onClick={() => cancelEditing(fixture.name)}>
                            Cancel
                          </Button>
                          <Button
                            size="small"
                            onClick={() =>
                              setViewingFile({
                                file: new File([fixture.raw_hocon], fixture.name, { type: "text/plain" }),
                                content: fixture.raw_hocon,
                              })
                            }
                          >
                            View raw HOCON
                          </Button>
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
                            {Object.entries(interaction.response_checks).map(([checkType, checkValue]) =>
                              Array.isArray(checkValue) ? (
                                <Box key={checkType} sx={{ mb: 0.5 }}>
                                  <Typography variant="body2" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
                                    {formatCheckTypeLabel(checkType)} -
                                  </Typography>
                                  <CheckValue value={checkValue} />
                                </Box>
                              ) : (
                                <Box key={checkType} sx={{ display: "flex", gap: 0.5, alignItems: "flex-start", mb: 0.5 }}>
                                  <Typography variant="body2" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
                                    {formatCheckTypeLabel(checkType)} -
                                  </Typography>
                                  <CheckValue value={checkValue} />
                                </Box>
                              )
                            )}
                            {index < fixture.interactions.length - 1 && <Divider sx={{ mt: 2 }} />}
                          </Box>
                        ))}
                        <Button
                          size="small"
                          sx={{ mt: 1 }}
                          onClick={() =>
                            setViewingFile({
                              file: new File([fixture.raw_hocon], fixture.name, { type: "text/plain" }),
                              content: fixture.raw_hocon,
                            })
                          }
                        >
                          View raw HOCON
                        </Button>
                      </>
                    )}
                  </AccordionDetails>
                </Accordion>
              );
            })
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} variant="outlined">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <FileViewerDialog file={viewingFile} onClose={() => setViewingFile(null)} />
    </>
  );
};

export default TestFixturesDialog;
