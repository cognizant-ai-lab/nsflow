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

import { useState } from "react";
import { Box, Typography, alpha, useTheme } from "@mui/material";
import { ChevronRight, ExpandMore } from "@mui/icons-material";
import { TraceNode, TraceTree, formatCost, formatDuration } from "./traceTree";
import { KIND_STYLES } from "./traceKinds";
import { TREE_COL as COL } from "./traceConstants";

const ROW_GAP = 1; // mui spacing units used in row gap={1}

type Props = {
  tree: TraceTree;
  onSelect?: (node: TraceNode) => void;
  selectedKey?: string | null;
};

const TraceTreeView = ({ tree, onSelect, selectedKey }: Props) => {
  const theme = useTheme();

  if (tree.roots.length === 0) {
    return (
      <Box sx={{ p: 3, color: theme.palette.text.secondary }}>
        <Typography variant="body2">
          No trace steps yet. Send a message and per-agent timings will appear here.
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        p: 1,
        overflow: "auto",
        fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
        fontSize: 13,
      }}
    >
      <TraceTreeHeader />
      {tree.roots.map((root) => (
        <TraceNodeRow
          key={root.key}
          node={root}
          depth={0}
          rootDuration={Math.max(root.durationS, tree.totalDurationS, 0.001)}
          onSelect={onSelect}
          selectedKey={selectedKey}
        />
      ))}
    </Box>
  );
};

const TraceTreeHeader = () => {
  const theme = useTheme();
  const headStyle = {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    color: theme.palette.text.secondary,
    fontFamily: theme.typography.fontFamily,
    fontVariantNumeric: "tabular-nums" as const,
  };
  return (
    <Box
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 1,
        backgroundColor: theme.palette.background.paper,
        display: "flex",
        alignItems: "center",
        gap: ROW_GAP,
        pl: `${COL.chevron + 8}px`,
        pr: 1,
        py: 0.75,
        borderBottom: `1px solid ${theme.palette.divider}`,
        mb: 0.5,
      }}
    >
      <Typography component="span" sx={{ ...headStyle, flex: 1, minWidth: 0 }}>
        Agent
      </Typography>
      <Typography component="span" sx={{ ...headStyle, width: COL.bar, textAlign: "left" }}>
        % of root
      </Typography>
      <Typography component="span" sx={{ ...headStyle, width: COL.duration, textAlign: "right" }}>
        Duration
      </Typography>
      <Typography component="span" sx={{ ...headStyle, width: COL.pct, textAlign: "right" }}>
        %
      </Typography>
      <Typography component="span" sx={{ ...headStyle, width: COL.tokens, textAlign: "right" }}>
        Tokens
      </Typography>
      <Typography component="span" sx={{ ...headStyle, width: COL.cost, textAlign: "right" }}>
        Cost
      </Typography>
    </Box>
  );
};

type RowProps = {
  node: TraceNode;
  depth: number;
  rootDuration: number;
  onSelect?: (node: TraceNode) => void;
  selectedKey?: string | null;
};

const TraceNodeRow = ({ node, depth, rootDuration, onSelect, selectedKey }: RowProps) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedKey === node.key;
  const pct = rootDuration > 0 ? (node.durationS / rootDuration) * 100 : 0;

  return (
    <Box>
      <Box
        onClick={() => onSelect?.(node)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          pl: `${depth * 16}px`,
          pr: 1,
          py: 0.5,
          cursor: "pointer",
          borderRadius: 1,
          backgroundColor: isSelected
            ? alpha(theme.palette.primary.main, 0.12)
            : "transparent",
          "&:hover": {
            backgroundColor: alpha(theme.palette.primary.main, 0.06),
          },
        }}
      >
        <Box
          onClick={(e) => {
            if (hasChildren) {
              e.stopPropagation();
              setExpanded((v) => !v);
            }
          }}
          sx={{
            width: COL.chevron,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: theme.palette.text.secondary,
            visibility: hasChildren ? "visible" : "hidden",
          }}
        >
          {expanded ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 1 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              color: KIND_STYLES[node.kind].color,
            }}
            title={KIND_STYLES[node.kind].label}
          >
            {KIND_STYLES[node.kind].icon}
          </Box>
          <Typography
            component="span"
            sx={{
              fontWeight: 500,
              color: theme.palette.text.primary,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {node.label}
          </Typography>
          {hasChildren && (
            <Typography
              component="span"
              sx={{ color: theme.palette.text.secondary, fontSize: 11 }}
            >
              ({node.children.length})
            </Typography>
          )}
        </Box>

        <Box
          sx={{
            position: "relative",
            width: COL.bar,
            height: 8,
            borderRadius: 1,
            backgroundColor: alpha(theme.palette.text.secondary, 0.12),
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `${Math.min(pct, 100)}%`,
              backgroundColor: KIND_STYLES[node.kind].color,
            }}
          />
        </Box>

        <Typography
          sx={{
            width: COL.duration,
            textAlign: "right",
            color: theme.palette.text.primary,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatDuration(node.durationS)}
        </Typography>

        <Typography
          sx={{
            width: COL.pct,
            textAlign: "right",
            color: theme.palette.text.secondary,
            fontVariantNumeric: "tabular-nums",
            fontSize: 11,
          }}
        >
          {pct.toFixed(1)}%
        </Typography>

        <Typography
          sx={{
            width: COL.tokens,
            textAlign: "right",
            color: theme.palette.text.secondary,
            fontVariantNumeric: "tabular-nums",
            fontSize: 11,
          }}
        >
          {node.totalTokens ? node.totalTokens.toLocaleString() : "—"}
        </Typography>

        <Typography
          sx={{
            width: COL.cost,
            textAlign: "right",
            color: theme.palette.text.secondary,
            fontVariantNumeric: "tabular-nums",
            fontSize: 11,
          }}
        >
          {formatCost(node.totalCost)}
        </Typography>
      </Box>

      {expanded && hasChildren && (
        <Box>
          {node.children.map((child) => (
            <TraceNodeRow
              key={child.key}
              node={child}
              depth={depth + 1}
              rootDuration={rootDuration}
              onSelect={onSelect}
              selectedKey={selectedKey}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};

export default TraceTreeView;
