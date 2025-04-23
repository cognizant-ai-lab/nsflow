
// Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
// All Rights Reserved.
// Issued under the Academic Public License.
//
// You can be released from the terms, and requirements of the Academic Public
// License by purchasing a commercial license.
// Purchase of a commercial license is mandatory for any use of the
// nsflow SDK Software in commercial settings.
//
// END COPYRIGHT
import { useEffect, useState } from "react";
import { FaPlusSquare, FaMinusSquare, FaSearch, FaTimes } from "react-icons/fa";
import { useApiPort } from "../context/ApiPortContext";
import { convertToTree, toggleNode, setExpandCollapseAll, filterTree, TreeNode } from "../utils/hoconViewer";

const ConfigPanel = ({ selectedNetwork }: { selectedNetwork: string }) => {
  const { apiPort } = useApiPort();
  const [configTree, setConfigTree] = useState<TreeNode[]>([]);
  const [filteredTree, setFilteredTree] = useState<TreeNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!selectedNetwork) return;
    console.log(`Generating config map for the network: ${selectedNetwork}`);

    fetch(`http://127.0.0.1:${apiPort}/api/v1/networkconfig/${selectedNetwork}`)
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
    <div className="config-panel">
      <h2 className="config-title">Config: {selectedNetwork}</h2>

      {/* Search Box */}
      <div className="config-search-box">
        <FaSearch className="config-search-icon" />
        <input
          type="text"
          placeholder="Search config..."
          value={searchTerm}
          onChange={handleSearch}
          className="config-search-input"
        />
        {searchTerm && (
          <button
            className="config-clear-button"
            onClick={clearSearch}
          >
            <FaTimes />
          </button>
        )}
      </div>

      {/* Expand/Collapse ALL Toggle */}
      <div className="config-toggle">
        <button
          className="config-toggle-btn"
          onClick={handleExpandCollapseAll}
        >
          {isExpanded ? (
            <>
              Collapse All <FaMinusSquare className="ml-1" />
            </>
          ) : (
            <>
              Expand All <FaPlusSquare className="ml-1" />
            </>
          )}
        </button>
      </div>

      {/* Scrollable Tree View Container */}
      <div className="config-tree-container">
        {error ? (
          <p className="config-error">{error}</p>
        ) : filteredTree.length > 0 ? (
          <TreeView tree={filteredTree} onToggle={handleToggle} />
        ) : (
          <p className="config-empty">No matches found</p>
        )}
      </div>
    </div>
  );
};

// Component to render the tree structure
const TreeView = ({ tree, onToggle }: { tree: TreeNode[]; onToggle: (key: string) => void }) => {
  return (
    <ul className="ml-4 space-y-1">
      {tree.map((node) => (
        <li key={node.uniqueKey} className="flex flex-col">
          {/* Expand/Collapse Button */}
          {node.children ? (
            <button
              onClick={() => onToggle(node.uniqueKey)}
              className="tree-node-button"
            >
              {node.expanded ? <FaMinusSquare /> : <FaPlusSquare />}{" "}
              <span className="ml-1 font-mono">{node.key}</span>
            </button>
          ) : (
            <span className="ml-5 font-mono">• {node.key}</span>
          )}

          {/* Render Value or Children */}
          {node.children && node.expanded ? (
            <TreeView tree={node.children} onToggle={onToggle} />
          ) : (
            node.value !== undefined && <span className="tree-node-value">{JSON.stringify(node.value)}</span>
          )}
        </li>
      ))}
    </ul>
  );
};

export default ConfigPanel;
