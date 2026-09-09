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
 * nsflow's own contract for an editor canvas, deliberately NOT ui-common's
 * AgentFlowProps.
 *
 * It carries the same information, but the names are ours and stable. ui-common
 * renamed three of its props between 1.5.1 and 1.11.0 (isEditMode became
 * isEditingNetwork, isSelectedNetworkTemporary became isTemporaryNetwork, and the
 * enter/exit edit callbacks became a single setter), so binding nsflow's components
 * straight to it would mean churning them on every bump.
 * `uiCommon/agentFlowAdapter.tsx` translates between the two.
 *
 * The canvas is intentionally given the definition and a callback rather than
 * reaching into the store itself. That keeps it a rendering component, and it is
 * what will let richer editing (drag to add, right-click delete, hover pencil) be
 * added as UI without touching the data layer: each affordance computes the next
 * definition and hands it back.
 */

import type { AgentNetworkDefinitionEntry, ConnectivityInfo } from "../uiCommon";

export type EditorCanvasProps = {
  readonly id: string;
  /** Store key for the network being edited. */
  readonly networkId: string;
  /** The backend's canonical name for the network, when it has one. */
  readonly networkName?: string;
  /** The agent network definition, in canonical connectivity-list form. */
  readonly definition: ConnectivityInfo[];
  /** nsflow's own API origin. The canvas never talks to a neuro-san server. */
  readonly apiUrl: string;
  readonly isEditing: boolean;
  readonly isStreaming?: boolean;
  readonly setIsEditing: (isEditing: boolean) => void;
  /**
   * Persist one agent's change. The implementation applies it to the store and
   * round-trips it through nsflow.
   */
  readonly onSaveAgent: (
    agentName: string,
    updated: AgentNetworkDefinitionEntry[],
    agentNetworkName: string | undefined,
    signal: AbortSignal
  ) => Promise<void>;
};
