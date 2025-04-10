
# Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
# All Rights Reserved.
# Issued under the Academic Public License.
#
# You can be released from the terms, and requirements of the Academic Public
# License by purchasing a commercial license.
# Purchase of a commercial license is mandatory for any use of the
# ENN-release SDK Software in commercial settings.
#
# END COPYRIGHT
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
    <div className="p-4 border border-gray-700 rounded-md bg-gray-900 text-white h-full flex flex-col">
      <h2 className="text-lg font-bold mb-2">Config: {selectedNetwork}</h2>

      {/* Search Box */}
      <div className="mb-2 flex items-center bg-gray-800 px-3 py-2 rounded-md">
        <FaSearch className="text-gray-400 mr-2" />
        <input
          type="text"
          placeholder="Search config..."
          value={searchTerm}
          onChange={handleSearch}
          className="bg-transparent text-white w-full focus:outline-none"
        />
        {searchTerm && (
          <button
            className="absolute right-14 text-gray-400 hover:text-white"
            onClick={clearSearch}
          >
            <FaTimes />
          </button>
        )}
      </div>

      {/* Expand/Collapse ALL Toggle */}
      <div className="mb-2">
        <button
          className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-md text-sm flex items-center"
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
      <div className="flex-grow bg-gray-800 rounded-md text-sm p-2 overflow-y-auto max-h-[65vh]">
        {error ? (
          <p className="text-red-500">{error}</p>
        ) : filteredTree.length > 0 ? (
          <TreeView tree={filteredTree} onToggle={handleToggle} />
        ) : (
          <p>No matches found</p>
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
              className="mr-2 text-blue-400 hover:text-blue-300 flex items-center"
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
            node.value !== undefined && <span className="ml-6 text-yellow-400">{JSON.stringify(node.value)}</span>
          )}
        </li>
      ))}
    </ul>
  );
};

export default ConfigPanel;
