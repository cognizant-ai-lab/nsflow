/*
Copyright © 2025-2026 Cognizant Technology Solutions Corp, www.cognizant.com.

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

import { useCallback, useEffect, useRef, useState } from "react";

import { describeError, listConsultantFixtures } from "../utils/networkConsultantApi";

export const useConsultantFixtures = (apiUrl: string, networkName: string) => {
  const [fixtureNames, setFixtureNames] = useState<string[]>([]);
  const [fixtureError, setFixtureError] = useState<string | null>(null);
  const requestGenerationRef = useRef(0);

  const refresh = useCallback(
    async (requestedNetwork = networkName) => {
      if (!requestedNetwork) {
        setFixtureNames([]);
        return;
      }
      const generation = ++requestGenerationRef.current;
      try {
        const fixtures = await listConsultantFixtures(
          apiUrl,
          requestedNetwork,
          "Could not list tests ({status})",
        );
        if (generation !== requestGenerationRef.current || requestedNetwork !== networkName) return;
        setFixtureNames(fixtures.map((fixture) => fixture.name));
        setFixtureError(null);
      } catch (error: unknown) {
        if (generation === requestGenerationRef.current && requestedNetwork === networkName) {
          setFixtureError(describeError(error));
        }
      }
    },
    [apiUrl, networkName],
  );

  useEffect(() => {
    requestGenerationRef.current += 1;
    setFixtureNames([]);
    setFixtureError(null);
    void refresh(networkName);
    return () => {
      requestGenerationRef.current += 1;
    };
  }, [networkName, refresh]);

  return { fixtureNames, fixtureError, refresh };
};
