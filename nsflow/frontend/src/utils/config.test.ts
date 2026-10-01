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

import { describe, expect, it } from "vitest";

import { toDesignerNetworkName, toServedNetworkPath } from "./config";

describe("toDesignerNetworkName", () => {
  it("keeps only the file's stem, whatever folder the network is served from", () => {
    // What /api/v1/list returns for a designer-made network, and what the designer's
    // persistor expects back: it adds "generated/" itself when it writes.
    expect(toDesignerNetworkName("generated/coffee_shop")).toBe("coffee_shop");
    // The same rule for every other folder, so the name never depends on where the
    // file happened to live.
    expect(toDesignerNetworkName("basic/music_nerd")).toBe("music_nerd");
    expect(toDesignerNetworkName("generated/team/coffee_shop")).toBe("coffee_shop");
  });

  it("leaves a bare name, an empty one and a folder with no stem alone", () => {
    // The designer's own echoes are already bare.
    expect(toDesignerNetworkName("coffee_shop")).toBe("coffee_shop");
    expect(toDesignerNetworkName("")).toBe("");
    expect(toDesignerNetworkName("generated/")).toBe("generated/");
  });

  it("sends a stray generated/generated copy back to its original", () => {
    // The files #304 created. Saving one of them updates the original, and Launch and
    // the sidebar's reselection land on the original too, since the stem's served
    // path is the original's.
    expect(toDesignerNetworkName("generated/generated/coffee_shop")).toBe("coffee_shop");
    expect(toServedNetworkPath(toDesignerNetworkName("generated/generated/coffee_shop"))).toBe("generated/coffee_shop");
  });
});
