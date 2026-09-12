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
 * Feeds the editor store from nsflow's progress and sly_data WebSocket streams.
 *
 * This is the chat lane's half of the picture. Manual edits reach the store
 * directly through `editorRoundTrip`; changes the designer makes during a chat turn
 * arrive here instead, over the sockets nsflow already proxies. Both end at the
 * same reducer, so the canvas does not care which produced a change.
 *
 * nsflow has two streams to reconcile and two payload dialects to accept: a dict
 * keyed by agent name under `agent_network_definition` (the designer's default
 * "internal" progress style), or a connectivity list under `connectivity_info`.
 * `utils/progressHelper.ts` already handles that and is pure, so it is reused
 * as-is; this module is the consumer it anticipated.
 */

import { useEffect } from "react";

import { useChatContext } from "../context/ChatContext";
import { type ConnectivityInfo } from "../uiCommon";
import { latestNetworkPayload } from "../utils/progressHelper";
import { toConnectivityList } from "./definitionShape";
import { useEditorNetworkStore } from "./editorNetworkStore";

type Frame = { text: string | object } | string | object | undefined;

/**
 * The freshest definition across the two streams, in list form.
 *
 * Returns undefined when neither carries a definition: a definition-less frame must
 * never overwrite one that has a definition, which is why the ranking lives in
 * progressHelper rather than here.
 */
export const definitionFromFrames = (
  progressFrame: Frame,
  slyDataFrame: Frame,
  preferProgress: boolean
): ConnectivityInfo[] | undefined => {
  const payload = latestNetworkPayload(progressFrame, slyDataFrame, preferProgress);
  const definition = payload?.agent_network_definition;
  if (!definition) return undefined;

  return toConnectivityList(definition);
};

export const applyFramesToStore = (
  networkId: string | undefined,
  progressFrame: Frame,
  slyDataFrame: Frame,
  preferProgress: boolean
): void => {
  if (!networkId) return;

  const definition = definitionFromFrames(progressFrame, slyDataFrame, preferProgress);
  if (!definition) return;

  const payload = latestNetworkPayload(progressFrame, slyDataFrame, preferProgress);
  useEditorNetworkStore
    .getState()
    .reconcileFromServer(networkId, { definition, networkName: payload?.agent_network_name });
};

/**
 * Mount inside the editor. Watches the frames ChatContext records and pushes the
 * freshest definition into the store.
 *
 * NOTE the two different network names, which are NOT interchangeable:
 *
 *   - frames are looked up under ChatContext's `targetNetwork`, because that is the
 *     socket they arrived on. In editor mode that is the designer agent's name
 *     (`wandName`), not the network being edited, since TabbedChatPanel opens
 *     /ws/progress/{targetNetwork} and tags every frame with it.
 *   - the store is written under `networkId`, the network the editor is showing.
 *
 * Reading frames under `networkId` finds an empty bucket and the canvas stays
 * blank. The pre-store code avoided this by calling getLatestNetworkPayload() with
 * no argument, which defaulted to `targetNetwork`.
 */
export const useEditorProgressBridge = (networkId: string | undefined): void => {
  const {
    getLastProgressMessage,
    getLastSlyDataMessage,
    targetNetwork,
    progressTick,
    slyDataTick,
    lastProgressAt,
    lastSlyDataAt,
  } = useChatContext();

  useEffect(() => {
    if (!networkId || !targetNetwork) return;
    applyFramesToStore(
      networkId,
      getLastProgressMessage({ network: targetNetwork }),
      getLastSlyDataMessage({ network: targetNetwork }),
      lastProgressAt >= lastSlyDataAt
    );
    // progressTick and slyDataTick change on every recorded frame, which is what
    // makes this run per frame rather than per render.
  }, [
    networkId,
    targetNetwork,
    progressTick,
    slyDataTick,
    lastProgressAt,
    lastSlyDataAt,
    getLastProgressMessage,
    getLastSlyDataMessage,
  ]);
};
