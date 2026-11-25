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

import { FormControl, InputLabel, MenuItem, Select } from "@mui/material";

import type { ConsultantJobOrigin } from "../../types/networkConsultant";
import type { ConsultantJobRecord } from "../../utils/consultantJobHistoryApi";

const ORIGIN_LABELS: Record<ConsultantJobOrigin, string> = {
  tests: "Run tests",
  generate: "Generate tests",
  improve: "Improve",
};

const runLabel = (run: ConsultantJobRecord): string => {
  const timestamp = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(run.started_at));
  return `${ORIGIN_LABELS[run.origin]} — ${timestamp}`;
};

interface ConsultantRunSelectorProps {
  runs: ConsultantJobRecord[];
  selectedJobId: string | null;
  disabled: boolean;
  onSelect: (jobId: string) => void;
}

const ConsultantRunSelector = ({ runs, selectedJobId, disabled, onSelect }: ConsultantRunSelectorProps) => {
  if (runs.length === 0) return null;

  return (
    <FormControl fullWidth size="small" sx={{ mb: 2 }}>
      <InputLabel id="consultant-run-label">Previous run</InputLabel>
      <Select
        labelId="consultant-run-label"
        label="Previous run"
        value={selectedJobId && runs.some((run) => run.job_id === selectedJobId) ? selectedJobId : ""}
        disabled={disabled}
        onChange={(event) => onSelect(event.target.value)}
      >
        {runs.map((run) => (
          <MenuItem key={run.job_id} value={run.job_id}>
            {runLabel(run)}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};

export default ConsultantRunSelector;
