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
 * What the two ways of building an agent network are, and where to read more.
 *
 * The editor offers chat and direct manipulation side by side, and which one to reach
 * for is not obvious from the canvas alone. This says it once, in the place a user
 * looks when they are stuck, rather than spreading it across tooltips.
 */

import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Link,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ChatIcon from "@mui/icons-material/ChatBubbleOutlined";
import ExternalIcon from "@mui/icons-material/OpenInNew";
import ManualIcon from "@mui/icons-material/TouchApp";

/**
 * Where to read more.
 *
 * Repository roots rather than deep links to individual pages: a root outlives a
 * docs reshuffle, and a help dialog that 404s is worse than one that is one click
 * from the answer.
 */
const RESOURCES: Array<{ label: string; description: string; href: string }> = [
  {
    label: "neuro-san-studio",
    description: "Example agent networks, coded tools and the agent network designer.",
    href: "https://github.com/cognizant-ai-lab/neuro-san-studio",
  },
  {
    label: "neuro-san",
    description: "The framework itself: agent HOCON reference, sly_data, MCP and toolbox.",
    href: "https://github.com/cognizant-ai-lab/neuro-san",
  },
  {
    label: "nsflow",
    description: "This client: the editor, the chat panel and the FastAPI backend.",
    href: "https://github.com/cognizant-ai-lab/nsflow",
  },
];

const MODES: Array<{ icon: React.ReactElement; title: string; lines: string[] }> = [
  {
    icon: <ChatIcon fontSize="small" />,
    title: "Vibe editing, in the chat",
    lines: [
      "Describe what you want and the agent network designer builds or changes it for you.",
      "Best for starting from nothing, and for broad changes such as rewording every agent's instructions at once.",
      "Takes a little time, because a language model is doing the work.",
    ],
  },
  {
    icon: <ManualIcon fontSize="small" />,
    title: "Manual editing, on the canvas",
    lines: [
      "Add agents from the palette, wire them by dragging edges, and edit instructions in the agent panel.",
      "Best for precise changes you already know you want.",
      "Applies immediately: each change is saved as you make it, without a language model.",
    ],
  },
];

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
}

const HelpDialog = ({ open, onClose }: HelpDialogProps) => {
  const theme = useTheme();

  return (
    // MUI closes on backdrop click and Escape by default, which is what onClose gets.
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}>
        Help
        <IconButton size="small" onClick={onClose} aria-label="Close help">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          There are two ways to build an agent network, and they work on the same
          network. You can switch between them at any point.
        </Typography>

        <Stack spacing={2}>
          {MODES.map((mode) => (
            <Box key={mode.title}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
                <Box sx={{ color: theme.palette.primary.main, display: "flex" }}>{mode.icon}</Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {mode.title}
                </Typography>
              </Stack>
              {mode.lines.map((line) => (
                <Typography
                  key={line}
                  variant="body2"
                  color="text.secondary"
                  sx={{ display: "block", pl: 3.5, mb: 0.25 }}
                >
                  {line}
                </Typography>
              ))}
            </Box>
          ))}
        </Stack>

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          Documentation
        </Typography>
        <Stack spacing={1}>
          {RESOURCES.map((resource) => (
            <Box key={resource.href}>
              <Link
                href={resource.href}
                target="_blank"
                rel="noopener noreferrer"
                variant="body2"
                sx={{ fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 0.5 }}
              >
                {resource.label}
                <ExternalIcon sx={{ fontSize: 14 }} />
              </Link>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                {resource.description}
              </Typography>
            </Box>
          ))}
        </Stack>
      </DialogContent>
    </Dialog>
  );
};

export default HelpDialog;
