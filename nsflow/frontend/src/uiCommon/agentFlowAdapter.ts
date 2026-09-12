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
 * The seam between nsflow's visual layer and ui-common's.
 *
 * nsflow's components speak `EditorCanvasProps`; ui-common's AgentFlow speaks
 * `AgentFlowProps`, whose names have already moved once (1.5.1 to 1.11.0). Keeping
 * that knowledge here means a ui-common bump touches this file alone.
 *
 * Note what `neuroSanURL` is set to: nsflow's OWN origin, not a neuro-san server.
 * ui-common's AgentFlow uses its controller internally, and that controller calls
 * neuro-san's HTTP contract. Because nsflow's backend now mirrors that contract,
 * pointing it at nsflow means its components would work here without the browser
 * ever talking to neuro-san directly. That is precisely why the backend facade was
 * built before this.
 *
 * Rendering ui-common's AgentFlow for real additionally needs its Settings and
 * TemporaryNetworks stores provided; until then this maps props and keeps nsflow's
 * own canvas honest about the contract.
 */

import type { EditorCanvasProps } from "../types/editorCanvas";
import type { AgentNetworkDefinitionEntry, ConnectivityInfo } from "./index";

/** The subset of ui-common's AgentFlowProps that nsflow actually drives. */
export type AgentFlowPropsShape = {
  readonly id: string;
  readonly agentsInNetwork: ConnectivityInfo[];
  readonly networkId?: string;
  readonly networkDisplayName?: string;
  readonly neuroSanURL?: string;
  readonly isEditingNetwork?: boolean;
  readonly isStreaming?: boolean;
  readonly setIsEditingNetwork?: (value: boolean) => void;
  readonly onSaveAgent?: (
    agentName: string,
    updated: AgentNetworkDefinitionEntry[],
    agentNetworkName: string | undefined,
    signal: AbortSignal
  ) => Promise<void>;
  readonly thoughtBubbleEdges: Map<string, { edge: unknown; timestamp: number }>;
};

export const toAgentFlowProps = (props: EditorCanvasProps): AgentFlowPropsShape => ({
  id: props.id,
  agentsInNetwork: props.definition,
  networkId: props.networkId,
  networkDisplayName: props.networkName,
  // nsflow's origin, deliberately: see the note at the top of this file.
  neuroSanURL: props.apiUrl,
  isEditingNetwork: props.isEditing,
  isStreaming: props.isStreaming,
  setIsEditingNetwork: props.setIsEditing,
  onSaveAgent: props.onSaveAgent,
  // Required by AgentFlowProps; nsflow does not use thought bubbles.
  thoughtBubbleEdges: new Map(),
});
