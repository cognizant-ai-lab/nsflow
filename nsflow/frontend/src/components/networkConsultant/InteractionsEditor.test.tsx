/*
Copyright © 2026 Cognizant Technology Solutions Corp, www.cognizant.com.

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

import InteractionsEditor from "./InteractionsEditor";
import { emptyInteraction } from "../../state/networkConsultantFixtures";

describe("InteractionsEditor", () => {
  it("adds a discovered coded-tool sly data variable to the test interaction", () => {
    const interaction = emptyInteraction();
    const onChange = vi.fn();
    render(<InteractionsEditor interactions={[interaction]} onChange={onChange} slyDataKeys={["timezone"]} />);

    fireEvent.click(screen.getByRole("button", { name: "Add Sly Data Override" }));

    const nextInteractions = onChange.mock.calls[0][0];
    expect(nextInteractions[0].slyData).toEqual([
      { id: expect.any(String), key: "timezone", value: "", valueType: "string" },
    ]);
  });

  it("does not allow a test to invent a sly data variable", () => {
    const interaction = emptyInteraction();
    render(<InteractionsEditor interactions={[interaction]} onChange={vi.fn()} slyDataKeys={[]} />);

    const addButton = screen.getByRole("button", { name: "Add Sly Data Override" });
    expect(addButton.hasAttribute("disabled")).toBe(true);
    expect(
      screen.queryByText("This network's coded tools do not reference any literal sly_data variables."),
    ).not.toBeNull();
  });
});
