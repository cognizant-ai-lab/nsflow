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
 * nsflow's settings: the user's own LLM keys, and Zen Mode.
 *
 * ui-common ships a `SettingsDialog` of its own, and this is deliberately not it. That
 * one also owns appearance, branding, network display and animation, which nsflow
 * either does differently (its own theming, its own Zen Mode) or does not do at all.
 * Rendering it whole would present settings that either do nothing here or fight with
 * nsflow's equivalents.
 *
 * What is reused is everything below the surface: ui-common's settings store, the
 * provider-to-sly_data-field mapping, its TTL-aware key accessor, and its key
 * validators. So this file is composition, not a reimplementation.
 */

import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Link,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import CheckIcon from "@mui/icons-material/CheckCircleOutlined";
import CloseIcon from "@mui/icons-material/Close";
import KeyIcon from "@mui/icons-material/VpnKeyOutlined";
import VisibilityIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOffOutlined";
import ZenIcon from "@mui/icons-material/SelfImprovementOutlined";

import { ZEN_FEATURE_TOGGLES } from "../config/zenModeConfig";
import { useZenMode } from "../hooks/useZenMode";
import {
  LLM_PROVIDER_API_KEY_FIELD,
  getApiKey,
  isAnthropicKeyValid,
  isKeyValidationFailure,
  isOpenAIKeyValid,
  useSettingsStore,
  API_KEYS_TTL_MS,
  type KeyValidationResult,
  type LLMProvider,
} from "../uiCommon";

/**
 * How to check a key, per provider.
 *
 * Keyed off the same provider names as `LLM_PROVIDER_API_KEY_FIELD`, so adding a
 * provider to ui-common surfaces here as a missing entry rather than as a silently
 * untested key field.
 */
const VALIDATORS: Partial<Record<LLMProvider, (key: string) => Promise<KeyValidationResult>>> = {
  OpenAI: isOpenAIKeyValid,
  Anthropic: isAnthropicKeyValid,
};

/** Where a user goes to get a key, since "paste your key" is unhelpful without it. */
const CONSOLES: Partial<Record<LLMProvider, string>> = {
  OpenAI: "https://platform.openai.com/api-keys",
  Anthropic: "https://console.anthropic.com/settings/keys",
};

type KeyState = { value: string; revealed: boolean; testing: boolean; error?: string; tested?: boolean };

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

