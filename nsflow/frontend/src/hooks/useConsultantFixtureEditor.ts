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

import { useCallback, useEffect, useRef, useState } from "react";

import {
  buildInteractionsPayload,
  emptyDraftFixture,
  fixtureToDraft,
  rawInteractionsToPayload,
  uniqueCopyName,
} from "../state/networkConsultantFixtures";
import type { DraftFixture } from "../state/networkConsultantFixtures";
import type { ConsultantFixture } from "../types/networkConsultant";
import {
  deleteConsultantFixture,
  describeError,
  describeErrors,
  listConsultantFixtures,
  listSlyDataKeys,
  saveConsultantFixture,
} from "../utils/networkConsultantApi";
import type { ViewableFile } from "../components/FileViewerDialog";

interface UseConsultantFixtureEditorOptions {
  apiUrl: string;
  networkName: string;
  open: boolean;
}

export const useConsultantFixtureEditor = ({ apiUrl, networkName, open }: UseConsultantFixtureEditorOptions) => {
  const [fixtures, setFixtures] = useState<ConsultantFixture[]>([]);
  const [editingNames, setEditingNames] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, DraftFixture>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState<ViewableFile | null>(null);
  const [savingName, setSavingName] = useState<string | null>(null);
  const [saveErrors, setSaveErrors] = useState<Record<string, string[]>>({});
  const [duplicatingName, setDuplicatingName] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [justCreatedName, setJustCreatedName] = useState<string | null>(null);
  const [newFixture, setNewFixture] = useState<DraftFixture | null>(null);
  const [newFixtureErrors, setNewFixtureErrors] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [slyDataKeys, setSlyDataKeys] = useState<string[]>([]);
  const requestGenerationRef = useRef(0);

  const fetchFixtures = useCallback(async (): Promise<ConsultantFixture[]> => {
    if (!networkName) return [];
    const generation = ++requestGenerationRef.current;
    setLoading(true);
    setError(null);
    try {
      const loaded = await listConsultantFixtures(apiUrl, networkName, "Failed to load tests ({status})");
      if (generation === requestGenerationRef.current) setFixtures(loaded);
      return loaded;
    } catch (loadError: unknown) {
      if (generation === requestGenerationRef.current) setError(describeError(loadError));
      return [];
    } finally {
      if (generation === requestGenerationRef.current) setLoading(false);
    }
  }, [apiUrl, networkName]);

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
    setEditingNames((previous) => {
      const next = new Set(previous);
      next.delete(fixtureName);
      return next;
    });
  };

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
    setDrafts((previous) => ({ ...previous, [fixtureName]: updater(previous[fixtureName]) }));

  const duplicateFixture = async (fixture: ConsultantFixture) => {
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
      const created = loaded.find((candidate) => candidate.name === `${copyName}.hocon`);
      if (created) {
        setJustCreatedName(created.name);
        setDrafts((previous) => ({ ...previous, [created.name]: fixtureToDraft(created) }));
        setEditingNames((previous) => new Set(previous).add(created.name));
      }
    } catch (duplicateError: unknown) {
      setError(describeError(duplicateError));
    } finally {
      setDuplicatingName(null);
    }
  };

  const deleteFixture = async (fixture: ConsultantFixture) => {
    if (!window.confirm(`Delete "${fixture.name}"? This cannot be undone.`)) return;
    setDeletingName(fixture.name);
    setError(null);
    try {
      await deleteConsultantFixture(apiUrl, networkName, fixture.name);
      cancelEditing(fixture.name);
      void fetchFixtures();
    } catch (deleteError: unknown) {
      setError(describeError(deleteError));
    } finally {
      setDeletingName(null);
    }
  };

  const saveFixture = async (fixture: ConsultantFixture) => {
    const draft = drafts[fixture.name];
    if (!draft) return;
    const fileName = draft.fileName.trim() || fixture.name.replace(/\.hocon$/, "");
    const { interactions, errors: payloadErrors } = buildInteractionsPayload(draft.interactions);
    if (payloadErrors.length) {
      setSaveErrors((previous) => ({ ...previous, [fixture.name]: payloadErrors }));
      return;
    }
    setSavingName(fixture.name);
    setSaveErrors((previous) => ({ ...previous, [fixture.name]: [] }));
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
    } catch (saveError: unknown) {
      setSaveErrors((previous) => ({ ...previous, [fixture.name]: describeErrors(saveError) }));
    } finally {
      setSavingName(null);
    }
  };

  const createFixture = async () => {
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
    } catch (createError: unknown) {
      setNewFixtureErrors(describeErrors(createError));
    } finally {
      setCreating(false);
    }
  };

  const startNewFixture = () => {
    setNewFixture(emptyDraftFixture());
    setNewFixtureErrors([]);
  };

  return {
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
    duplicateFixture,
    deleteFixture,
    saveFixture,
    createFixture,
    startNewFixture,
  };
};
