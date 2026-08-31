
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

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Button,
  IconButton,
  TextField,
  MenuItem,
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
} from "@mui/icons-material";
import { useApiPort } from "../context/ApiPortContext";
import FileViewerDialog, { ViewableFile } from "./FileViewerDialog";

// The complete set of stock tests neuro-san's AgentEvaluatorFactory recognizes under
// response.text -- mirrors coded_tools/agent_network_test_generator/validate_test_fixture.py's
// _VALID_STOCK_TESTS and the backend's own copy in network_consultant_endpoints.py.
const STOCK_TEST_KEYS = [
  "gist", "not_gist",
  "keywords", "not_keywords",
  "value", "not_value",
  "less", "not_less",
  "greater", "not_greater",
] as const;

// Display-only -- the wire value stays snake_case (e.g. "not_gist"); this is just how it reads
// in the Type dropdown and the read-only check summary.
const formatCheckTypeLabel = (key: string): string =>
  key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

// These take a single number (assertLess/assertGreater/assertEqual, or their negations);
// everything else (gist, keywords) takes a list of strings.
const NUMERIC_CHECK_TYPES = new Set(["value", "not_value", "less", "not_less", "greater", "not_greater"]);

const SUCCESS_RATIO_PATTERN = /^\d+\/\d+$/;

let nextDraftId = 0;
const newDraftId = () => String(nextDraftId++);

type ResponseChecks = Record<string, unknown>;

interface FixtureInteraction {
  text: string;
  timeout_in_seconds: number | null;
  response_checks: ResponseChecks;
  sly_data: Record<string, unknown>;
}

interface Fixture {
  name: string;
  agent: string | null;
  success_ratio: string | null;
  connections: string[];
  interactions: FixtureInteraction[];
  raw_hocon: string;
  parse_error: string | null;
}

