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

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import NetworkConsultantPanel from "./NetworkConsultantPanel";
import { useNetworkConsultantJob } from "../hooks/useNetworkConsultantJob";

const { refreshFixtures } = vi.hoisted(() => ({ refreshFixtures: vi.fn() }));

vi.mock("../context/ApiPortContext", () => ({ useApiPort: () => ({ apiUrl: "http://api" }) }));
vi.mock("../context/ChatContext", () => ({ useChatContext: () => ({ sessionId: "session" }) }));
vi.mock("../hooks/useConsultantFixtures", () => ({
  useConsultantFixtures: () => ({ fixtureNames: ["coffee.hocon"], fixtureError: null, refresh: refreshFixtures }),
}));
vi.mock("../hooks/useNetworkConsultantJob", () => ({ useNetworkConsultantJob: vi.fn() }));

const mockedJobHook = vi.mocked(useNetworkConsultantJob);
const start = vi.fn();

describe("NetworkConsultantPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedJobHook.mockReturnValue({
      jobId: null,
      jobOrigin: null,
      starting: false,
      busy: false,
      running: false,
      returncode: null,
      error: null,
      setError: vi.fn(),
      pendingQuestion: null,
      toolIssues: [],
      ungrounded: [],
      progressChart: null,
      results: {},
      submittingAnswer: false,
      stopping: false,
      start,
      submitAnswer: vi.fn(),
      stop: vi.fn(),
    });
  });

  it("keeps the existing run, generate, and improve request payloads", () => {
    render(<NetworkConsultantPanel selectedNetwork="basic/coffee" />);

    fireEvent.click(screen.getByRole("button", { name: "Run all" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    fireEvent.click(screen.getByRole("button", { name: "Improve" }));

    expect(start).toHaveBeenNthCalledWith(1, "run-tests", "tests", { network_name: "basic/coffee" });
    expect(start).toHaveBeenNthCalledWith(2, "generate-tests", "generate", {
      network_name: "basic/coffee",
      test_level: "normal",
      test_guidance: "",
    });
    expect(start).toHaveBeenNthCalledWith(3, "improve", "improve", {
      network_name: "basic/coffee",
      direction: "",
      test_level: "normal",
      max_iterations: 10,
      success_ratio: "3/3",
    });
  });
});
