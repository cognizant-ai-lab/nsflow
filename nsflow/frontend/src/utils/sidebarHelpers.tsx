
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

import * as React from "react";
import { alpha } from "@mui/material/styles";
import { Box, Paper, Tooltip, Typography } from "@mui/material";
import { Folder, FolderOpen, AccountTreeTwoTone } from "@mui/icons-material";
import { TreeItem, treeItemClasses } from "@mui/x-tree-view";

export type TreeNode = Record<
  string,
  {
    __children: TreeNode;
    __isAgent?: boolean;
  }
>;

/** Build nested tree from flat agent paths like "dir1/agent3" */
export const buildTree = (agents: string[]): TreeNode => {
  const root: TreeNode = {};
  for (const name of agents) {
    const parts = name.split("/");
    let current = root;
    parts.forEach((part, idx) => {
      if (!current[part]) current[part] = { __children: {} };
      if (idx === parts.length - 1) current[part].__isAgent = true;
      current = current[part].__children;
    });
  }
  return root;
};

/** Sort so that directories first (A→Z), then agents (A→Z) */
export const sortNodeEntries = (node: TreeNode) => {
  const dirs: [string, any][] = [];
  const agents: [string, any][] = [];

  for (const [key, val] of Object.entries(node)) {
    const children = (val as any).__children || {};
    const hasChildren = Object.keys(children).length > 0;
    const isAgent = (val as any).__isAgent && !hasChildren;

    if (hasChildren) dirs.push([key, val]);
    else if (isAgent) agents.push([key, val]);
    else agents.push([key, val]); // fallback
  }

  const cmp = (a: [string, any], b: [string, any]) =>
    a[0].localeCompare(b[0], undefined, { sensitivity: "base", numeric: true });

  dirs.sort(cmp);
  agents.sort(cmp);

  return [...dirs, ...agents];
};

/** Ancestor directories for auto-expand on search */
export const getAncestorDirs = (fullPath: string) => {
  // "dir1/sub/agentA" -> ["dir1", "dir1/sub"]
  const parts = fullPath.split("/");
  const dirs: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    const candidate = parts.slice(0, i).join("/");
    dirs.push(candidate);
  }
  return dirs;
};

/** Recursive renderer that preserves your compact visuals + inline icon */
export const renderTree = (
  node: TreeNode,
  path: string[] = [],
  activeNetwork: string,
  theme: any,
  onSelect: (n: string) => void
): React.ReactNode[] => {
  return sortNodeEntries(node).map(([key, value]) => {
    const fullPath = [...path, key].join("/");
    const children = (value as any).__children || {};
    const isAgent = (value as any).__isAgent;
    const hasChildren = Object.keys(children).length > 0;

    // Agent leaf (inline icon + original Paper styling)
    if (isAgent && !hasChildren) {
      const isActive = activeNetwork === fullPath;
      return (
        <TreeItem
          key={fullPath}
          itemId={fullPath}
          onClick={() => onSelect(fullPath)}
          sx={{
            // remove default icon gutter so agents align with folders
            [`& .${treeItemClasses.iconContainer}`]: { width: 0, display: "none" },
            [`& .${treeItemClasses.content}`]: { minHeight: "unset", py: 0 },
          }}
          label={
            <Paper
              elevation={isActive ? 2 : 0}
              sx={{
                mb: 0.5,
                borderRadius: 1,
                border: `1px solid ${theme.palette.divider}`,
                backgroundColor: isActive
                  ? alpha(theme.palette.primary.main, 0.1)
                  : "transparent",
                "&:hover": {
                  backgroundColor: alpha(theme.palette.primary.main, 0.05),
                  cursor: "pointer",
                },
              }}
            >
              <Box
                sx={{
                  px: 1,
                  py: 0.5,
                  display: "flex",
                  alignItems: "center",
                  gap: 0.4,
                  borderLeft: isActive ? `3px solid ${theme.palette.primary.main}` : "none",
                  overflow: "hidden",
                }}
              >
                <AccountTreeTwoTone
                  sx={{
                    fontSize: 12,
                    color: isActive
                      ? theme.palette.primary.main
                      : theme.palette.text.secondary,
                    flexShrink: 0,
                  }}
                />
                <Tooltip title={fullPath} placement="right">
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: "0.7rem",
                      color: isActive
                        ? theme.palette.primary.main
                        : theme.palette.text.primary,
                      fontWeight: isActive ? 600 : 400,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      display: "block",
                      flexGrow: 1,
                    }}
                  >
                    {key}
                  </Typography>
                </Tooltip>
              </Box>
            </Paper>
          }
        />
      );
    }

    // Directory node (indent only its children, not root level)
    // If this folder has no children (after filtering), hide it.
    if (!hasChildren) {
      return []; // <- crucial: do NOT render empty folder during search
    }
    // Directory with children
    return (
      <TreeItem
        key={fullPath}
        itemId={fullPath}
        label={
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.4, py: 0.2 }}>
            <Typography
              variant="caption"
              sx={{
                fontSize: "0.7rem",
                color: theme.palette.text.secondary,
                fontWeight: 600,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={key}
            >
              {key}
            </Typography>
          </Box>
        }
        slots={{ collapseIcon: FolderOpen, expandIcon: Folder }}
        sx={{
          [`& .${treeItemClasses.content}`]: {
            minHeight: "unset",
            py: 0.1,
            "&:hover": {
              backgroundColor: alpha(theme.palette.primary.main, 0.03),
              borderRadius: 1,
            },
          },
          // IMPORTANT: indent ONLY this folder's children (tiny px values)
          [`& > .${treeItemClasses.groupTransition}`]: {
            marginLeft: "2px",
            paddingLeft: "4px",
            borderLeft: `1px dashed ${alpha(theme.palette.divider, 0.5)}`,
          },
        }}
      >
        {renderTree(children, [...path, key], activeNetwork, theme, onSelect)}
      </TreeItem>
    );
  });
};
