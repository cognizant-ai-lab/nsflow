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
 * Hands the user over from the canvas to the chat box.
 *
 * The two live in separate panels with no component relationship, and the editor
 * has no business knowing how the chat panel is built. A named window event lets
 * the canvas say "the user wants to describe this instead" and lets the chat panel
 * decide what that means, without either importing the other.
 */

const FOCUS_CHAT_EVENT = "nsflow:focus-chat";

/** Ask the chat panel to take focus. Does nothing if no chat panel is mounted. */
export const requestChatFocus = (): void => {
  window.dispatchEvent(new CustomEvent(FOCUS_CHAT_EVENT));
};

/** Run `onFocusRequested` whenever the canvas hands over. Returns an unsubscribe. */
export const onChatFocusRequested = (onFocusRequested: () => void): (() => void) => {
  window.addEventListener(FOCUS_CHAT_EVENT, onFocusRequested);
  return () => window.removeEventListener(FOCUS_CHAT_EVENT, onFocusRequested);
};
