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

import TestFixturesDialog from "./TestFixturesDialog";
import { listConsultantFixtures, listSlyDataKeys } from "../utils/networkConsultantApi";

vi.mock("../context/ApiPortContext", () => ({ useApiPort: () => ({ apiUrl: "http://api" }) }));
vi.mock("../utils/networkConsultantApi", () => ({
  deleteConsultantFixture: vi.fn(),
  describeError: (error: unknown) => String(error),
  describeErrors: (error: unknown) => [String(error)],
  listConsultantFixtures: vi.fn(),
  listSlyDataKeys: vi.fn(),
  saveConsultantFixture: vi.fn(),
}));

const mockedListFixtures = vi.mocked(listConsultantFixtures);
const mockedListSlyDataKeys = vi.mocked(listSlyDataKeys);

describe("TestFixturesDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListSlyDataKeys.mockResolvedValue([]);
  });

  it("opens preserved raw HOCON for a malformed fixture", async () => {
    mockedListFixtures.mockResolvedValue([
      {
        name: "broken.hocon",
        agent: null,
        success_ratio: null,
        connections: [],
        interactions: [],
        raw_hocon: '{"agent": ',
        parse_error: "Expected a value",
      },
    ]);
    render(<TestFixturesDialog open onClose={vi.fn()} networkName="basic/coffee" />);

    const fixtureSummary = await screen.findByRole("button", { name: "broken" });
    fireEvent.click(fixtureSummary);
    expect(screen.getByText(/Could not parse this fixture/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View raw HOCON" }));

    const rawDialog = screen.getByRole("dialog", { name: "broken.hocon" });
    expect(rawDialog.textContent).toContain('{"agent": ');
  });
});
