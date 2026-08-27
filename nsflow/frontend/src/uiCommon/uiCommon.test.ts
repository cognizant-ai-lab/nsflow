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

/**
 * ui-common is tested in its own repo — this is not a test of its behaviour.
 *
 * What it guards is OUR wiring: the deep dist paths in ../../aliases.ts. Those
 * are internal to the package and have already moved once (1.5.1 -> 1.11.0
 * relocated AgentFlow.js into an AgentFlow/ subdirectory), so a version bump can
 * silently break resolution. One import per aliased specifier catches that.
 */
describe("ui-common alias map", () => {
  it("resolves every aliased specifier", async () => {
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

    // StreamingUnit lives in the llm controller, not the agent one — the one
    // placement that is easy to get wrong when adding an alias.
    const { StreamingUnit } = await import("@ui-common/llm");
    expect(StreamingUnit.Line).toBeDefined();
  });
});
