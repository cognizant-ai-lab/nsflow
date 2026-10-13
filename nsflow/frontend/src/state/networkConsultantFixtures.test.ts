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
  fixtureToDraft,
  uniqueCopyName,
} from "./networkConsultantFixtures";
import type { ConsultantFixture } from "../types/networkConsultant";

describe("network consultant fixture state", () => {
  it("converts numeric and list checks to their wire types", () => {
    const interaction = emptyInteraction();
    interaction.text = "Test prompt";
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
    interaction.text = "Test prompt";
    interaction.checks = [{ id: "value", checkType: "value", value: "not a number" }];
    interaction.slyData = [{ id: "sly", key: "", value: "present", valueType: "string" }];

    const result = buildInteractionsPayload([interaction]);

    expect(result.errors).toEqual([
      "Turn 1: a sly_data entry needs a variable name.",
      'Turn 1: "value" must be a number.',
    ]);
  });

  it("assigns a fixture value to a coded tool sly data variable", () => {
    const interaction = emptyInteraction();
    interaction.text = "Test prompt";
    interaction.checks = [{ id: "gist", checkType: "gist", value: "Uses the requested timezone" }];
    interaction.slyData = [
      { id: "timezone", key: "timezone", value: "America/Los_Angeles", valueType: "string" },
    ];

    const result = buildInteractionsPayload([interaction]);

    expect(result.errors).toEqual([]);
    expect(result.interactions[0].sly_data).toEqual({ timezone: "America/Los_Angeles" });
  });

  it("preserves every supported sly data value type while editing a fixture", () => {
    const fixture: ConsultantFixture = {
      name: "typed.hocon",
      agent: "typed",
      success_ratio: "1/1",
      connections: ["direct"],
      interactions: [
        {
          text: "Use typed values",
          timeout_in_seconds: 400,
          response_checks: { gist: ["Uses typed values"] },
          sly_data: {
            enabled: false,
            retries: 3,
            labels: ["one", "two"],
            settings: { mode: "strict" },
            optional: null,
            timezone: "America/Los_Angeles",
          },
        },
      ],
      raw_hocon: "",
      parse_error: null,
    };

    const draft = fixtureToDraft(fixture);
    const result = buildInteractionsPayload(draft.interactions);

    expect(result.errors).toEqual([]);
    expect(result.interactions[0].sly_data).toEqual(fixture.interactions[0].sly_data);
  });

  it("rejects invalid typed sly data values", () => {
    const interaction = emptyInteraction();
    interaction.text = "Test prompt";
    interaction.checks = [{ id: "gist", checkType: "gist", value: "Valid check" }];
    interaction.slyData = [
      { id: "retries", key: "retries", value: "many", valueType: "number" },
      { id: "settings", key: "settings", value: "{broken", valueType: "json" },
    ];

    const result = buildInteractionsPayload([interaction]);

    expect(result.errors).toEqual([
      'Turn 1: sly_data "retries" must be a number.',
      'Turn 1: sly_data "settings" must contain valid JSON.',
    ]);
  });

  it("rejects missing turns, prompts, and finite positive timeouts", () => {
    expect(buildInteractionsPayload([]).errors).toEqual(["At least one turn is required."]);

    const interaction = emptyInteraction();
    interaction.timeoutInSeconds = "Infinity";
    interaction.checks[0].value = "Expected response";

    expect(buildInteractionsPayload([interaction]).errors).toEqual([
      "Turn 1: a prompt is required.",
      "Turn 1: timeout must be a positive number.",
    ]);
  });

  it("rejects duplicate check types and sly data keys instead of overwriting them", () => {
    const interaction = emptyInteraction();
    interaction.text = "Test prompt";
    interaction.checks = [
      { id: "gist-1", checkType: "gist", value: "first" },
      { id: "gist-2", checkType: "gist", value: "second" },
    ];
    interaction.slyData = [
      { id: "timezone-1", key: "timezone", value: "UTC", valueType: "string" },
      { id: "timezone-2", key: "timezone", value: "PST", valueType: "string" },
    ];

    const result = buildInteractionsPayload([interaction]);

    expect(result.errors).toEqual([
      'Turn 1: sly_data "timezone" can only be used once.',
      'Turn 1: "gist" can only be used once.',
    ]);
    expect(result.interactions[0].sly_data).toEqual({ timezone: "UTC" });
    expect(result.interactions[0].response.text).toEqual({ gist: ["first"] });
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
