
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

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Button,
  IconButton,
  Typography,
  Alert,
  CircularProgress,
  useTheme,
} from "@mui/material";
import {
  Close as CloseIcon,
  Refresh as RefreshIcon,
  Add as AddIcon,
  Edit as EditIcon,
} from "@mui/icons-material";
import { useApiPort } from "../context/ApiPortContext";
import { useConsultantFixtureEditor } from "../hooks/useConsultantFixtureEditor";
import type { FixtureResult } from "../types/networkConsultant";
import FileViewerDialog from "./FileViewerDialog";
import ConsultantFixtureCard from "./networkConsultant/ConsultantFixtureCard";
import NewConsultantFixtureEditor from "./networkConsultant/NewConsultantFixtureEditor";

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

const TestFixturesDialog = ({ open, onClose, networkName, onRunFixture, jobRunning, results }: TestFixturesDialogProps) => {
  const { apiUrl } = useApiPort();
  const theme = useTheme();

  const {
    fixtures,
    editingNames,
    drafts,
    loading,
    error,
    setError,
    viewingFile,
    setViewingFile,
    savingName,
    saveErrors,
    duplicatingName,
    deletingName,
    justCreatedName,
    newFixture,
    setNewFixture,
    newFixtureErrors,
    creating,
    slyDataKeys,
    fetchFixtures,
    cancelEditing,
    toggleEditAll,
    updateDraft,
    duplicateFixture: handleDuplicate,
    deleteFixture: handleDelete,
    saveFixture: handleSave,
    createFixture: handleCreate,
    startNewFixture,
  } = useConsultantFixtureEditor({ apiUrl, networkName, open });

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
            onClick={startNewFixture}
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
            <NewConsultantFixtureEditor
              draft={newFixture}
              errors={newFixtureErrors}
              creating={creating}
              slyDataKeys={slyDataKeys}
              onChange={setNewFixture}
              onCreate={handleCreate}
              onCancel={() => setNewFixture(null)}
            />
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
            fixtures.map((fixture) => (
              <ConsultantFixtureCard
                key={fixture.name}
                fixture={fixture}
                result={results?.[fixture.name]}
                draft={drafts[fixture.name]}
                isEditing={editingNames.has(fixture.name)}
                defaultExpanded={fixture.name === justCreatedName}
                errors={saveErrors[fixture.name] ?? []}
                saving={savingName === fixture.name}
                duplicating={duplicatingName === fixture.name}
                deleting={deletingName === fixture.name}
                jobRunning={jobRunning}
                slyDataKeys={slyDataKeys}
                onRun={onRunFixture}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
                onSave={handleSave}
                onCancel={cancelEditing}
                onDraftChange={updateDraft}
                onViewRaw={setViewingFile}
              />
            ))
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
