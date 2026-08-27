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

import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// @cognizant-ai-lab/ui-common exposes only "." (its barrel) and "./const" in package
// `exports`, and the barrel `export *`s modules that import next-auth/react and
// next/router. We therefore bypass the barrel entirely and alias stable specifiers
// straight at built modules inside dist. THIS FILE IS THE ONLY PLACE dist paths may
// appear — a ui-common bump is a one-file fix here (1.5.1 -> 1.11.0 already moved
// AgentFlow.js into an AgentFlow/ subdirectory).
const uiCommonDist = path.resolve(dirname, "node_modules/@cognizant-ai-lab/ui-common/dist");

const mac = "components/MultiAgentAccelerator";

export const uiCommonAliases: Record<string, string> = {
  "@ui-common/agent": path.join(uiCommonDist, "controller/agent/Agent.js"),
  "@ui-common/llm": path.join(uiCommonDist, "controller/llm/LlmChat.js"),
  "@ui-common/state/Environment": path.join(uiCommonDist, "state/Environment.js"),
  "@ui-common/state/ChatHistory": path.join(uiCommonDist, "state/ChatHistory.js"),
  "@ui-common/state/IndexedDBStorage": path.join(uiCommonDist, "state/IndexedDBStorage.js"),
  "@ui-common/mac/const": path.join(uiCommonDist, `${mac}/const.js`),
  "@ui-common/mac/AgentNetworkDesigner": path.join(uiCommonDist, `${mac}/AgentNetworkDesigner.js`),
  "@ui-common/graph/GraphStructure": path.join(uiCommonDist, `${mac}/AgentFlow/GraphStructure.js`),
  "@ui-common/graph/AgentFlow": path.join(uiCommonDist, `${mac}/AgentFlow/AgentFlow.js`),
  "@ui-common/types": path.join(uiCommonDist, "generated/neuro-san/NeuroSanClient.js"),
};
