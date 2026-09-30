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

import { describe, expect, it } from "vitest";

import {
  buildInteractionsPayload,
  emptyInteraction,
  uniqueCopyName,
} from "./networkConsultantFixtures";
import type { ConsultantFixture } from "../types/networkConsultant";

describe("network consultant fixture state", () => {
  it("converts numeric and list checks to their wire types", () => {
    const interaction = emptyInteraction();
    interaction.checks = [
      { id: "gist", checkType: "gist", value: "first line\nsecond line" },
      { id: "greater", checkType: "greater", value: "12.5" },
    ];

    const result = buildInteractionsPayload([interaction]);

    expect(result.errors).toEqual([]);
    expect(result.interactions[0].response.text).toEqual({
      gist: ["first line", "second line"],
      greater: 12.5,
    });
  });

  it("reports invalid checks and unnamed sly data together", () => {
    const interaction = emptyInteraction();
    interaction.checks = [{ id: "value", checkType: "value", value: "not a number" }];
    interaction.slyData = [{ id: "sly", key: "", value: "present" }];

    const result = buildInteractionsPayload([interaction]);

    expect(result.errors).toEqual([
      "Turn 1: a sly_data entry needs a variable name.",
      'Turn 1: "value" must be a number.',
    ]);
  });

  it("increments duplicate names until it finds a free one", () => {
    const fixtures = ["sample.hocon", "sample_copy.hocon", "sample_copy2.hocon"].map(
      (name): ConsultantFixture => ({
        name,
        agent: "sample",
        success_ratio: "1/1",
        connections: ["direct"],
        interactions: [],
        raw_hocon: "",
        parse_error: null,
      }),
    );

    expect(uniqueCopyName(fixtures, "sample")).toBe("sample_copy3");
  });
});
