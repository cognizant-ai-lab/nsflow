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

import type {
  ConsultantEndpoint,
  ConsultantJobOrigin,
  ConsultantJobStatus,
  FixtureResult,
} from "../types/networkConsultant";
import {
  answerConsultantJob,
  describeError,
  getConsultantJob,
  startConsultantJob,
  stopConsultantJob,
} from "../utils/networkConsultantApi";

export const CONSULTANT_POLL_INTERVAL_MS = 2000;
export const CONSULTANT_POLL_MAX_CONSECUTIVE_FAILURES = 3;

interface UseNetworkConsultantJobOptions {
  apiUrl: string;
  networkName: string;
  sessionId: string;
  themeMode: string;
  onFinished: (networkName: string) => void;
}

const resultsByFixture = (results: FixtureResult[]): Record<string, FixtureResult> =>
  Object.fromEntries(results.map((result) => [result.fixture, result]));

export const useNetworkConsultantJob = ({
  apiUrl,
  networkName,
  sessionId,
  themeMode,
  onFinished,
}: UseNetworkConsultantJobOptions) => {
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobOrigin, setJobOrigin] = useState<ConsultantJobOrigin | null>(null);
  const [starting, setStarting] = useState(false);
  const [running, setRunning] = useState(false);
  const [returncode, setReturncode] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [toolIssues, setToolIssues] = useState<string[]>([]);
  const [ungrounded, setUngrounded] = useState<string[]>([]);
  const [progressChart, setProgressChart] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, FixtureResult>>({});
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [stopping, setStopping] = useState(false);

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollGenerationRef = useRef(0);
  const busyRef = useRef(false);
  const networkRef = useRef(networkName);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  networkRef.current = networkName;

  const stopPolling = useCallback(() => {
    pollGenerationRef.current += 1;
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    pollTimerRef.current = null;
  }, []);

  const applyStatus = useCallback((status: ConsultantJobStatus) => {
    busyRef.current = status.running;
    setRunning(status.running);
    setReturncode(status.returncode);
    setPendingQuestion(status.pending_question ?? null);
    setToolIssues(status.tool_issues ?? []);
    setUngrounded(status.ungrounded ?? []);
    setResults(resultsByFixture(status.results ?? []));
    setProgressChart(status.progress_chart ?? null);
  }, []);

  const beginPolling = useCallback(
    (id: string, jobNetwork: string) => {
      stopPolling();
      const generation = pollGenerationRef.current;
      let consecutiveFailures = 0;

      const pollOnce = async () => {
        try {
          const status = await getConsultantJob(apiUrl, id, themeMode);
          const isCurrentJob = generation === pollGenerationRef.current && jobNetwork === networkRef.current;
          if (!isCurrentJob) return;
          consecutiveFailures = 0;
          setError(null);
          applyStatus(status);
          if (status.running) {
            pollTimerRef.current = setTimeout(pollOnce, CONSULTANT_POLL_INTERVAL_MS);
          } else {
            pollTimerRef.current = null;
            onFinishedRef.current(jobNetwork);
          }
        } catch (pollError: unknown) {
          if (generation !== pollGenerationRef.current || jobNetwork !== networkRef.current) return;
          setError(describeError(pollError));
          consecutiveFailures += 1;
          if (consecutiveFailures < CONSULTANT_POLL_MAX_CONSECUTIVE_FAILURES) {
            pollTimerRef.current = setTimeout(pollOnce, CONSULTANT_POLL_INTERVAL_MS);
          } else {
            stopPolling();
          }
        }
      };

      pollTimerRef.current = setTimeout(pollOnce, CONSULTANT_POLL_INTERVAL_MS);
    },
    [apiUrl, applyStatus, stopPolling, themeMode],
  );

  useEffect(() => {
    stopPolling();
    busyRef.current = false;
    setJobId(null);
    setJobOrigin(null);
    setStarting(false);
    setRunning(false);
    setReturncode(null);
    setError(null);
    setPendingQuestion(null);
    setToolIssues([]);
    setUngrounded([]);
    setProgressChart(null);
    setResults({});
    setSubmittingAnswer(false);
    setStopping(false);
  }, [networkName, stopPolling]);

  useEffect(() => stopPolling, [stopPolling]);

  const start = async (
    endpoint: ConsultantEndpoint,
    origin: ConsultantJobOrigin,
    body: Record<string, unknown>,
  ) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setStarting(true);
    stopPolling();
    const operationGeneration = pollGenerationRef.current;
    const jobNetwork = networkName;
    setJobOrigin(origin);
    setError(null);
    setReturncode(null);
    setJobId(null);
    setPendingQuestion(null);
    setToolIssues([]);
    setUngrounded([]);
    setResults({});
    setProgressChart(null);
    try {
      const id = await startConsultantJob(apiUrl, endpoint, { ...body, session_id: sessionId });
      if (operationGeneration !== pollGenerationRef.current || jobNetwork !== networkRef.current) {
        try {
          await stopConsultantJob(apiUrl, id);
        } catch (cleanupError: unknown) {
          console.error("Failed to stop stale Network Consultant job:", cleanupError);
        }
        return false;
      }
      setJobId(id);
      setRunning(true);
      beginPolling(id, jobNetwork);
      return true;
    } catch (startError: unknown) {
      if (jobNetwork === networkRef.current) {
        busyRef.current = false;
        setError(describeError(startError));
      }
      return false;
    } finally {
      if (jobNetwork === networkRef.current) setStarting(false);
    }
  };

  const submitAnswer = async (answer: string) => {
    if (!jobId || !answer.trim()) return false;
    const operationGeneration = pollGenerationRef.current;
    setSubmittingAnswer(true);
    try {
      await answerConsultantJob(apiUrl, jobId, answer);
      if (operationGeneration !== pollGenerationRef.current) return false;
      return true;
    } catch (answerError: unknown) {
      if (operationGeneration === pollGenerationRef.current) setError(describeError(answerError));
      return false;
    } finally {
      if (operationGeneration === pollGenerationRef.current) setSubmittingAnswer(false);
    }
  };

  const stop = async () => {
    if (!jobId) return;
    const operationGeneration = pollGenerationRef.current;
    setStopping(true);
    try {
      await stopConsultantJob(apiUrl, jobId);
    } catch (stopError: unknown) {
      if (operationGeneration === pollGenerationRef.current) setError(describeError(stopError));
    } finally {
      if (operationGeneration === pollGenerationRef.current) setStopping(false);
    }
  };

  return {
    jobId,
    jobOrigin,
    starting,
    busy: starting || running,
    running,
    returncode,
    error,
    setError,
    pendingQuestion,
    toolIssues,
    ungrounded,
    progressChart,
    results,
    submittingAnswer,
    stopping,
    start,
    submitAnswer,
    stop,
  };
};
