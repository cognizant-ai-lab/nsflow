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

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";

// Shared across browser tabs of the same origin. The chat tab writes here
// on every trace event; the Analysis tab (opened via window.open) reads
// from it and subscribes to the `storage` event for live updates.
const STORAGE_KEY = "nsflow:trace:invocations:v1";

const safeReadStorage = (): Invocation[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Invocation[]) : [];
  } catch {
    return [];
  }
};

const safeWriteStorage = (invs: Invocation[]): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(invs));
  } catch {
    // QuotaExceeded etc.; just skip the mirror for this write.
  }
};

export type TraceKind =
  | "agent"
  | "sub_network"
  | "tool"
  | "external_agent"
  | "network_total"
  | "invocation_start"
  | "invocation_end";

export type TraceStep = {
  invocation_id?: string | null;
  network?: string | null;
  otrace: string[];
  agent: string;
  depth: number;
  kind?: TraceKind;
  duration_s: number;
  received_at: number;
  start_s: number;
  total_tokens?: number | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_cost?: number | null;
  successful_requests?: number | null;
  is_network_total?: boolean;
  params?: Record<string, unknown> | null;
  prompt?: string | null;
  model?: string | null;
  provider?: string | null;
};

export type Invocation = {
  id: string;
  network: string;
  prompt: string;
  startedAt: number;
  endedAt: number | null;
  steps: TraceStep[];
};

type TraceContextType = {
  invocations: Invocation[];
  addTraceStep: (step: TraceStep) => void;
  clearTrace: () => void;
  traceWs: WebSocket | null;
  setTraceWs: (ws: WebSocket | null) => void;
  selectedInvocationId: string | null;
  setSelectedInvocationId: (id: string | null) => void;
};

const TraceContext = createContext<TraceContextType | undefined>(undefined);

const UNATTACHED_INVOCATION_ID = "__unattached__";

export const TraceProvider = ({ children }: { children: ReactNode }) => {
  const [invocations, setInvocations] = useState<Invocation[]>(() => safeReadStorage());
  const [traceWs, setTraceWs] = useState<WebSocket | null>(null);
  const [selectedInvocationId, setSelectedInvocationId] = useState<string | null>(null);
  const lastSerializedRef = useRef<string>(JSON.stringify(invocations));
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always points at the latest invocations so the unmount-flush effect can
  // read fresh state without re-subscribing.
  const latestInvocationsRef = useRef<Invocation[]>(invocations);
  latestInvocationsRef.current = invocations;

  // Mirror local changes to localStorage on a trailing 200ms debounce.
  // Fast bursts of trace events (many per second during an active run) only
  // pay one stringify+setItem per quiet window, while occasional updates
  // still land near-instantly for the Analysis tab.
  useEffect(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      const serialized = JSON.stringify(invocations);
      if (serialized === lastSerializedRef.current) return;
      lastSerializedRef.current = serialized;
      safeWriteStorage(invocations);
    }, 200);
    // No cleanup here on dep change — we *want* the timer to keep coalescing
    // across rapid updates. Unmount flush lives in the next effect.
  }, [invocations]);

  // Final flush on unmount so a pending debounce doesn't drop the last batch.
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      const serialized = JSON.stringify(latestInvocationsRef.current);
      if (serialized !== lastSerializedRef.current) {
        lastSerializedRef.current = serialized;
        safeWriteStorage(latestInvocationsRef.current);
      }
    };
  }, []);

  // if the incoming payload matches what we already have, skip
  // the setState (which would otherwise create a new array reference,
  // trigger the write effect, and bounce the same payload back).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || e.newValue == null) return;
      if (e.newValue === lastSerializedRef.current) return;
      try {
        const next = JSON.parse(e.newValue);
        if (!Array.isArray(next)) return;
        lastSerializedRef.current = e.newValue;
        setInvocations(next as Invocation[]);
      } catch {
        // Ignore malformed payload.
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const addTraceStep = useCallback((step: TraceStep) => {
    setInvocations((prev) => {
      const id = step.invocation_id || UNATTACHED_INVOCATION_ID;

      // invocation_start always opens a fresh bucket.
      if (step.kind === "invocation_start") {
        const fresh: Invocation = {
          id,
          network: step.network ?? "",
          prompt: step.prompt ?? "",
          startedAt: step.start_s,
          endedAt: null,
          steps: [],
        };
        // If a bucket with this id already exists (replay), replace it.
        const without = prev.filter((inv) => inv.id !== id);
        return [...without, fresh];
      }

      // invocation_end closes the matching bucket.
      if (step.kind === "invocation_end") {
        return prev.map((inv) =>
          inv.id === id ? { ...inv, endedAt: step.received_at } : inv
        );
      }

      // Regular step: append to matching invocation, creating one if needed.
      const idx = prev.findIndex((inv) => inv.id === id);
      if (idx === -1) {
        const synthetic: Invocation = {
          id,
          network: step.network ?? "",
          prompt: step.prompt ?? "",
          startedAt: step.start_s,
          endedAt: null,
          steps: [step],
        };
        return [...prev, synthetic];
      }
      const updated = [...prev];
      updated[idx] = { ...updated[idx], steps: [...updated[idx].steps, step] };
      return updated;
    });

    if (step.invocation_id && step.kind === "invocation_start") {
      setSelectedInvocationId(step.invocation_id);
    }
  }, []);

  const clearTrace = useCallback(() => {
    setInvocations([]);
    setSelectedInvocationId(null);
  }, []);

  return (
    <TraceContext.Provider
      value={{
        invocations,
        addTraceStep,
        clearTrace,
        traceWs,
        setTraceWs,
        selectedInvocationId,
        setSelectedInvocationId,
      }}
    >
      {children}
    </TraceContext.Provider>
  );
};

export const useTraceContext = (): TraceContextType => {
  const ctx = useContext(TraceContext);
  if (!ctx) {
    throw new Error("useTraceContext must be used within a TraceProvider");
  }
  return ctx;
};
