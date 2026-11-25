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
import { describe, expect, it, vi } from "vitest";

import ConsultantRunSelector from "./ConsultantRunSelector";

describe("ConsultantRunSelector", () => {
  it("shows retained runs and selects an older run", async () => {
    const onSelect = vi.fn();
    render(
      <ConsultantRunSelector
        runs={[
          {
            job_id: "new-job",
            network_name: "basic/coffee",
            origin: "tests",
            started_at: "2026-11-25T18:00:00Z",
            returncode: 0,
          },
          {
            job_id: "old-job",
            network_name: "basic/coffee",
            origin: "improve",
            started_at: "2026-11-24T18:00:00Z",
            returncode: 0,
          },
        ]}
        selectedJobId="new-job"
        disabled={false}
        onSelect={onSelect}
      />,
    );

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByText(/Improve/));

    expect(onSelect).toHaveBeenCalledWith("old-job");
  });
});
