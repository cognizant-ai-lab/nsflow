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

import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { uiCommonAliases } from "../../aliases";

/**
 * ui-common is tested in its own repo, so this is not a test of its behaviour.
 *
 * What it guards is OUR wiring: the deep dist paths in ../../aliases.ts. Those are
 * internal to the package and have already moved once (1.5.1 -> 1.11.0 relocated
 * AgentFlow.js into an AgentFlow/ subdirectory), so a version bump can silently
 * break resolution.
 */
describe("ui-common alias map", () => {
  // Derived from the map rather than hand-listed, so a newly added alias is
  // covered automatically. A hand-written list previously omitted
  // @ui-common/graph/AgentFlow -- the one alias that had actually moved.
  it.each(Object.entries(uiCommonAliases))("%s points at a file that exists", (_specifier, target) => {
    expect(existsSync(target)).toBe(true);
  });

  // The modules we import at runtime are additionally loaded for real. The visual
  // modules (graph/AgentFlow) are deliberately excluded: importing one pulls MUI,
  // xyflow and dagre through vitest's transform and took the suite from 1.6s to
  // 27s, so their resolution is covered by the existence check above plus the
  // production build.
  it("loads the non-visual modules the data layer uses", async () => {
    const modules = await Promise.all([
      import("@ui-common/agent"),
      import("@ui-common/llm"),
      import("@ui-common/state/Environment"),
      import("@ui-common/state/ChatHistory"),
      import("@ui-common/state/IndexedDBStorage"),
      import("@ui-common/mac/const"),
      import("@ui-common/mac/AgentNetworkDesigner"),
      import("@ui-common/graph/GraphStructure"),
      import("@ui-common/types"),
    ]);

    expect(modules).toHaveLength(9);
    for (const module of modules) expect(module).toBeDefined();

    // StreamingUnit lives in the llm controller, not the agent one -- the one
    // placement that is easy to get wrong when adding an alias.
    const { StreamingUnit } = await import("@ui-common/llm");
    expect(StreamingUnit.Line).toBeDefined();
  });
});
