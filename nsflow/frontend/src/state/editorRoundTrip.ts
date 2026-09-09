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
 * Sends a manual edit to the agent network designer and folds the echoed,
 * canonical definition back into the store.
 *
 * This goes through nsflow's own backend, never to a neuro-san server directly:
 * nsflow is the single ingress, and its neuro-san-shaped
 * `/api/v1/{agent}/streaming_chat` route performs the sly_data merge and MCP token
 * injection that a direct call would bypass.
 *
 * It deliberately does NOT use the chat WebSocket. That socket is the chat
 * transcript, so an edit sent over it would appear as a synthetic chat turn in the
 * chat panel, and editing would stop working whenever the panel is unmounted. The
 * HTTP route is stateless and independent of the chat session, and the designer's
 * progress frames arrive inline on the same stream.
 */

import {
  AGENT_NETWORK_DEFINITION_KEY,
  AGENT_NETWORK_DESIGNER_ID,
  AGENT_NETWORK_HOCON,
  AGENT_NETWORK_NAME_KEY,
  type ChatMessage,
  type ConnectivityInfo,
} from "../uiCommon";
import { listToDict, toConnectivityList } from "./definitionShape";
import { type ServerNetworkPayload, useEditorNetworkStore } from "./editorNetworkStore";

/** One line of the stream: neuro-san wraps each chat message under `response`. */
type StreamFrame = { response?: ChatMessage & { sly_data?: Record<string, unknown> } };

/**
 * Read one streamed frame.
 *
 * Returns undefined unless the frame actually carries a definition: a frame with
 * only a name must never reach the store, because the definition and name have to
 * stay atomic. The backend persists the definition under `agent_network_name`, so
 * pairing a fresh definition with a stale name can overwrite a different network.
 *
 * The echoed definition arrives in the designer's DICT shape, not the list shape we
 * send, so it is normalised here. Requiring a list meant the canonical echo was
 * silently discarded and the store kept whatever the optimistic apply had left.
 */
export const parseEchoedPayload = (frame: unknown): ServerNetworkPayload | undefined => {
  const slyData = (frame as StreamFrame)?.response?.sly_data;
  if (!slyData) return undefined;

  const definition = toConnectivityList(slyData[AGENT_NETWORK_DEFINITION_KEY]);
  if (!definition) return undefined;

  return {
    definition,
    networkName: slyData[AGENT_NETWORK_NAME_KEY] as string | undefined,
    hocon: slyData[AGENT_NETWORK_HOCON] as string | undefined,
  };
};

/**
 * Handle one line of the stream: report it for progress, and reconcile it into the
 * store if it carries a definition.
 */
const handleFrameLine = (
  line: string,
  networkId: string,
  onFrame?: (frame: ChatMessage) => void
): void => {
  if (!line.trim()) return;
  let frame: unknown;
  try {
    frame = JSON.parse(line);
  } catch {
    // A partial or malformed line is not worth failing the whole edit over.
    return;
  }
  const message = (frame as StreamFrame)?.response;
  if (message && onFrame) onFrame(message);

  const payload = parseEchoedPayload(frame);
  if (payload) useEditorNetworkStore.getState().reconcileFromServer(networkId, payload);
};

export type SendEditorUpdateArgs = {
  /** nsflow's own API origin. */
  readonly apiUrl: string;
  /** Store key for the network being edited. */
  readonly networkId: string;
  /** The agent whose change prompted this edit, named in the message text. */
  readonly agentName: string;
  /** The edited definition, in canonical connectivity-list form. */
  readonly definition: ConnectivityInfo[];
  /**
   * The backend's canonical network name. Defaults to whatever the store holds for
   * this network, which is almost always what you want: verified against a live
   * designer, an edit sent WITHOUT a name is canonicalised but never persisted (the
   * echo carries no `agent_network_hocon_text` and no name), while an edit sent
   * WITH one is assembled and saved under it. Passing it explicitly is only for
   * renames.
   */
  readonly networkName?: string;
  /**
   * What the edit is, for the chat transcript and the designer's logs. Defaults to
   * naming the agent, which is what most edits are; a whole-network change like
   * naming the network says so instead.
   */
  readonly message?: string;
  readonly signal?: AbortSignal;
  /** Called per streamed frame, for progress feedback while an edit applies. */
  readonly onFrame?: (frame: ChatMessage) => void;
};

export const sendEditorUpdate = async ({
  apiUrl,
  networkId,
  agentName,
  definition,
  networkName,
  message,
  signal,
  onFrame,
}: SendEditorUpdateArgs): Promise<void> => {
  const store = useEditorNetworkStore.getState();
  // Fall back to the name the store already learned from a previous echo, so an
  // edit cannot silently stop persisting just because a caller omitted it.
  const targetName = networkName ?? store.entries[networkId]?.networkName;

  const response = await fetch(`${apiUrl}/api/v1/${AGENT_NETWORK_DESIGNER_ID}/streaming_chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      // The API wants a user message even for a deterministic edit.
      user_message: { text: message ?? `Update instructions for agent "${agentName}"` },
      chat_filter: { chat_filter_type: "MAXIMAL" },
      sly_data: {
        // Sent as the designer's dict shape; see definitionShape for why the list
        // shape silently reclassifies an agent with empty instructions as a tool.
        [AGENT_NETWORK_DEFINITION_KEY]: listToDict(definition),
        ...(targetName ? { [AGENT_NETWORK_NAME_KEY]: targetName } : {}),
        // Apply the edit as given instead of having the designer reason about the
        // whole network again.
        skip_designer: true,
      },
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Editor update failed: ${response.status} ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  // Chunks do not arrive aligned to line boundaries, so hold the tail until a
  // newline completes it.
  let buffered = "";
  let frames = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) frames += 1;
      handleFrameLine(line, networkId, onFrame);
    }
  }
  if (buffered.trim()) frames += 1;
  handleFrameLine(buffered, networkId, onFrame);

  // A streaming response commits its 200 before the first chunk, so a failure
  // partway through cannot change the status: the backend logs it and the stream
  // simply ends. An empty stream is therefore the only signal that the edit never
  // reached the designer, and treating it as success would leave the optimistic
  // apply on the canvas looking saved when nothing was.
  if (frames === 0) {
    throw new Error("Editor update failed: the designer returned an empty stream");
  }
};
