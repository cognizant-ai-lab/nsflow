/*
Copyright © 2025 Cognizant Technology Solutions Corp, www.cognizant.com.

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

import { useEffect, useState } from "react";
import { Box, IconButton, Paper, Typography, useTheme, alpha } from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import { FaGithub } from "react-icons/fa";

const STUDIO_REPO_URL = "https://github.com/cognizant-ai-lab/neuro-san-studio";
const STUDIO_API_URL = "https://api.github.com/repos/cognizant-ai-lab/neuro-san-studio";

// 31234 -> "31k", 1234 -> "1.2k", 900 -> "900"
function formatStars(count: number): string {
  if (count < 1000) return String(count);
  const k = count / 1000;
  const text = k >= 10 ? String(Math.round(k)) : k.toFixed(1).replace(/\.0$/, "");
  return `${text}k`;
}

export default function StarStudioPopup() {
  const theme = useTheme();
  const [open, setOpen] = useState(true);
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(STUDIO_API_URL);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data.stargazers_count === "number") {
          setStars(data.stargazers_count);
        }
      } catch {
        // Rate-limited / offline / blocked: leave count hidden, keep the card.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!open) return null;

  return (
    <Paper
      elevation={6}
      sx={{
        position: "fixed",
        top: 64,
        right: 16,
        zIndex: theme.zIndex.appBar - 1,
        width: 300,
        maxWidth: "calc(100vw - 32px)",
        p: 2,
        borderRadius: 3,
        border: `1px solid ${theme.palette.divider}`,
        backgroundColor: theme.palette.background.paper,
        color: theme.palette.text.primary,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Star neuro-san-studio
        </Typography>
        <IconButton
          size="small"
          aria-label="Dismiss star prompt"
          onClick={() => setOpen(false)}
          sx={{ mt: -0.5, mr: -0.5, color: theme.palette.text.secondary }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Typography variant="body2" sx={{ mt: 1, color: theme.palette.text.secondary }}>
        See the latest releases and help grow the community on GitHub.
      </Typography>

      <Box
        component="a"
        href={STUDIO_REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        sx={{
          mt: 2,
          display: "inline-flex",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          py: 0.75,
          borderRadius: 2,
          border: `1px solid ${theme.palette.divider}`,
          backgroundColor: alpha(theme.palette.text.primary, 0.04),
          color: theme.palette.text.primary,
          textDecoration: "none",
          fontWeight: 600,
          fontSize: 14,
          "&:hover": { backgroundColor: alpha(theme.palette.text.primary, 0.1) },
        }}
      >
        <FaGithub size={18} />
        <span>neuro-san-studio</span>
        {stars !== null && (
          <Box
            component="span"
            sx={{
              ml: 0.5,
              px: 0.75,
              py: 0.25,
              borderRadius: 1,
              border: `1px solid ${theme.palette.divider}`,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {formatStars(stars)}
          </Box>
        )}
      </Box>
    </Paper>
  );
}