const SettingsDialog = ({ open, onClose }: SettingsDialogProps) => {
  const theme = useTheme();
  const { settings, updateSettings } = useSettingsStore();
  const { isZenMode, toggleZenMode, config, updateConfig } = useZenMode();

  const providers = Object.keys(LLM_PROVIDER_API_KEY_FIELD) as LLMProvider[];
  const [drafts, setDrafts] = useState<Partial<Record<LLMProvider, KeyState>>>({});

  const draftFor = (provider: LLMProvider): KeyState =>
    drafts[provider] ?? { value: "", revealed: false, testing: false };

  const setDraft = (provider: LLMProvider, patch: Partial<KeyState>) =>
    setDrafts((current) => ({ ...current, [provider]: { ...draftFor(provider), ...patch } }));

  /**
   * Test the key, then store it only if it works.
   *
   * Saving a bad key is worse than not saving: the failure would surface much later,
   * mid-agent-run, as an error the user cannot connect back to this panel.
   */
  const saveKey = async (provider: LLMProvider) => {
    const draft = draftFor(provider);
    const key = draft.value.trim();
    if (!key) return;

    setDraft(provider, { testing: true, error: undefined, tested: false });
    try {
      const validator = VALIDATORS[provider];
      if (validator) {
        const result = await validator(key);
        if (isKeyValidationFailure(result)) {
          setDraft(provider, { testing: false, error: "That key was rejected by the provider." });
          return;
        }
      }
      // A real expiry, not 0: ui-common's getApiKey treats a past expiresAt as
      // expired, so saving with 0 (the epoch) stores a key that is never sent.
      updateSettings({ apiKeys: { [provider]: { value: key, expiresAt: Date.now() + API_KEYS_TTL_MS } } });
      setDraft(provider, { value: "", testing: false, tested: true, revealed: false });
    } catch {
      // A network failure is not a bad key, and saying so would send the user off to
      // regenerate a key that is fine.
      setDraft(provider, { testing: false, error: "Could not reach the provider to check that key." });
    }
  };

  const forgetKey = (provider: LLMProvider) => {
    updateSettings({ apiKeys: { [provider]: { value: "", expiresAt: 0 } } });
    setDraft(provider, { value: "", tested: false, error: undefined });
  };

  // Grouped the way the Zen overlay's own gear groups them, from the same list.
  const zenCategories = ZEN_FEATURE_TOGGLES.reduce<Record<string, typeof ZEN_FEATURE_TOGGLES>>(
    (accumulated, toggle) => {
      accumulated[toggle.category] = [...(accumulated[toggle.category] ?? []), toggle];
      return accumulated;
    },
    {}
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}>
        Settings
        <IconButton size="small" onClick={onClose} aria-label="Close settings">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
          <KeyIcon fontSize="small" sx={{ color: theme.palette.primary.main }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Your LLM keys
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
          Kept in this browser only, never stored on the server, and sent with each request so
          agents run on your account. A key is checked with the provider before it is saved.
        </Typography>

        <Stack spacing={1.5} sx={{ mb: 1 }}>
          {providers.map((provider) => {
            const draft = draftFor(provider);
            const saved = getApiKey(settings.apiKeys, provider);
            const console_ = CONSOLES[provider];

            return (
              <Box key={provider}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                  <TextField
                    size="small"
                    fullWidth
                    label={provider}
                    type={draft.revealed ? "text" : "password"}
                    value={draft.value}
                    error={Boolean(draft.error)}
                    helperText={
                      draft.error ??
                      (saved
                        ? "A key is saved. Enter a new one to replace it."
                        : console_
                          ? undefined
                          : "")
                    }
                    placeholder={saved ? "•".repeat(16) : "Paste your key"}
                    onChange={(event) => setDraft(provider, { value: event.target.value, error: undefined })}
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            {draft.tested && !draft.value && (
                              <CheckIcon fontSize="small" sx={{ color: theme.palette.success.main, mr: 0.5 }} />
                            )}
                            <Tooltip title={draft.revealed ? "Hide" : "Show"}>
                              <IconButton
                                size="small"
                                onClick={() => setDraft(provider, { revealed: !draft.revealed })}
                                aria-label={draft.revealed ? `Hide the ${provider} key` : `Show the ${provider} key`}
                              >
                                {draft.revealed ? (
                                  <VisibilityOffIcon fontSize="small" />
                                ) : (
                                  <VisibilityIcon fontSize="small" />
                                )}
                              </IconButton>
                            </Tooltip>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                  <Button
                    variant="contained"
                    size="small"
                    disabled={!draft.value.trim() || draft.testing}
                    onClick={() => void saveKey(provider)}
                    sx={{ textTransform: "none", mt: 0.25, minWidth: 84 }}
                  >
                    {draft.testing ? "Checking" : "Save"}
                  </Button>
                  <Button
                    size="small"
                    color="inherit"
                    disabled={!saved}
                    onClick={() => forgetKey(provider)}
                    sx={{ textTransform: "none", mt: 0.25, minWidth: 72 }}
                  >
                    Forget
                  </Button>
                </Stack>
                {console_ && !draft.error && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                    <Link href={console_} target="_blank" rel="noopener noreferrer" variant="caption">
                      Get a {provider} key
                    </Link>
                  </Typography>
                )}
              </Box>
            );
          })}
        </Stack>

        <Alert severity="info" variant="outlined" sx={{ py: 0, mb: 2, backgroundColor: alpha(theme.palette.info.main, 0.04) }}>
          <Typography variant="caption">
            Keys are only used when the deployment asks for them. A server configured with its own
            keys ignores these.
          </Typography>
        </Alert>

        <Divider sx={{ my: 2 }} />

        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
          <ZenIcon fontSize="small" sx={{ color: theme.palette.primary.main }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Zen Mode
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          A full-screen view of the agent network and the chat, with everything else hidden.
        </Typography>

        <FormControlLabel
          control={<Switch checked={isZenMode} onChange={toggleZenMode} size="small" />}
          label={<Typography variant="body2">Zen Mode {isZenMode ? "on" : "off"}</Typography>}
          sx={{ mb: 1 }}
        />

        {/* The same toggles the Zen overlay's own gear offers, from the same list. */}
        {Object.entries(zenCategories).map(([category, toggles]) => (
          <Box key={category} sx={{ mb: 1 }}>
            <Typography
              variant="caption"
              sx={{ display: "block", fontWeight: 600, color: theme.palette.text.secondary, mb: 0.25 }}
            >
              {category}
            </Typography>
            {toggles.map((toggle) => (
              <FormControlLabel
                key={toggle.key}
                sx={{ display: "flex", ml: 0.5 }}
                control={
                  <Switch
                    size="small"
                    checked={Boolean(config.features[toggle.key])}
                    onChange={(event) =>
                      updateConfig({
                        features: { ...config.features, [toggle.key]: event.target.checked },
                      })
                    }
                  />
                }
                label={<Typography variant="body2">{toggle.label}</Typography>}
              />
            ))}
          </Box>
        ))}
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;
