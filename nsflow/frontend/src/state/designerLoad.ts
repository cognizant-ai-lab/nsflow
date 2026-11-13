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
 * Asks the agent network designer to load a network file, and returns what came back.
 *
 * It writes nothing to the editor store or the chat. The caller decides where it goes.
 */

import { AGENT_NETWORK_DESIGNER_ID, AGENT_NETWORK_HOCON, type ConnectivityInfo } from "../uiCommon";
import { isExternalName } from "./definitionShape";
import type { NetworkMetadataBlock, ServerNetworkPayload } from "./editorNetworkStore";
import { parseEchoedPayload } from "./editorRoundTrip";

/** The designer's sly_data key for the file to load. */
export const AGENT_NETWORK_HOCON_FILE_KEY = "agent_network_hocon_file";

/** The first neuro-san-studio release whose designer loads a file without saving it. */
const MIN_STUDIO_VERSION = "0.4.3";

/**
 * The file the designer loads for a served network. A served name is its manifest key
 * without the suffix, and the designer needs the file.
 */
export const designerLoadFile = (servedName: string): string => `${servedName}.hocon`;

/** A network the designer loaded, in the form the editor keeps: a coded tool has no description. */
export type LoadedNetwork = {
  readonly definition: ConnectivityInfo[];
  /** The file's metadata block, or null when the file has none. */
  readonly metadata: NetworkMetadataBlock | null;
};

/** What loadNetworkThroughDesigner needs to load one network. */
export type LoadNetworkArgs = {
  /** nsflow's own API origin. */
  readonly apiUrl: string;
  /** The network's name as /api/v1/list serves it, such as "basic/music_nerd". */
  readonly servedName: string;
  /** Once it aborts, the call rejects with an AbortError. */
  readonly signal?: AbortSignal;
};

/** One line of the stream, with the parts of the message a load reads. */
type LoadFrame = {
  response?: { text?: unknown; structure?: { error?: unknown }; sly_data?: unknown };
};

/**
 * Throw the error an aborted fetch throws. The body can arrive after the abort, so it is
 * checked again once read.
 */
const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw new DOMException("The load was aborted.", "AbortError");
};

/** The `detail` of an error response's JSON body, or undefined when it has none. */
const errorDetail = async (response: Response): Promise<string | undefined> => {
  try {
    const detail = ((await response.json()) as { detail?: unknown } | null)?.detail;
    return typeof detail === "string" ? detail : undefined;
  } catch {
    return undefined;
  }
};

/** The designer's last error without its "Error: " prefix, or undefined when it sent none. */
const designerError = (frames: LoadFrame[]): string | undefined => {
  let error: string | undefined;
  for (const frame of frames) {
    // Read from the frame's structure: the reply text holds the same error as a json block.
    const frameError = frame?.response?.structure?.error;
    if (typeof frameError === "string" && frameError.trim()) error = frameError;
  }
  return error?.replace(/^Error:\s*/, "");
};

/**
 * Ask the designer to load a served network's file, and return its definition and block.
 *
 * Rejects with the designer's error, or with a message of its own when the request fails,
 * nothing usable comes back, or studio saved instead of loading. Rejects with an
 * AbortError once the signal aborts.
 */
export const loadNetworkThroughDesigner = async ({
  apiUrl,
  servedName,
  signal,
}: LoadNetworkArgs): Promise<LoadedNetwork> => {
  const response = await fetch(`${apiUrl}/api/v1/${AGENT_NETWORK_DESIGNER_ID}/streaming_chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      user_message: { text: `Load agent network "${servedName}"` },
      chat_filter: { chat_filter_type: "MAXIMAL" },
      // A file and the boolean true, with no definition, make the turn load-only: the
      // designer reads the file and saves nothing.
      sly_data: { [AGENT_NETWORK_HOCON_FILE_KEY]: designerLoadFile(servedName), skip_designer: true },
    }),
  });
  throwIfAborted(signal);
  if (!response.ok) {
    const detail = await errorDetail(response);
    throwIfAborted(signal);
    throw new Error(detail || `${response.status} ${response.statusText}`);
  }

  const body = await response.text();
  throwIfAborted(signal);

  const frames: LoadFrame[] = [];
  let lines = 0;
  for (const line of body.split("\n")) {
    if (!line.trim()) continue;
    lines += 1;
    try {
      frames.push(JSON.parse(line) as LoadFrame);
    } catch {
      // A malformed line is not worth failing the load over.
    }
  }
  // nsflow's route answers 200 with an empty stream when neuro-san fails before its first frame.
  if (lines === 0) {
    throw new Error(
      `the designer sent no reply. Check that the neuro-san server is running and serves ${AGENT_NETWORK_DESIGNER_ID}.`
    );
  }

  // Older studio saves the network on this request, and only a save sends the HOCON text.
  for (const frame of frames) {
    const slyData = frame?.response?.sly_data;
    if (slyData && typeof slyData === "object" && AGENT_NETWORK_HOCON in slyData) {
      throw new Error(
        `neuro-san-studio saved this network instead of opening it. Load Existing needs neuro-san-studio ${MIN_STUDIO_VERSION} or later.`
      );
    }
  }

  // An error fails the load even when a definition comes with it, which older studio can send.
  const error = designerError(frames);
  if (error) throw new Error(error);

  let payload: ServerNetworkPayload | undefined;
  for (const frame of frames) payload = parseEchoedPayload(frame) ?? payload;
  if (!payload) throw new Error("the designer did not return the network");
  if (payload.definition.length === 0) throw new Error("the designer returned no agents");

  const definition = payload.definition.map((entry): ConnectivityInfo => {
    const withText = entry as ConnectivityInfo & { instructions?: string; description?: string };
    const external = entry.origin !== undefined && isExternalName(entry.origin);
    if (external || withText.instructions !== undefined || withText.description === undefined) return entry;
    // The designer drops blank instructions but keeps an empty description, which only an
    // agent gets. Put the instructions key back so the entry stays an agent.
    if (withText.description === "") return { ...withText, instructions: "" } as ConnectivityInfo;
    // A coded tool comes back with only its description, and nsflow tells a tool from an agent
    // by it having neither text field (isToolboxTool).
    const { description: _description, ...tool } = withText;
    return tool;
  });

  // The designer always sends the key, {} for a file with no block, and a {} sent back on
  // the next save wipes the block of the file it saves over.
  const metadata = payload.metadata && Object.keys(payload.metadata).length > 0 ? payload.metadata : null;

  return { definition, metadata };
};
