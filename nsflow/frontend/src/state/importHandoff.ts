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
 * Carrying an imported network from the Home page to the Editor.
 *
 * Import is offered on both canvases, but only the Editor can hold a network under
 * design, so Home parses the file and then hands the result over. A `File` cannot
 * survive a route change, and the parsed payload is plain JSON, so the payload is
 * what travels.
 *
 * sessionStorage rather than a module variable: the Editor route may mount after a
 * full navigation, which would discard module state. Rather than the editor store
 * directly, because Home has no draft key to write under, and inventing one there
 * would put two places in charge of session identity.
 *
 * Read exactly once. An import the user has already seen must not reappear on every
 * later visit to the Editor.
 */

const HANDOFF_KEY = "nsflow-editor-import-handoff";

/** What the import endpoint returns, as it travels between pages. */
export type ImportedNetwork = {
  readonly network_name?: string;
  readonly definition: unknown;
  readonly hocon?: string;
};

/** Stash a parsed import for the Editor to pick up on its next mount. */
export const stashImportedNetwork = (payload: ImportedNetwork): void => {
  try {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(payload));
  } catch {
    // Storage can be unavailable or full. The handover is a convenience, so the
    // navigation should still happen; the user can import again from the Editor.
  }
};

/** Take the stashed import, if any, clearing it so it is applied only once. */
export const takeImportedNetwork = (): ImportedNetwork | undefined => {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return undefined;
    sessionStorage.removeItem(HANDOFF_KEY);
    const parsed = JSON.parse(raw) as ImportedNetwork;
    return parsed?.definition ? parsed : undefined;
  } catch {
    // A malformed entry is not worth surfacing: drop it and carry on.
    try {
      sessionStorage.removeItem(HANDOFF_KEY);
    } catch {
      // Nothing further to try.
    }
    return undefined;
  }
};
