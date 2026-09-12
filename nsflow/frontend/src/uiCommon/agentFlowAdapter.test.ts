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

import { describe, expect, it, vi } from "vitest";

import type { EditorCanvasProps } from "../types/editorCanvas";
import { toAgentFlowProps } from "./agentFlowAdapter";

const setIsEditing = vi.fn();
const onSaveAgent = vi.fn(async () => {});

const base: EditorCanvasProps = {
  id: "editor-canvas",
  networkId: "coffee_shop",
  networkName: "coffee_shop_canonical",
  definition: [{ origin: "frontman", tools: ["barista"] }],
  apiUrl: "http://localhost:8005",
  isEditing: true,
  isStreaming: false,
  setIsEditing,
  onSaveAgent,
};

describe("toAgentFlowProps", () => {
  it("maps nsflow's stable names onto ui-common's current ones", () => {
    // These three are exactly the props ui-common renamed between 1.5.1 and 1.11.0,
    // which is the whole reason this adapter exists.
    const mapped = toAgentFlowProps(base);
    expect(mapped.agentsInNetwork).toEqual(base.definition);
    expect(mapped.isEditingNetwork).toBe(true);
    expect(mapped.setIsEditingNetwork).toBe(setIsEditing);
    expect(mapped.networkDisplayName).toBe("coffee_shop_canonical");
  });

  it("points ui-common's controller at nsflow, never at a neuro-san server", () => {
    // nsflow's backend mirrors neuro-san's HTTP contract, so ui-common's internal
    // controller can be aimed here. This is what keeps the browser from talking to
    // neuro-san directly.
    expect(toAgentFlowProps(base).neuroSanURL).toBe("http://localhost:8005");
  });
});
