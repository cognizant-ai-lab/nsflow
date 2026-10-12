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
 * What does Save do with an agent's instructions or description cleared?
 *
 * Reported symptom: emptying either one and clicking Save said "Agent updated
 * successfully", but the old text stayed on the canvas and went out with the save.
 * The designer cannot store an empty value for either (its validator rejects it and
 * has the model write the field again), so the panel now refuses the save and says
 * which field needs a value. A toolbox tool, or a reference to another network, has
 * neither field, so it is never asked for them. These mount the real panel against
 * the real store and a stubbed server, and look at what reached each of them.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import NetworkAgentEditorPanel from "./NetworkAgentEditorPanel";
import { type EditorNetworkEntry, useEditorNetworkStore } from "../state/editorNetworkStore";
import type { AgentNetworkDefinitionEntry } from "../uiCommon";

const NETWORK = "coffee_shop";

/**
 * The network the panel edits: a frontman, the agent under test, and three names
 * that are not LLM agents. The toolbox tool's entry has no text fields at all, which
 * is what makes it a tool. The reference to another network has a bare entry, as the
 * connectivity list can carry one. The last name is only listed under the frontman's
 * tools and has no entry of its own.
 */
const DEFINITION: AgentNetworkDefinitionEntry[] = [
  {
    origin: "frontman",
    tools: ["helper", "web_search", "/other_network", "not_yet_defined"],
    instructions: "You are the front man.",
    description: "Front desk.",
  },
  { origin: "helper", tools: [], instructions: "You help.", description: "Helps." },
  { origin: "web_search", tools: [] },
  { origin: "/other_network", tools: [] },
];

/** The store entry each test starts from, with the definition as its only history. */
const SEEDED_ENTRY: EditorNetworkEntry = {
  networkName: NETWORK,
  definition: DEFINITION,
  slyData: {},
  history: [DEFINITION],
  cursor: 0,
};

/** The success message the panel shows after a save lands. */
const SUCCESS_TEXT = "Agent updated successfully";

/** What a refused save must leave as it was, as it stood just before the click. */
type Baseline = { entry: EditorNetworkEntry; requests: number; updates: number };

/** The baseline when nothing has been saved yet. */
const UNTOUCHED: Baseline = { entry: SEEDED_ENTRY, requests: 0, updates: 0 };

vi.mock("../context/ApiPortContext", () => ({
  useApiPort: () => ({ apiUrl: "http://localhost:4173", isReady: true }),
}));

// The editor's colours come from the app's theme provider, which is not under test.
vi.mock("../context/ThemeContext", () => ({
  useJsonEditorTheme: () => [],
}));

/**
 * The JSON tree is json-edit-react. Replacing it exposes its onUpdate directly, which
 * is how every edit reaches the panel, without driving the tree through clicks and
 * key presses to test something that has nothing to do with the widget.
 */
let jsonEditorOnUpdate: ((update: { newData: unknown }) => void) | undefined;

vi.mock("json-edit-react", () => ({
  JsonEditor: ({ onUpdate }: { onUpdate: (update: { newData: unknown }) => void }) => {
    jsonEditorOnUpdate = onUpdate;
    return <div data-testid="json-editor" />;
  },
}));

