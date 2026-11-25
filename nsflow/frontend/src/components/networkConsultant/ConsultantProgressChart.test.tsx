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

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ConsultantProgressChart from "./ConsultantProgressChart";

describe("ConsultantProgressChart", () => {
  it("renders checkpoint labels and live pass counts", () => {
    render(
      <ConsultantProgressChart
        progress={[
          { checkpoint: "before", passed: 2, total: 5 },
          { checkpoint: "iteration", improvement_iteration: 1, passed: 4, total: 5, segments: [2, 2] },
          { checkpoint: "after", passed: 5, total: 5 },
        ]}
      />,
    );

    expect(screen.getByRole("img", { name: "Tests passing per improvement iteration" })).toBeTruthy();
    expect(screen.getByText("Before")).toBeTruthy();
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
    expect(screen.getByText("After")).toBeTruthy();
    expect(screen.getByText("2/5 (40%)")).toBeTruthy();
    expect(screen.getByText("4/5 (80%)")).toBeTruthy();
    expect(screen.getByText("5/5 (100%)")).toBeTruthy();
  });
});
