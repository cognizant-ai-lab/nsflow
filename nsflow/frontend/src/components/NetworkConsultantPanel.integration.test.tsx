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

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../context/ApiPortContext", () => ({ useApiPort: () => ({ apiUrl: "http://api" }) }));
vi.mock("../context/ChatContext", () => ({ useChatContext: () => ({ sessionId: "session" }) }));
vi.mock("../hooks/useConsultantFixtures", () => ({
  useConsultantFixtures: () => ({ fixtureNames: ["coffee.hocon"], fixtureError: null, refresh: vi.fn() }),
}));
vi.mock("../utils/networkConsultantApi", () => ({
  answerConsultantJob: vi.fn(),
  deleteConsultantFixture: vi.fn(),
  describeError: (error: unknown) => (error instanceof Error ? error.message : "Unexpected error"),
  describeErrors: (error: unknown) => [error instanceof Error ? error.message : "Unexpected error"],
  getConsultantJob: vi.fn(),
  listConsultantFixtures: vi.fn(),
  listSlyDataKeys: vi.fn(),
  saveConsultantFixture: vi.fn(),
  startConsultantJob: vi.fn(),
  stopConsultantJob: vi.fn(),
}));

import NetworkConsultantPanel from "./NetworkConsultantPanel";
import type { ConsultantEndpoint } from "../types/networkConsultant";
import { startConsultantJob } from "../utils/networkConsultantApi";

const mockedStartJob = vi.mocked(startConsultantJob);
const cases: Array<{ buttonName: string; endpoint: ConsultantEndpoint; body: Record<string, unknown> }> = [
  {
    buttonName: "Run all",
    endpoint: "run-tests",
    body: { network_name: "basic/coffee", session_id: "session" },
  },
  {
    buttonName: "Generate",
    endpoint: "generate-tests",
    body: {
      network_name: "basic/coffee",
      session_id: "session",
      test_guidance: "",
      test_level: "normal",
    },
  },
  {
    buttonName: "Improve",
    endpoint: "improve",
    body: {
      direction: "",
      max_iterations: 10,
      network_name: "basic/coffee",
      session_id: "session",
      success_ratio: "3/3",
      test_level: "normal",
    },
  },
];

describe("NetworkConsultantPanel integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedStartJob.mockResolvedValue("job-1");
  });

  it.each(cases)("wires $buttonName through the real job hook", async ({ buttonName, endpoint, body }) => {
    const { unmount } = render(<NetworkConsultantPanel selectedNetwork="basic/coffee" />);

    fireEvent.click(screen.getByRole("button", { name: buttonName }));

    await waitFor(() => expect(mockedStartJob).toHaveBeenCalledWith("http://api", endpoint, body));
    unmount();
  });
});