describe("saving an agent from the panel", () => {
  /** The calls made to the designer's streaming_chat route. */
  const streamingChatCalls = () =>
    vi.mocked(fetch).mock.calls.filter(([input]) => String(input).endsWith("/streaming_chat"));

  /** Open the panel on `agentName`. */
  const renderPanel = (agentName: string, onAgentUpdated = vi.fn()) => {
    render(
      <NetworkAgentEditorPanel
        networkId={NETWORK}
        selectedAgentName={agentName}
        onAgentUpdated={onAgentUpdated}
        openRequest={1}
      />
    );
    return onAgentUpdated;
  };

  /** Click the panel's Save button. */
  const clickSave = async () => {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
  };

  /** Set the open panel's JSON for "helper" to `fields`, and click Save. */
  const editAndClickSave = async (fields: Record<string, unknown>) => {
    await waitFor(() => expect(jsonEditorOnUpdate).toBeTypeOf("function"));
    // `name` is in the panel's JSON for an agent that can be renamed. Leaving it as
    // the current name keeps this an attribute edit rather than a rename.
    await act(async () => {
      jsonEditorOnUpdate!({ newData: { name: "helper", ...fields } });
    });
    await clickSave();
  };

  /** Open the panel on "helper", set its JSON to `fields`, and click Save. */
  const editAndSave = async (fields: Record<string, unknown>, onAgentUpdated = vi.fn()) => {
    renderPanel("helper", onAgentUpdated);
    await editAndClickSave(fields);
    return onAgentUpdated;
  };

  /** Everything a refused save must leave untouched, checked in one place. */
  const expectRefused = (onAgentUpdated: ReturnType<typeof vi.fn>, before: Baseline = UNTOUCHED) => {
    // Nothing sent, nothing applied: the whole entry is compared, history included,
    // because an early applyEdit adds a history step even when the merged definition
    // looks the same as before.
    expect(streamingChatCalls()).toHaveLength(before.requests);
    expect(useEditorNetworkStore.getState().entries[NETWORK]).toEqual(before.entry);
    expect(onAgentUpdated).toHaveBeenCalledTimes(before.updates);
    expect(screen.queryByText(SUCCESS_TEXT)).toBeNull();
    // The edit stays in the panel, so Save has to stay there, and usable, for the
    // user to fix it and try again.
    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
  };

  beforeEach(() => {
    jsonEditorOnUpdate = undefined;
    useEditorNetworkStore.setState({ entries: { [NETWORK]: SEEDED_ENTRY } });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith("/streaming_chat")) {
          // One frame is all sendEditorUpdate needs to count the save as delivered.
          // It carries no definition on purpose: an echoed one would be reconciled
          // into the store, and the panel clears its messages when the agent reloads.
          return new Response('{"response":{"type":"AGENT","text":"saved"}}\n', { status: 200 });
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      })
    );
  });

  it("refuses a cleared description, and says that it needs a value", async () => {
    const onAgentUpdated = await editAndSave({ instructions: "You help.", description: "" });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain('"description"');
    expect(alert.textContent).toContain("non-empty");
    expect(alert.textContent).not.toContain('"instructions"');
    expectRefused(onAgentUpdated);
  });

  it("refuses cleared instructions, and says that they need a value", async () => {
    const onAgentUpdated = await editAndSave({ instructions: "", description: "Helps." });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain('"instructions"');
    expect(alert.textContent).toContain("non-empty");
    expect(alert.textContent).not.toContain('"description"');
    expectRefused(onAgentUpdated);
  });

  it("refuses a value that is only whitespace, which the designer rejects the same way", async () => {
    // Spaces, a tab and a newline: the designer trims before it checks, so must this.
    const onAgentUpdated = await editAndSave({ instructions: " \t\n ", description: "Helps." });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain('"instructions"');
    expectRefused(onAgentUpdated);
  });

  it("names both fields when both are cleared", async () => {
    const onAgentUpdated = await editAndSave({ instructions: "", description: "" });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain('"instructions"');
    expect(alert.textContent).toContain('"description"');
    expectRefused(onAgentUpdated);
  });

  it("replaces an earlier success message rather than showing both", async () => {
    const onAgentUpdated = await editAndSave({ instructions: "You help a lot.", description: "Helps a lot." });
    // The success message clears itself after a few seconds. Seeing it here is what
    // makes the check below mean something.
    await waitFor(() => expect(screen.getByText(SUCCESS_TEXT)).toBeTruthy());
    const before: Baseline = {
      entry: structuredClone(useEditorNetworkStore.getState().entries[NETWORK]),
      requests: streamingChatCalls().length,
      updates: onAgentUpdated.mock.calls.length,
    };

    await editAndClickSave({ instructions: "You help a lot.", description: "" });

    // One message only: "updated successfully" next to "Not saved" would leave the
    // user guessing which one is true.
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].textContent).toContain('"description"');
    expectRefused(onAgentUpdated, before);
  });

  it.each([
    ["a toolbox tool", "web_search"],
    ["a reference to another network", "/other_network"],
    ["a name with no entry of its own", "not_yet_defined"],
  ])("does not ask %s for instructions or a description", async (_kind, name) => {
    const onAgentUpdated = renderPanel(name);
    // None has fields the panel can edit, so it offers to start from the schema,
    // which sets instructions and description to empty strings.
    const createFromSchema = await screen.findByRole("button", { name: "Create from Schema" });
    await act(async () => {
      fireEvent.click(createFromSchema);
    });
    await clickSave();

    // Asking for the fields would be wrong here, and following that advice would
    // turn the tool into an agent. What shows instead is the panel's usual answer to
    // an edit with nothing in it.
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("No valid data to update");
    expectRefused(onAgentUpdated);
  });

  it("still saves a normal edit to either field", async () => {
    const onAgentUpdated = await editAndSave({ instructions: "You help a lot.", description: "Helps a lot." });

    await waitFor(() => expect(screen.getByText(SUCCESS_TEXT)).toBeTruthy());
    // The success message is the only one showing: no error alongside it.
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].textContent).toBe(SUCCESS_TEXT);
    expect(onAgentUpdated).toHaveBeenCalledTimes(1);

    // The edit is applied to the store and is what goes out to the designer.
    const helper = useEditorNetworkStore
      .getState()
      .entries[NETWORK].definition.find((agent) => agent.origin === "helper");
    expect(helper).toEqual(
      expect.objectContaining({ instructions: "You help a lot.", description: "Helps a lot." })
    );
    expect(streamingChatCalls()).toHaveLength(1);
    const body = JSON.parse(String((streamingChatCalls()[0][1] as RequestInit).body));
    expect(body.sly_data.agent_network_definition.helper).toEqual({
      instructions: "You help a lot.",
      description: "Helps a lot.",
    });
  });
});
