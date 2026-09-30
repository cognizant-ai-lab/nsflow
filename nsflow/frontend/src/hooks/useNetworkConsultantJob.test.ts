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
import { getConsultantJob, startConsultantJob } from "../utils/networkConsultantApi";

const mockedGetJob = vi.mocked(getConsultantJob);
const mockedStartJob = vi.mocked(startConsultantJob);

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
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
});
