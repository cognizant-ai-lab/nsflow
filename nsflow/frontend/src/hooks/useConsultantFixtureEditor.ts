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
  const contextGenerationRef = useRef(0);

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
    const contextGeneration = ++contextGenerationRef.current;
    setEditingNames(new Set());
    setDrafts({});
    setSaveErrors({});
    setNewFixture(null);
    setNewFixtureErrors([]);
    setViewingFile(null);
    setJustCreatedName(null);
    setSavingName(null);
    setDuplicatingName(null);
    setDeletingName(null);
    setCreating(false);
    setSlyDataKeys([]);
    void fetchFixtures();
    void listSlyDataKeys(apiUrl, networkName)
      .then((keys) => {
        if (contextGeneration === contextGenerationRef.current) setSlyDataKeys(keys);
      })
      .catch((discoveryError: unknown) => {
        if (contextGeneration !== contextGenerationRef.current) return;
        setSlyDataKeys([]);
        setError(describeError(discoveryError));
      });
    return () => {
      if (contextGeneration === contextGenerationRef.current) contextGenerationRef.current += 1;
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
    const contextGeneration = contextGenerationRef.current;
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
      if (contextGeneration !== contextGenerationRef.current) return;
      const loaded = await fetchFixtures();
      if (contextGeneration !== contextGenerationRef.current) return;
      const created = loaded.find((candidate) => candidate.name === `${copyName}.hocon`);
      if (created) {
        setJustCreatedName(created.name);
        setDrafts((previous) => ({ ...previous, [created.name]: fixtureToDraft(created) }));
        setEditingNames((previous) => new Set(previous).add(created.name));
      }
    } catch (duplicateError: unknown) {
      if (contextGeneration === contextGenerationRef.current) setError(describeError(duplicateError));
    } finally {
      if (contextGeneration === contextGenerationRef.current) setDuplicatingName(null);
    }
  };

  const deleteFixture = async (fixture: ConsultantFixture) => {
    if (!window.confirm(`Delete "${fixture.name}"? This cannot be undone.`)) return;
    const contextGeneration = contextGenerationRef.current;
    setDeletingName(fixture.name);
    setError(null);
    try {
      await deleteConsultantFixture(apiUrl, networkName, fixture.name);
      if (contextGeneration !== contextGenerationRef.current) return;
      cancelEditing(fixture.name);
      void fetchFixtures();
    } catch (deleteError: unknown) {
      if (contextGeneration === contextGenerationRef.current) setError(describeError(deleteError));
    } finally {
      if (contextGeneration === contextGenerationRef.current) setDeletingName(null);
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
    const contextGeneration = contextGenerationRef.current;
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
      if (contextGeneration !== contextGenerationRef.current) return;
      cancelEditing(fixture.name);
      void fetchFixtures();
    } catch (saveError: unknown) {
      if (contextGeneration === contextGenerationRef.current) {
        setSaveErrors((previous) => ({ ...previous, [fixture.name]: describeErrors(saveError) }));
      }
    } finally {
      if (contextGeneration === contextGenerationRef.current) setSavingName(null);
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
    const contextGeneration = contextGenerationRef.current;
    setCreating(true);
    setNewFixtureErrors([]);
    try {
      await saveConsultantFixture(apiUrl, networkName, fileName, {
        agent: networkName,
        success_ratio: newFixture.successRatio,
        connections: ["direct"],
        interactions,
      });
      if (contextGeneration !== contextGenerationRef.current) return;
      setNewFixture(null);
      void fetchFixtures();
    } catch (createError: unknown) {
      if (contextGeneration === contextGenerationRef.current) setNewFixtureErrors(describeErrors(createError));
    } finally {
      if (contextGeneration === contextGenerationRef.current) setCreating(false);
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
