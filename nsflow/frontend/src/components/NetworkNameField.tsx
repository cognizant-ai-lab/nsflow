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
 * Names a network that is still a draft.
 *
 * Shown in place of the canvas's "Editing: <name>" label while a network built by
 * hand has no name yet. Naming it is what makes it persist, so this is the step
 * between drawing a network and being able to launch it.
 */

import { useCallback, useState } from "react";
import { IconButton, InputAdornment, TextField, Tooltip } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";

import { sanitizeNetworkName } from "../state/paletteSources";

interface NetworkNameFieldProps {
  /** The current name, when renaming rather than naming for the first time. */
  initialName?: string;
  onSubmit: (name: string) => void;
  /** Provided only when there is a name to fall back to, so cancelling is possible. */
  onCancel?: () => void;
}

const NetworkNameField = ({ initialName = "", onSubmit, onCancel }: NetworkNameFieldProps) => {
  const [value, setValue] = useState(initialName);

  // What will actually be saved. Spaces and capitals are corrected rather than
  // rejected, so the only real failure is typing nothing usable at all.
  const sanitized = sanitizeNetworkName(value);
  const canSubmit = sanitized.length > 0;
  const wasChanged = canSubmit && sanitized !== value.trim();

  const submit = useCallback(() => {
    if (canSubmit) onSubmit(sanitized);
  }, [canSubmit, onSubmit, sanitized]);

  return (
    <TextField
      size="small"
      autoFocus
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          submit();
        }
        if (event.key === "Escape" && onCancel) {
          event.preventDefault();
          onCancel();
        }
      }}
      placeholder="Name this network"
      error={value.trim().length > 0 && !canSubmit}
      helperText={
        value.trim().length > 0 && !canSubmit
          ? "Use letters or digits somewhere in the name"
          : wasChanged
            ? `Will be saved as "${sanitized}"`
            : initialName
              ? "Saves a copy under the new name"
              : "Naming it saves it"
      }
      slotProps={{
        input: {
          endAdornment: (
            <InputAdornment position="end">
              {onCancel && (
                <Tooltip title="Cancel">
                  <IconButton size="small" onClick={onCancel} aria-label="Cancel rename">
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title={canSubmit ? "Save under this name" : "Enter a name"}>
                <span style={{ display: "inline-flex" }}>
                  <IconButton size="small" onClick={submit} disabled={!canSubmit} aria-label="Save network name">
                    <CheckIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </InputAdornment>
          ),
        },
      }}
      sx={{ minWidth: 200 }}
    />
  );
};

export default NetworkNameField;
