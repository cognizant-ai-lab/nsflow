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

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/networkConsultantApi", () => ({
  deleteConsultantFixture: vi.fn(),
  describeError: (error: unknown) => (error instanceof Error ? error.message : "Unexpected error"),
  describeErrors: (error: unknown) => [error instanceof Error ? error.message : "Unexpected error"],
  listConsultantFixtures: vi.fn(),
  listSlyDataKeys: vi.fn(),
  saveConsultantFixture: vi.fn(),
}));

import { useConsultantFixtureEditor } from "./useConsultantFixtureEditor";
import { listConsultantFixtures, listSlyDataKeys, saveConsultantFixture } from "../utils/networkConsultantApi";
import type { ConsultantFixture } from "../types/networkConsultant";

const fixture: ConsultantFixture = {
  name: "sample.hocon",
  agent: "sample",
  success_ratio: "1/1",
  connections: ["direct"],
  interactions: [
    {
      text: "Say hello",
      timeout_in_seconds: 400,
      response_checks: { gist: ["hello"] },
      sly_data: {},
    },
  ],
  definition: {
    agent: "sample",
    success_ratio: "1/1",
    connections: ["direct"],
    use_direct: true,
    interactions: [
      {
        text: "Say hello",
        timeout_in_seconds: 400,
        response: { text: { gist: ["hello"] } },
        sly_data: {},
      },
    ],
  },
  raw_hocon: "# License\n{}",
  parse_error: null,
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
};

const mockedListFixtures = vi.mocked(listConsultantFixtures);
const mockedListSlyDataKeys = vi.mocked(listSlyDataKeys);
const mockedSaveFixture = vi.mocked(saveConsultantFixture);

describe("useConsultantFixtureEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListFixtures.mockResolvedValue([fixture]);
    mockedListSlyDataKeys.mockResolvedValue([]);
  });

  it("does not refresh the old network when a duplicate finishes after navigation", async () => {
    const pendingSave = deferred<void>();
    mockedSaveFixture.mockReturnValue(pendingSave.promise);
    const { result, rerender } = renderHook(
      ({ networkName }) =>
        useConsultantFixtureEditor({ apiUrl: "http://api", networkName, open: true }),
      { initialProps: { networkName: "network-a" } },
    );
    await waitFor(() => expect(result.current.fixtures).toEqual([fixture]));

    let duplicatePromise: Promise<void>;
    act(() => {
      duplicatePromise = result.current.duplicateFixture(fixture);
    });
    expect(mockedSaveFixture).toHaveBeenCalledWith(
      "http://api",
      "network-a",
      "sample_copy",
      fixture.definition,
      undefined,
      fixture.raw_hocon,
    );
    rerender({ networkName: "network-b" });
    await waitFor(() => expect(mockedListFixtures).toHaveBeenCalledWith(
      "http://api",
      "network-b",
      "Failed to load tests ({status})",
    ));
    await act(async () => {
      pendingSave.resolve();
      await duplicatePromise!;
    });

    expect(mockedListFixtures).toHaveBeenCalledTimes(2);
    expect(result.current.duplicatingName).toBeNull();
    expect(result.current.justCreatedName).toBeNull();
  });

  it("clears fixtures from the previous network when the next load fails", async () => {
    const { result, rerender } = renderHook(
      ({ networkName }) =>
        useConsultantFixtureEditor({ apiUrl: "http://api", networkName, open: true }),
      { initialProps: { networkName: "network-a" } },
    );
    await waitFor(() => expect(result.current.fixtures).toEqual([fixture]));
    mockedListFixtures.mockRejectedValueOnce(new Error("Network B failed"));

    rerender({ networkName: "network-b" });

    await waitFor(() => expect(result.current.error).toBe("Network B failed"));
    expect(result.current.fixtures).toEqual([]);
  });

  it("reports sly data discovery failures for the current network", async () => {
    mockedListSlyDataKeys.mockRejectedValue(new Error("Discovery failed"));
    const { result } = renderHook(() =>
      useConsultantFixtureEditor({ apiUrl: "http://api", networkName: "network-a", open: true }),
    );

    await waitFor(() => expect(result.current.error).toBe("Discovery failed"));
  });
});
