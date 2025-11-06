
/*
Copyright 2025 Cognizant Technology Solutions Corp, www.cognizant.com.

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
import { 
  Box, 
  Typography, 
  TextField, 
  Button, 
  Paper, 
  List, 
  ListItem, 
  ListItemButton, 
  ListItemIcon, 
  ListItemText, 
  IconButton, 
  InputAdornment, 
  Alert, 
  useTheme,
  alpha
} from "@mui/material";
import { 
  Add as AddIcon,
  Remove as RemoveIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  FiberManualRecord as DotIcon
} from "@mui/icons-material";
import { useApiPort } from "../context/ApiPortContext";
import { convertToTree, toggleNode, setExpandCollapseAll, filterTree, TreeNode } from "../utils/hoconViewer";

const ConfigPanel = ({ selectedNetwork }: { selectedNetwork: string }) => {
  const { apiUrl } = useApiPort();
  const [configTree, setConfigTree] = useState<TreeNode[]>([]);
  const [filteredTree, setFilteredTree] = useState<TreeNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const theme = useTheme();

  useEffect(() => {
    if (!selectedNetwork) return;
    console.log(`Generating config map for the network: ${selectedNetwork}`);

    fetch(`${apiUrl}/api/v1/networkconfig/${selectedNetwork}`)
      .then((res) => res.json())
      .then((data) => {
        const tree = convertToTree(data);
        setConfigTree(tree);
        setFilteredTree(tree);
      })
      .catch((err) => setError(err.message));
  }, [selectedNetwork]);

  // Expand/Collapse a specific node
  const handleToggle = (uniqueKey: string) => {
    setFilteredTree((prevTree) => toggleNode(prevTree, uniqueKey));
  };

  // Expand/Collapse **all** nodes
  const handleExpandCollapseAll = () => {
    const newExpandState = !isExpanded; // Toggle state
    setFilteredTree((prevTree) => setExpandCollapseAll(prevTree, newExpandState));
    setIsExpanded(newExpandState);
  };

  // Handle search input and filter results
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value.toLowerCase();
    setSearchTerm(query);

    if (query.trim() === "") {
      setFilteredTree(configTree);
    } else {
      setFilteredTree(filterTree(configTree, query));
    }
  };

  // Clear search and restore full tree
  const clearSearch = () => {
    setSearchTerm("");
    setFilteredTree(configTree);
  };

  return (
    <Paper
      elevation={0}
      sx={{
        height: '100%',
        backgroundColor: theme.palette.background.paper,
        display: 'flex',
        flexDirection: 'column',
        p: 2
      }}
    >
      {/* Header */}
      <Typography variant="h6" sx={{ 
        fontWeight: 600, 
        color: theme.palette.text.primary,
        mb: 2,
        borderBottom: `1px solid ${theme.palette.divider}`,
        pb: 1
      }}>
        Config: {selectedNetwork}
      </Typography>

      {/* Search Box */}
      <TextField
        size="small"
        placeholder="Search config..."
        value={searchTerm}
        onChange={handleSearch}
        sx={{ mb: 2 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ color: theme.palette.text.secondary, fontSize: 20 }} />
            </InputAdornment>
          ),
          endAdornment: searchTerm && (
            <InputAdornment position="end">
              <IconButton
                size="small"
                onClick={clearSearch}
                sx={{ color: theme.palette.text.secondary }}
              >
                <ClearIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ),
          sx: {
            backgroundColor: alpha(theme.palette.background.default, 0.5),
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: theme.palette.divider
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: theme.palette.primary.main
            }
          }
        }}
      />

      {/* Expand/Collapse ALL Toggle */}
      <Box sx={{ mb: 2 }}>
        <Button
          variant="outlined"
          size="small"
          onClick={handleExpandCollapseAll}
          startIcon={isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          sx={{
            borderColor: theme.palette.divider,
            color: theme.palette.text.primary,
            '&:hover': {
              borderColor: theme.palette.primary.main,
              backgroundColor: alpha(theme.palette.primary.main, 0.1)
            }
          }}
        >
          {isExpanded ? "Collapse All" : "Expand All"}
        </Button>
      </Box>

      {/* Scrollable Tree View Container */}
      <Box sx={{ 
        flexGrow: 1, 
        overflow: 'auto',
        backgroundColor: alpha(theme.palette.background.default, 0.3),
        borderRadius: 1,
        p: 1
      }}>
        {error ? (
          <Alert severity="error" sx={{ mb: 1 }}>
            {error}
          </Alert>
        ) : filteredTree.length > 0 ? (
          <TreeView tree={filteredTree} onToggle={handleToggle} />
        ) : (
          <Typography variant="body2" sx={{ 
            color: theme.palette.text.secondary,
            fontStyle: 'italic',
            textAlign: 'center',
            py: 2
          }}>
            No matches found
          </Typography>
        )}
      </Box>
    </Paper>
  );
};

// Component to render the tree structure
const TreeView = ({ tree, onToggle }: { tree: TreeNode[]; onToggle: (key: string) => void }) => {
  const theme = useTheme();
  
  return (
    <List dense sx={{ pl: 2 }}>
      {tree.map((node) => (
        <Box key={node.uniqueKey} sx={{ display: 'flex', flexDirection: 'column' }}>
          {/* Expand/Collapse Button or Leaf Node */}
          {node.children ? (
            <ListItemButton
              onClick={() => onToggle(node.uniqueKey)}
              sx={{
                py: 0.25,
                px: 1,
                borderRadius: 1,
                '&:hover': {
                  backgroundColor: alpha(theme.palette.primary.main, 0.1)
                }
              }}
            >
              <ListItemIcon sx={{ minWidth: 24 }}>
                {node.expanded ? 
                  <RemoveIcon sx={{ fontSize: 16, color: theme.palette.primary.main }} /> : 
                  <AddIcon sx={{ fontSize: 16, color: theme.palette.primary.main }} />
                }
              </ListItemIcon>
              <ListItemText 
                primary={node.key}
                primaryTypographyProps={{
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  color: theme.palette.text.primary,
                  fontWeight: 500
                }}
              />
            </ListItemButton>
          ) : (
            <ListItem sx={{ py: 0.25, px: 1, pl: 5 }}>
              <ListItemIcon sx={{ minWidth: 16 }}>
                <DotIcon sx={{ fontSize: 8, color: theme.palette.text.secondary }} />
              </ListItemIcon>
              <ListItemText 
                primary={node.key}
                primaryTypographyProps={{
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  color: theme.palette.text.primary
                }}
              />
            </ListItem>
          )}

          {/* Render Value or Children */}
          {node.children && node.expanded ? (
            <TreeView tree={node.children} onToggle={onToggle} />
          ) : (
            node.value !== undefined && (
              <Typography
                variant="body2"
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  color: theme.palette.text.secondary,
                  backgroundColor: alpha(theme.palette.background.default, 0.5),
                  p: 0.5,
                  ml: 6,
                  mr: 1,
                  borderRadius: 0.5,
                  border: `1px solid ${theme.palette.divider}`,
                  wordBreak: 'break-word'
                }}
              >
                {JSON.stringify(node.value)}
              </Typography>
            )
          )}
        </Box>
      ))}
    </List>
  );
};

export default ConfigPanel;
