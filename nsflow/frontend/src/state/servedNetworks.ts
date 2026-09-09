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
 * Waiting for a freshly saved network to actually be served.
 *
 * Saving a network and being able to open it are not the same moment. The designer
 * writes the HOCON, but neuro-san only serves it after its next registry reload, so
 * anything that selects or launches the network immediately races that refresh and
 * gets a 404 with an empty canvas to show for it.
 *
 * The Editor's launch button handles this by staying disabled for one reload period,
 * a fixed delay. Polling is better where we can: it waits exactly as long as the
 * server actually takes, which is usually much less, and it does not silently give up
 * early on a slow one.
 */

import { getManifestUpdatePeriodMs, toServedNetworkPath } from "../utils/config";

/** One entry of `/api/v1/list`. */
type ListedAgent = { readonly agent_name?: string };

/** How often to ask. Frequent enough to feel immediate, rare enough not to hammer. */
const POLL_INTERVAL_MS = 400;

/**
 * Resolve once `networkName` appears in `/api/v1/list`, or when we give up.
 *
 * @returns the path the network is served under, or undefined if it never appeared.
 *
 * Both the raw name and the served path are accepted, because a generated network is
 * saved as `foo` but served as `generated/foo`, and callers know it by the former.
 *
 * Gives up after three reload periods rather than never: an import that silently
 * hangs is worse than one that reports it could not open the network.
 */
export const waitForServedNetwork = async (
  apiUrl: string,
  networkName: string,
  signal?: AbortSignal
): Promise<string | undefined> => {
  const servedPath = toServedNetworkPath(networkName);
  // Generous on purpose. The configured period is a hint, not a guarantee, and a
  // measured reload took about five seconds, which a 6s budget only just covers.
  // Waiting a little longer costs nothing here, since polling stops the moment the
  // network appears; giving up early strands the user with a blank canvas.
  const deadline = Date.now() + Math.max(getManifestUpdatePeriodMs() * 5, 20000);

  while (Date.now() < deadline) {
    if (signal?.aborted) return undefined;
    try {
      const response = await fetch(`${apiUrl}/api/v1/list`, { signal });
      if (response.ok) {
        const data = await response.json();
        const names = ((data?.agents ?? []) as ListedAgent[])
          .map((agent) => agent.agent_name)
          .filter((name): name is string => Boolean(name));
        // The served path is what a caller needs to fetch connectivity, so prefer it
        // when both forms are present.
        if (names.includes(servedPath)) return servedPath;
        if (names.includes(networkName)) return networkName;
      }
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return undefined;
      // A single failed poll is not a failed wait: the server may be mid-reload,
      // which is exactly the state we are waiting out.
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return undefined;
};
