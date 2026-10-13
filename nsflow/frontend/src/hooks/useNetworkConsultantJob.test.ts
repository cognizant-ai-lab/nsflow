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

import { CONSULTANT_POLL_INTERVAL_MS, useNetworkConsultantJob } from "./useNetworkConsultantJob";
import {
  answerConsultantJob,
  getConsultantJob,
  startConsultantJob,
  stopConsultantJob,
} from "../utils/networkConsultantApi";

const mockedGetJob = vi.mocked(getConsultantJob);
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
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
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
          themeMode: "light",
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
        themeMode: "light",
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
        themeMode: "light",
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

  it("clears the previous chart as soon as any new job starts", async () => {
    mockedGetJob.mockResolvedValue({
      job_id: "job-1",
      running: false,
      returncode: 0,
      progress_chart: "data:image/png;base64,old",
      results: [],
    });
    const secondStart = deferred<string>();
    mockedStartJob.mockResolvedValueOnce("job-1").mockReturnValueOnce(secondStart.promise);
    const { result } = renderHook(() =>
      useNetworkConsultantJob({
        apiUrl: "http://api",
        networkName: "network-a",
        sessionId: "session",
        themeMode: "light",
        onFinished: vi.fn(),
      }),
    );
    await act(async () => result.current.start("run-tests", "tests", { network_name: "network-a" }));
    await act(async () => vi.advanceTimersByTimeAsync(CONSULTANT_POLL_INTERVAL_MS));
    expect(result.current.progressChart).toBe("data:image/png;base64,old");

    let startPromise: Promise<boolean>;
    act(() => {
      startPromise = result.current.start("improve", "improve", { network_name: "network-a" });
    });

    expect(result.current.progressChart).toBeNull();
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
        themeMode: "light",
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
          themeMode: "light",
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
          themeMode: "light",
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
