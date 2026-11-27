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

import type { ConsultantJobOrigin } from "../types/networkConsultant";
import { ConsultantApiError } from "./networkConsultantApi";

interface ActiveConsultantJob {
  job_id: string;
  origin: ConsultantJobOrigin;
}

export const getActiveConsultantJob = async (
  apiUrl: string,
  networkName: string,
): Promise<ActiveConsultantJob | null> => {
  const query = new URLSearchParams({ network_name: networkName });
  const response = await fetch(`${apiUrl}/api/v1/network_consultant/jobs/active?${query}`);
  if (!response.ok) throw new ConsultantApiError([`Active job check failed (${response.status})`]);
  return response.json();
};
