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

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/networkConsultantApi", () => ({
  answerConsultantJob: vi.fn(),
  describeError: (error: unknown) => (error instanceof Error ? error.message : "Unexpected error"),
  getConsultantJob: vi.fn(),
  startConsultantJob: vi.fn(),
  stopConsultantJob: vi.fn(),
}));
vi.mock("../utils/latestConsultantJobApi", () => ({ getLatestConsultantJob: vi.fn() }));

import { CONSULTANT_POLL_INTERVAL_MS, useNetworkConsultantJob } from "./useNetworkConsultantJob";
import { getLatestConsultantJob } from "../utils/latestConsultantJobApi";
import {
  answerConsultantJob,
  getConsultantJob,
  startConsultantJob,
  stopConsultantJob,
} from "../utils/networkConsultantApi";

const mockedGetJob = vi.mocked(getConsultantJob);
const mockedGetLatestJob = vi.mocked(getLatestConsultantJob);
const mockedStartJob = vi.mocked(startConsultantJob);
const mockedAnswerJob = vi.mocked(answerConsultantJob);
const mockedStopJob = vi.mocked(stopConsultantJob);

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
};

describe("useNetworkConsultantJob", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedStartJob.mockResolvedValue("job-1");
    mockedGetLatestJob.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("restores a running job when the panel mounts", async () => {
    mockedGetLatestJob.mockResolvedValue({ job_id: "restored-job", origin: "improve" });
    mockedGetJob.mockResolvedValue({ job_id: "restored-job", running: true, returncode: null, results: [] });

    const { result } = renderHook(() =>
      useNetworkConsultantJob({
        apiUrl: "http://api",
        networkName: "network-a",
        sessionId: "session",
        onFinished: vi.fn(),
      }),
    );

    await act(async () => Promise.resolve());

    expect(mockedGetLatestJob).toHaveBeenCalledWith("http://api", "network-a");
    expect(result.current.jobId).toBe("restored-job");
    expect(result.current.jobOrigin).toBe("improve");
    expect(result.current.running).toBe(true);

    expect(mockedGetJob).toHaveBeenCalledWith("http://api", "restored-job");
  });

  it("restores a completed test run when the panel mounts", async () => {
    mockedGetLatestJob.mockResolvedValue({ job_id: "completed-job", origin: "tests" });
    mockedGetJob.mockResolvedValue({
      job_id: "completed-job",
      running: false,
      returncode: 0,
      results: [{ fixture: "coffee.hocon", passed: true }],
      progress: [{ checkpoint: "before", passed: 1, total: 1 }],
    });

    const { result } = renderHook(() =>
      useNetworkConsultantJob({
        apiUrl: "http://api",
        networkName: "network-a",
        sessionId: "session",
        onFinished: vi.fn(),
      }),
    );

    await act(async () => Promise.resolve());

    expect(result.current.jobId).toBe("completed-job");
    expect(result.current.jobOrigin).toBe("tests");
    expect(result.current.running).toBe(false);
    expect(result.current.results["coffee.hocon"]?.passed).toBe(true);
    expect(result.current.progress).toEqual([{ checkpoint: "before", passed: 1, total: 1 }]);
  });

  it("ignores a latest-job response after the selected network changes", async () => {
    const latestJob = deferred<Awaited<ReturnType<typeof getLatestConsultantJob>>>();
    mockedGetLatestJob.mockReturnValueOnce(latestJob.promise).mockResolvedValueOnce(null);
    const { result, rerender } = renderHook(
      ({ networkName }) =>
        useNetworkConsultantJob({
          apiUrl: "http://api",
          networkName,
          sessionId: "session",
          onFinished: vi.fn(),
        }),
      { initialProps: { networkName: "network-a" } },
    );

    rerender({ networkName: "network-b" });
    await act(async () => {
      latestJob.resolve({ job_id: "old-job", origin: "tests" });
      await Promise.resolve();
    });

    expect(result.current.jobId).toBeNull();
    expect(result.current.running).toBe(false);
    expect(mockedGetJob).not.toHaveBeenCalled();
  });

  it("ignores an old job response after the selected network changes", async () => {
    const status = deferred<Awaited<ReturnType<typeof getConsultantJob>>>();
    mockedGetJob.mockReturnValue(status.promise);
    const onFinished = vi.fn();
    const { result, rerender } = renderHook(
      ({ networkName }) =>
        useNetworkConsultantJob({
          apiUrl: "http://api",
          networkName,
          sessionId: "session",
          onFinished,
        }),
      { initialProps: { networkName: "network-a" } },
    );

    await act(async () => result.current.start("run-tests", "tests", { network_name: "network-a" }));
    await act(async () => vi.advanceTimersByTimeAsync(CONSULTANT_POLL_INTERVAL_MS));
    expect(mockedGetJob).toHaveBeenCalledTimes(1);

    rerender({ networkName: "network-b" });
    await act(async () => {
      status.resolve({
        job_id: "job-1",
        running: false,
        returncode: 0,
        results: [{ fixture: "old.hocon", passed: false }],
      });
      await Promise.resolve();
    });

    expect(result.current.jobId).toBeNull();
    expect(result.current.running).toBe(false);
    expect(result.current.results).toEqual({});
    expect(onFinished).not.toHaveBeenCalled();
  });

  it("refreshes fixtures when the current job finishes", async () => {
    mockedGetJob.mockResolvedValue({ job_id: "job-1", running: false, returncode: 0, results: [] });
    const onFinished = vi.fn();
    const { result } = renderHook(() =>
      useNetworkConsultantJob({
        apiUrl: "http://api",
        networkName: "network-a",
        sessionId: "session",
        onFinished,
      }),
    );

    await act(async () => result.current.start("run-tests", "tests", { network_name: "network-a" }));
    await act(async () => vi.advanceTimersByTimeAsync(CONSULTANT_POLL_INTERVAL_MS));

    expect(result.current.running).toBe(false);
    expect(result.current.returncode).toBe(0);
    expect(onFinished).toHaveBeenCalledWith("network-a");
  });

  it("recovers when one status poll fails temporarily", async () => {
    mockedGetJob
      .mockRejectedValueOnce(new Error("Temporary network error"))
      .mockResolvedValueOnce({ job_id: "job-1", running: false, returncode: 0, results: [] });
    const onFinished = vi.fn();
    const { result } = renderHook(() =>
      useNetworkConsultantJob({
        apiUrl: "http://api",
        networkName: "network-a",
        sessionId: "session",
        onFinished,
      }),
    );

    await act(async () => result.current.start("run-tests", "tests", { network_name: "network-a" }));
    await act(async () => vi.advanceTimersByTimeAsync(CONSULTANT_POLL_INTERVAL_MS));
    expect(result.current.error).toBe("Temporary network error");

    await act(async () => vi.advanceTimersByTimeAsync(CONSULTANT_POLL_INTERVAL_MS));
    expect(result.current.error).toBeNull();
    expect(result.current.running).toBe(false);
    expect(onFinished).toHaveBeenCalledWith("network-a");
  });

  it("restores a running job when its network is selected again", async () => {
    mockedGetJob.mockResolvedValue({ job_id: "job-1", running: true, returncode: null, results: [] });
    const { result, rerender } = renderHook(
      ({ networkName }) =>
        useNetworkConsultantJob({
          apiUrl: "http://api",
          networkName,
          sessionId: "session",
          onFinished: vi.fn(),
        }),
      { initialProps: { networkName: "network-a" } },
    );

    await act(async () => result.current.start("improve", "improve", { network_name: "network-a" }));
    rerender({ networkName: "network-b" });
    expect(result.current.jobId).toBeNull();
    expect(result.current.running).toBe(false);

    rerender({ networkName: "network-a" });
    expect(result.current.jobId).toBe("job-1");
    expect(result.current.running).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(CONSULTANT_POLL_INTERVAL_MS));
    expect(mockedGetJob).toHaveBeenCalledWith("http://api", "job-1");
  });

  it("offers a status retry after polling exhausts its retries", async () => {
    mockedGetJob.mockRejectedValue(new Error("Status unavailable"));
    const { result } = renderHook(() =>
      useNetworkConsultantJob({
        apiUrl: "http://api",
        networkName: "network-a",
        sessionId: "session",
        onFinished: vi.fn(),
      }),
    );

    await act(async () => result.current.start("run-tests", "tests", { network_name: "network-a" }));
    await act(async () => vi.advanceTimersByTimeAsync(CONSULTANT_POLL_INTERVAL_MS * 3));

    expect(mockedGetJob).toHaveBeenCalledTimes(3);
    expect(result.current.running).toBe(true);
    expect(result.current.pollingStopped).toBe(true);
    expect(result.current.error).toBe("Status unavailable");

    mockedGetJob.mockResolvedValue({ job_id: "job-1", running: false, returncode: 0, results: [] });
    act(() => result.current.retryPolling());
    await act(async () => vi.advanceTimersByTimeAsync(CONSULTANT_POLL_INTERVAL_MS));

    expect(result.current.pollingStopped).toBe(false);
    expect(result.current.running).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("clears previous progress as soon as any new job starts", async () => {
    mockedGetJob.mockResolvedValue({
      job_id: "job-1",
      running: false,
      returncode: 0,
      progress: [{ checkpoint: "before", passed: 1, total: 2 }],
      results: [],
    });
    const secondStart = deferred<string>();
    mockedStartJob.mockResolvedValueOnce("job-1").mockReturnValueOnce(secondStart.promise);
    const { result } = renderHook(() =>
      useNetworkConsultantJob({
        apiUrl: "http://api",
        networkName: "network-a",
        sessionId: "session",
        onFinished: vi.fn(),
      }),
    );
    await act(async () => result.current.start("run-tests", "tests", { network_name: "network-a" }));
    await act(async () => vi.advanceTimersByTimeAsync(CONSULTANT_POLL_INTERVAL_MS));
    expect(result.current.progress).toEqual([{ checkpoint: "before", passed: 1, total: 2 }]);

    let startPromise: Promise<boolean>;
    act(() => {
      startPromise = result.current.start("improve", "improve", { network_name: "network-a" });
    });

    expect(result.current.progress).toEqual([]);
    expect(result.current.starting).toBe(true);
    await act(async () => {
      secondStart.resolve("job-2");
      await startPromise!;
    });
  });

  it("allows only one start request while a rapid click is in flight", async () => {
    const pendingStart = deferred<string>();
    mockedStartJob.mockReturnValue(pendingStart.promise);
    const { result } = renderHook(() =>
      useNetworkConsultantJob({
        apiUrl: "http://api",
        networkName: "network-a",
        sessionId: "session",
        onFinished: vi.fn(),
      }),
    );

    let firstStart: Promise<boolean>;
    let secondStart: Promise<boolean>;
    act(() => {
      firstStart = result.current.start("run-tests", "tests", { network_name: "network-a" });
      secondStart = result.current.start("run-tests", "tests", { network_name: "network-a" });
    });

    await expect(secondStart!).resolves.toBe(false);
    expect(mockedStartJob).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(true);
    await act(async () => {
      pendingStart.resolve("job-1");
      await firstStart!;
    });
  });

  it("ignores a start response that arrives after the selected network changes", async () => {
    const pendingStart = deferred<string>();
    mockedStartJob.mockReturnValue(pendingStart.promise);
    const { result, rerender } = renderHook(
      ({ networkName }) =>
        useNetworkConsultantJob({
          apiUrl: "http://api",
          networkName,
          sessionId: "session",
          onFinished: vi.fn(),
        }),
      { initialProps: { networkName: "network-a" } },
    );

    let startPromise: Promise<boolean>;
    act(() => {
      startPromise = result.current.start("run-tests", "tests", { network_name: "network-a" });
    });
    rerender({ networkName: "network-b" });
    await act(async () => {
      pendingStart.resolve("old-job");
      await startPromise!;
    });

    expect(result.current.jobId).toBeNull();
    expect(result.current.running).toBe(false);
    expect(mockedGetJob).not.toHaveBeenCalled();
    expect(mockedStopJob).toHaveBeenCalledWith("http://api", "old-job");
  });

  it("does not report late answer or stop failures in a newly selected network", async () => {
    mockedGetJob.mockResolvedValue({ job_id: "job-1", running: true, returncode: null });
    const pendingAnswer = deferred<void>();
    const pendingStop = deferred<void>();
    mockedAnswerJob.mockReturnValue(pendingAnswer.promise);
    mockedStopJob.mockReturnValue(pendingStop.promise);
    const { result, rerender } = renderHook(
      ({ networkName }) =>
        useNetworkConsultantJob({
          apiUrl: "http://api",
          networkName,
          sessionId: "session",
          onFinished: vi.fn(),
        }),
      { initialProps: { networkName: "network-a" } },
    );
    await act(async () => result.current.start("run-tests", "tests", { network_name: "network-a" }));

    let answerPromise: Promise<boolean>;
    let stopPromise: Promise<void>;
    act(() => {
      answerPromise = result.current.submitAnswer("continue");
      stopPromise = result.current.stop();
    });
    rerender({ networkName: "network-b" });
    await act(async () => {
      pendingAnswer.reject(new Error("Old answer failed"));
      pendingStop.reject(new Error("Old stop failed"));
      await Promise.all([answerPromise!, stopPromise!]);
    });

    expect(await answerPromise!).toBe(false);
    expect(result.current.submittingAnswer).toBe(false);
    expect(result.current.stopping).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
