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
 * The single door between nsflow and @cognizant-ai-lab/ui-common.
 *
 * Every ui-common symbol the app uses is re-exported here, and the deep dist
 * paths behind these specifiers live in ../../aliases.ts (which also records why
 * the barrel is bypassed and why the xyflow/zustand pins move in lockstep).
 * Import from "../uiCommon" everywhere else, never from "@ui-common/*" directly,
 * so a ui-common version bump stays a two-file change.
 */

/**
 * DELIBERATELY NOT RE-EXPORTED: ui-common's neuro-san controller
 * (`sendChatQuery`, `sendNetworkDesignerRequest`, `getConnectivity`,
 * `getAgentNetworks`) and its `useEnvironmentStore`.
 *
 * Those call a neuro-san server straight from the browser, which is how
 * neuro-san-ui is built. nsflow deliberately does not do that: it already has a
 * FastAPI backend that owns every conversation with neuro-san, and that stays
 * the single ingress. Adopting ui-common's *data* layer (sly_data key names, the
 * connectivity-list shape, graph helpers, the IndexedDB persist adapter) gives us
 * the shared contract without a second API layer in the frontend.
 *
 * The aliases for those modules still exist in ../../aliases.ts, because
 * ui-common's own AgentFlow imports its controller internally, so they must
 * resolve if we later render ui-common's visual components. At that point the
 * controller gets pointed at nsflow's own origin rather than at neuro-san.
 */

// The IndexedDB persist adapter: pure browser storage, no neuro-san involvement.
export { indexedDBStorage } from "@ui-common/state/IndexedDBStorage";

export {
  AGENT_NETWORK_DEFINITION_KEY,
  AGENT_NETWORK_DESIGNER_ID,
  AGENT_NETWORK_HOCON,
  AGENT_NETWORK_NAME_KEY,
  type AgentNetworkDefinitionEntry,
} from "@ui-common/mac/const";

export { extractAgentNetworkDesignerProgress } from "@ui-common/mac/AgentNetworkDesigner";

export { getFrontman, getParentAgents, getParents } from "@ui-common/graph/GraphStructure";

export {
  type AgentInfo,
  type ChatContext,
  type ChatMessage,
  ChatMessageType,
  type ConnectivityInfo,
} from "@ui-common/types";
