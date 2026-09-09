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

/**
 * A widget names its icon in data, so the name can be anything and is never known at
 * build time. The set it resolves against is deliberately fixed, because reaching the
 * whole MUI set costs 3.7 MB in the bundle. That makes the unrecognised name path the
 * normal case rather than an edge case, and so the thing most worth pinning down.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { COMMON_WIDGET_ICONS, FALLBACK_WIDGET_ICON, hasIcon, resolveIcon } from "./iconResolver";

describe("resolveIcon", () => {
  afterEach(() => vi.restoreAllMocks());

  it("resolves a name in the set", () => {
    expect(resolveIcon("Psychology")).toBeDefined();
    expect(resolveIcon("Psychology")).not.toBe(FALLBACK_WIDGET_ICON);
  });

  it("falls back rather than rendering nothing for an unrecognised name", () => {
    // The widget header is laid out around having an icon, so an empty space would
    // read as a rendering bug rather than as an unrecognised name.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveIcon("NoSuchIconAlpha")).toBe(FALLBACK_WIDGET_ICON);
  });

  it("says which name was not recognised, so a widget author can fix it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    resolveIcon("NoSuchIconBravo");
    expect(warn.mock.calls[0][0]).toContain("NoSuchIconBravo");
  });

  it("reports an unrecognised name once, not on every render", () => {
    // This runs on every render of every widget card, and console.warn is slow.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    resolveIcon("NoSuchIconCharlie");
    resolveIcon("NoSuchIconCharlie");
    resolveIcon("NoSuchIconCharlie");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("accepts the Outlined variant of a name in either direction", () => {
    // Widget authors write both, and neither should land on the fallback when the
    // other form is available.
    expect(resolveIcon("SearchOutlined")).toBe(resolveIcon("Search"));
    expect(resolveIcon("HelpOutlined")).toBe(resolveIcon("Help"));
  });

  it("returns the same component reference every time, so nothing remounts", () => {
    expect(resolveIcon("Search")).toBe(resolveIcon("Search"));
  });

  it("returns nothing when no name was given, which is not a failure", () => {
    expect(resolveIcon()).toBeUndefined();
    expect(resolveIcon("")).toBeUndefined();
  });
});

describe("hasIcon", () => {
  it("reports membership of the set, not the fallback", () => {
    expect(hasIcon("Search")).toBe(true);
    expect(hasIcon("NoSuchIconDelta")).toBe(false);
  });

  it("lists every name it will resolve", () => {
    expect(COMMON_WIDGET_ICONS).toContain("Search");
    expect(COMMON_WIDGET_ICONS.every((name) => hasIcon(name))).toBe(true);
  });
});
