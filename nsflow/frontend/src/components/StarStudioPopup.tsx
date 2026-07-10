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
import { Box, IconButton, Tooltip, useTheme, alpha } from "@mui/material";
import { Close as CloseIcon, Star as StarIcon } from "@mui/icons-material";
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

/**
 * Compact, floating "star neuro-san-studio" chip anchored at the top-right, near the
 * light/dark toggle. Floating (position: fixed) so it never affects the Header layout and
 * is trivial to anchor. Dismissable via the x; dismissal is local state only, so it
 * reappears on the next page load.
 */
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
        // Rate-limited / offline / blocked: leave count hidden, keep the chip.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!open) return null;

  return (
    <Tooltip title="Checkout the latest release and help grow the community on GitHub" arrow>
      <Box
        component="a"
        href={STUDIO_REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        sx={{
          position: "fixed",
          top: 10,
          right: 210,
          zIndex: theme.zIndex.appBar + 1,
          height: 36,
          display: "inline-flex",
          alignItems: "center",
          gap: 0.75,
          pl: 1,
          pr: 0.25,
          borderRadius: 1,
          border: `1px solid ${theme.palette.divider}`,
          backgroundColor: theme.palette.background.paper,
          boxShadow: `0 2px 8px ${alpha(theme.palette.common.black, 0.2)}`,
          whiteSpace: "nowrap",
          textDecoration: "none",
          fontWeight: 600,
          fontSize: 13,
          cursor: "pointer",
          "&:hover": { backgroundColor: alpha(theme.palette.text.primary, 0.06) },
        }}
      >
        <StarIcon sx={{ fontSize: 16, color: "#f5b301" }} />
        <span style={{ color: theme.palette.text.primary }}>Star neuro-san-studio</span>
        <FaGithub size={15} color={theme.palette.text.primary} />
        {stars !== null && (
          <Box
            component="span"
            sx={{
              px: 0.6,
              py: 0.1,
              borderRadius: 0.75,
              border: `1px solid ${theme.palette.divider}`,
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 1.6,
              color: theme.palette.text.primary,
            }}
          >
            {formatStars(stars)}
          </Box>
        )}
        <IconButton
          size="small"
          aria-label="Dismiss star prompt"
          onClick={(e) => {
            // Don't navigate to the repo when dismissing.
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }}
          sx={{ color: theme.palette.text.secondary, p: 0.25 }}
        >
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>
    </Tooltip>
  );
}
