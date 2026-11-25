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

import ConsultantRunLog from "./ConsultantRunLog";

describe("ConsultantRunLog", () => {
  it("shows retained output for the selected run", () => {
    render(<ConsultantRunLog content={"first line\nsecond line\n"} />);

    expect(screen.getByText("Run log")).toBeTruthy();
    expect(screen.getByLabelText("Persisted run log").textContent).toContain("second line");
  });

  it("stays hidden until a run has output", () => {
    const { container } = render(<ConsultantRunLog content="" />);

    expect(container.childElementCount).toBe(0);
  });
});