interface TestFixturesDialogProps {
  open: boolean;
  onClose: () => void;
  networkName: string;
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

// Editable form state for one check (one interactions[].response.text entry). `value` is always
// kept as a plain string in the editor -- one-number text or newline-separated list text -- and
// only converted to its real JSON shape (number or string[]) right before saving.
interface DraftCheck {
  id: string;
  checkType: string;
  value: string;
}

// One interactions[].sly_data entry -- a variable name and its override text (e.g. "time" ->
// "2024-01-01T08:00:00" for TimeTool), edited as a row instead of hand-written JSON.
interface DraftSlyDataEntry {
  id: string;
  key: string;
  value: string;
}

interface DraftInteraction {
  id: string;
  text: string;
  timeoutInSeconds: string;
  slyData: DraftSlyDataEntry[];
  checks: DraftCheck[];
}

// "agent" is deliberately not part of the draft -- it identifies which network this fixture
// tests and is always taken from the fixture as-loaded (or from `networkName` for a new one),
// never hand-edited.
interface DraftFixture {
  fileName: string;
  successRatio: string;
  interactions: DraftInteraction[];
}

const checkValueToText = (value: unknown): string =>
  Array.isArray(value) ? value.map((item) => String(item)).join("\n") : String(value ?? "");

const fixtureToDraft = (fixture: Fixture): DraftFixture => ({
  fileName: fixture.name.replace(/\.hocon$/, ""),
  successRatio: fixture.success_ratio ?? "",
  interactions: fixture.interactions.map((interaction) => ({
    id: newDraftId(),
    text: interaction.text,
    timeoutInSeconds: interaction.timeout_in_seconds != null ? String(interaction.timeout_in_seconds) : "400",
    slyData: Object.entries(interaction.sly_data ?? {}).map(([key, value]) => ({
      id: newDraftId(),
      key,
      value: String(value),
    })),
    checks: Object.entries(interaction.response_checks).map(([checkType, value]) => ({
      id: newDraftId(),
      checkType,
      value: checkValueToText(value),
    })),
  })),
});

const emptyInteraction = (): DraftInteraction => ({
  id: newDraftId(),
  text: "",
  timeoutInSeconds: "400",
  slyData: [],
  checks: [{ id: newDraftId(), checkType: "gist", value: "" }],
});

const emptyDraftFixture = (): DraftFixture => ({
  fileName: "",
  successRatio: "1/1",
  interactions: [emptyInteraction()],
});

// Shared editor for a fixture's interactions/turns -- used both for an existing fixture's edit
// form and for the "New Test" creation form, so add/remove-turn and add/remove-check logic
// lives in exactly one place.
const InteractionsEditor = ({
  interactions,
  onChange,
  slyDataKeys,
}: {
  interactions: DraftInteraction[];
  onChange: (next: DraftInteraction[]) => void;
  slyDataKeys: string[];
}) => {
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
              onClick={() => onChange(interactions.filter((i) => i.id !== interaction.id))}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: theme.palette.text.secondary, mb: 1 }}>
              Input
            </Typography>
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, pl: 2 }}>
              <TextField
                label="Prompt"
                size="small"
                fullWidth
                multiline
                value={interaction.text}
                onChange={(e) => updateOne(interaction.id, (i) => ({ ...i, text: e.target.value }))}
              />
              <TextField
                label="Timeout (s)"
                size="small"
                type="number"
                value={interaction.timeoutInSeconds}
                onChange={(e) => updateOne(interaction.id, (i) => ({ ...i, timeoutInSeconds: e.target.value }))}
                sx={{ width: 160 }}
              />
            </Box>
          </Box>

          <Divider sx={{ mb: 2 }} />

          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: theme.palette.text.secondary, mb: 1 }}>
              Expected Response
            </Typography>
            <Box sx={{ pl: 2 }}>
              {interaction.checks.map((check, checkIndex) => {
                const usedElsewhere = new Set(
                  interaction.checks.filter((c) => c.id !== check.id).map((c) => c.checkType)
                );
                return (
                  <Box key={check.id} sx={{ display: "flex", gap: 1, alignItems: "flex-start", mb: 0.5 }}>
                    <TextField
                      select
                      size="small"
                      label={checkIndex === 0 ? "Type" : undefined}
                      value={check.checkType}
                      sx={{ width: 160 }}
                      onChange={(e) =>
                        updateOne(interaction.id, (i) => ({
                          ...i,
                          checks: i.checks.map((c) => (c.id === check.id ? { ...c, checkType: e.target.value } : c)),
                        }))
                      }
                    >
                      {STOCK_TEST_KEYS.map((key) => (
                        <MenuItem key={key} value={key} disabled={usedElsewhere.has(key)}>
                          {formatCheckTypeLabel(key)}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      size="small"
                      fullWidth
                      multiline={!NUMERIC_CHECK_TYPES.has(check.checkType)}
                      type={NUMERIC_CHECK_TYPES.has(check.checkType) ? "number" : "text"}
                      label={checkIndex === 0 ? "Expected" : undefined}
                      value={check.value}
                      onChange={(e) =>
                        updateOne(interaction.id, (i) => ({
                          ...i,
                          checks: i.checks.map((c) => (c.id === check.id ? { ...c, value: e.target.value } : c)),
                        }))
                      }
                    />
                    <IconButton
                      size="small"
                      title="Remove this check"
                      disabled={interaction.checks.length <= 1}
                      onClick={() =>
                        updateOne(interaction.id, (i) => ({
                          ...i,
                          checks: i.checks.filter((c) => c.id !== check.id),
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
                onClick={() => {
                  const used = new Set(interaction.checks.map((c) => c.checkType));
                  const nextType = STOCK_TEST_KEYS.find((key) => !used.has(key)) ?? STOCK_TEST_KEYS[0];
                  updateOne(interaction.id, (i) => ({
                    ...i,
                    checks: [...i.checks, { id: newDraftId(), checkType: nextType, value: "" }],
                  }));
                }}
              >
                Add Check
              </Button>
            </Box>
          </Box>

          <Divider sx={{ mb: 2 }} />

          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: theme.palette.text.secondary, mb: 1 }}>
              Sly Data Input
            </Typography>
            <Box sx={{ pl: 2 }}>
              {interaction.slyData.map((entry, entryIndex) => {
                // The dropdown is restricted to variable names actually found in this network's
                // coded tools -- but a saved fixture's existing key always stays selectable even if
                // it's since fallen out of that list (a tool changed, or it was hand-typed before).
                const options =
                  entry.key && !slyDataKeys.includes(entry.key) ? [...slyDataKeys, entry.key] : slyDataKeys;
                return (
                  <Box key={entry.id} sx={{ display: "flex", gap: 1, alignItems: "flex-start", mb: 0.5 }}>
                    <TextField
                      select
                      size="small"
                      label={entryIndex === 0 ? "Key" : undefined}
                      value={entry.key}
                      sx={{ width: 160 }}
                      onChange={(e) =>
                        updateOne(interaction.id, (i) => ({
                          ...i,
                          slyData: i.slyData.map((s) => (s.id === entry.id ? { ...s, key: e.target.value } : s)),
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
                      label={entryIndex === 0 ? "Value" : undefined}
                      value={entry.value}
                      onChange={(e) =>
                        updateOne(interaction.id, (i) => ({
                          ...i,
                          slyData: i.slyData.map((s) => (s.id === entry.id ? { ...s, value: e.target.value } : s)),
                        }))
                      }
                    />
                    <IconButton
                      size="small"
                      title="Remove this sly_data entry"
                      onClick={() =>
                        updateOne(interaction.id, (i) => ({
                          ...i,
                          slyData: i.slyData.filter((s) => s.id !== entry.id),
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
                  updateOne(interaction.id, (i) => ({
                    ...i,
                    slyData: [...i.slyData, { id: newDraftId(), key: "", value: "" }],
                  }))
                }
              >
                Add Sly Data
              </Button>
            </Box>
          </Box>
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

// Converts one draft's interactions into the JSON shape the backend expects, or collects client-
// side errors instead (a sly_data row with a value but no variable name, a numeric check that
// isn't a number, an empty keyword/gist list) -- shared by both "Save" (existing fixture) and
// "Create" (new fixture).
const buildInteractionsPayload = (draftInteractions: DraftInteraction[]): { interactions: any[]; errors: string[] } => {
  const errors: string[] = [];
  const interactions = draftInteractions.map((interaction, index) => {
    const label = `Turn ${index + 1}`;
    const slyData: Record<string, unknown> = {};
    interaction.slyData.forEach((entry) => {
      const key = entry.key.trim();
      if (!key) {
        if (entry.value.trim()) errors.push(`${label}: a sly_data entry needs a variable name.`);
        return;
      }
      slyData[key] = entry.value;
    });
    const checks: ResponseChecks = {};
    interaction.checks.forEach((check) => {
      if (NUMERIC_CHECK_TYPES.has(check.checkType)) {
        const num = Number(check.value);
        if (check.value.trim() === "" || Number.isNaN(num)) {
          errors.push(`${label}: "${check.checkType}" must be a number.`);
        } else {
          checks[check.checkType] = num;
        }
      } else {
        const items = check.value.split("\n").map((line) => line.trim()).filter(Boolean);
        if (!items.length) {
          errors.push(`${label}: "${check.checkType}" needs at least one line.`);
        } else {
          checks[check.checkType] = items;
        }
      }
    });
    return {
      text: interaction.text,
      timeout_in_seconds: Number(interaction.timeoutInSeconds) || 400,
      response: { text: checks },
      sly_data: slyData,
    };
  });
  return { interactions, errors };
};

const rawInteractionsToPayload = (interactions: FixtureInteraction[]) =>
  interactions.map((interaction) => ({
    text: interaction.text,
    timeout_in_seconds: interaction.timeout_in_seconds ?? 400,
    response: { text: interaction.response_checks },
    sly_data: interaction.sly_data ?? {},
  }));

const TestFixturesDialog = ({ open, onClose, networkName }: TestFixturesDialogProps) => {
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

  // Returns the freshly-loaded list so callers that need to act on the result (e.g. Duplicate,
  // which wants to open the newly-created copy) don't have to re-fetch it themselves.
  const fetchFixtures = (): Promise<Fixture[]> => {
    if (!networkName) return Promise.resolve([]);
    setLoading(true);
    setError(null);
    return fetch(`${apiUrl}/api/v1/network_consultant/fixtures?network_name=${encodeURIComponent(networkName)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load tests (${res.status})`);
        return res.json();
      })
      .then((data) => {
        const loaded: Fixture[] = data.fixtures ?? [];
        setFixtures(loaded);
        return loaded;
      })
      .catch((err: any) => {
        setError(err.message);
        return [];
      })
      .finally(() => setLoading(false));
  };

  // Every open is a fresh read of whatever's on disk right now -- drop any fixture that was
  // mid-edit from a previous open rather than carrying stale drafts forward.
  useEffect(() => {
    if (!open) return;
    setEditingNames(new Set());
    setDrafts({});
    setSaveErrors({});
    setNewFixture(null);
    fetchFixtures();
    fetch(`${apiUrl}/api/v1/network_consultant/sly_data_keys?network_name=${encodeURIComponent(networkName)}`)
      .then((res) => (res.ok ? res.json() : { keys: [] }))
      .then((data) => setSlyDataKeys(data.keys ?? []))
      .catch(() => setSlyDataKeys([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, networkName]);

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

  // Picks a not-yet-used "<base>_copy", "<base>_copy2", ... file name for Duplicate.
  const uniqueCopyName = (base: string) => {
    const existing = new Set(fixtures.map((f) => f.name.replace(/\.hocon$/, "")));
    let candidate = `${base}_copy`;
    let suffix = 2;
    while (existing.has(candidate)) {
      candidate = `${base}_copy${suffix}`;
      suffix += 1;
    }
    return candidate;
  };

  const putFixture = (fixtureName: string, fixture: Record<string, unknown>, originalFixtureName?: string) => {
    const params = new URLSearchParams({ network_name: networkName, fixture_name: fixtureName });
    if (originalFixtureName) params.set("original_fixture_name", originalFixtureName);
    return fetch(`${apiUrl}/api/v1/network_consultant/fixtures?${params.toString()}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixture }),
    });
  };

  const errorsFromResponse = async (res: Response, fallbackStatus: number): Promise<string[]> => {
    const body = await res.json().catch(() => null);
    const detail = body?.detail;
    return Array.isArray(detail?.errors) ? detail.errors : [typeof detail === "string" ? detail : `Failed (${fallbackStatus}).`];
  };

  const handleDuplicate = async (fixture: Fixture) => {
    setDuplicatingName(fixture.name);
    setError(null);
    try {
      const copyName = uniqueCopyName(fixture.name.replace(/\.hocon$/, ""));
      const res = await putFixture(copyName, {
        agent: fixture.agent,
        success_ratio: fixture.success_ratio,
        connections: fixture.connections.length ? fixture.connections : ["direct"],
        interactions: rawInteractionsToPayload(fixture.interactions),
      });
      if (!res.ok) {
        setError((await errorsFromResponse(res, res.status)).join(" "));
        return;
      }
      const loaded = await fetchFixtures();
      const created = loaded.find((f) => f.name === `${copyName}.hocon`);
      if (created) {
        setJustCreatedName(created.name);
        setDrafts((prev) => ({ ...prev, [created.name]: fixtureToDraft(created) }));
        setEditingNames((prev) => new Set(prev).add(created.name));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDuplicatingName(null);
    }
  };

  const handleDelete = async (fixture: Fixture) => {
    if (!window.confirm(`Delete "${fixture.name}"? This cannot be undone.`)) return;
    setDeletingName(fixture.name);
    setError(null);
    try {
      const res = await fetch(
        `${apiUrl}/api/v1/network_consultant/fixtures?network_name=${encodeURIComponent(
          networkName
        )}&fixture_name=${encodeURIComponent(fixture.name)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        setError((await errorsFromResponse(res, res.status)).join(" "));
        return;
      }
      cancelEditing(fixture.name);
      fetchFixtures();
    } catch (err: any) {
      setError(err.message);
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
      const res = await putFixture(
        fileName,
        {
          agent: fixture.agent,
          success_ratio: draft.successRatio,
          connections: fixture.connections.length ? fixture.connections : ["direct"],
          interactions,
        },
        fixture.name
      );
      if (!res.ok) {
        const errs = await errorsFromResponse(res, res.status);
        setSaveErrors((prev) => ({ ...prev, [fixture.name]: errs }));
        return;
      }
      cancelEditing(fixture.name);
      fetchFixtures();
    } catch (err: any) {
      setSaveErrors((prev) => ({ ...prev, [fixture.name]: [err.message] }));
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
      const res = await putFixture(fileName, {
        agent: networkName,
        success_ratio: newFixture.successRatio,
        connections: ["direct"],
        interactions,
      });
      if (!res.ok) {
        setNewFixtureErrors(await errorsFromResponse(res, res.status));
        return;
      }
      setNewFixture(null);
      fetchFixtures();
    } catch (err: any) {
      setNewFixtureErrors([err.message]);
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
        PaperProps={{ sx: { maxHeight: "85vh", backgroundColor: theme.palette.background.paper } }}
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
          <IconButton onClick={fetchFixtures} size="small" disabled={loading} title="Refresh (discards unsaved edits)">
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
