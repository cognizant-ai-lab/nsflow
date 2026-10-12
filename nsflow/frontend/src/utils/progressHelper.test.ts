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

import { describe, expect, it } from "vitest";

import { parseCodeFenceJSON, progressIsNewer } from "./progressHelper";

/** JSON in a ```json fence, the way the sly_data socket records a frame. */
const fenced = (value: unknown) => `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;

describe("parseCodeFenceJSON", () => {
  it("parses fenced JSON whose strings contain a code fence", () => {
    // Agent instructions may show a reply format in a fenced block. The shortest
    // fenced body stops at that inner fence and is not JSON.
    const value = { frontman: { instructions: "Reply in a ```python``` block.", tools: [] } };
    expect(parseCodeFenceJSON(fenced(value))).toEqual(value);
  });

  it("parses unfenced JSON whose strings contain a code fence", () => {
    // The chat panel records what it sends as plain JSON. Both fence patterns match
    // inside the string, so the whole text has to be tried as well.
    const value = { frontman: { instructions: "Reply in a ```python``` block.", tools: [] } };
    expect(parseCodeFenceJSON(JSON.stringify(value, null, 2))).toEqual(value);
  });

  it("parses a first block that holds a code fence and is followed by another block", () => {
    const value = { frontman: { instructions: "Reply in a ```python``` block.", tools: [] } };
    expect(parseCodeFenceJSON(`${fenced(value)}\nThen:\n${fenced({ second: 2 })}`)).toEqual(value);
  });

  it("takes the first block when the text holds two fenced blocks", () => {
    expect(parseCodeFenceJSON(`${fenced({ first: 1 })}\nThen:\n${fenced({ second: 2 })}`)).toEqual({ first: 1 });
  });
});

describe("progressIsNewer", () => {
  it("is true only when the progress frame is strictly newer", () => {
    expect(progressIsNewer(2, 1)).toBe(true);
    expect(progressIsNewer(1, 2)).toBe(false);
  });

  it("gives a tie to the sly_data frame", () => {
    expect(progressIsNewer(5, 5)).toBe(false);
  });

  it("treats a stream with no frame yet as oldest", () => {
    expect(progressIsNewer(1, undefined)).toBe(true);
    expect(progressIsNewer(undefined, 1)).toBe(false);
    expect(progressIsNewer(undefined, undefined)).toBe(false);
  });
});
