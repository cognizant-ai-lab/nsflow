import { useEffect, useState } from "react";
import { FaPlusSquare, FaMinusSquare } from "react-icons/fa";
import { useApiPort } from "../context/ApiPortContext";
import { convertToTree, toggleNode, setExpandCollapseAll, TreeNode } from "../utils/hoconViewer";

const ConfigPanel = ({ selectedNetwork }: { selectedNetwork: string }) => {
  const { apiPort } = useApiPort();
  const [configTree, setConfigTree] = useState<TreeNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!selectedNetwork) return;
    console.log(`Generating config map for the network: ${selectedNetwork}`);

    fetch(`http://127.0.0.1:${apiPort}/api/v1/networkconfig/${selectedNetwork}`)
      .then((res) => res.json())
      .then((data) => setConfigTree(convertToTree(data)))
      .catch((err) => setError(err.message));
  }, [selectedNetwork]);

  // Expand/Collapse a specific node
  const handleToggle = (uniqueKey: string) => {
    setConfigTree((prevTree) => toggleNode(prevTree, uniqueKey));
  };

  // Expand/Collapse **all** nodes
  const handleExpandCollapseAll = () => {
    const newExpandState = !isExpanded; // Toggle state
    setConfigTree((prevTree) => setExpandCollapseAll(prevTree, newExpandState));
    setIsExpanded(newExpandState);
  };

  return (
    <div className="p-4 border border-gray-700 rounded-md bg-gray-900 text-white h-full flex flex-col">
      <h2 className="text-lg font-bold mb-2">Config: {selectedNetwork}</h2>

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
        ) : configTree.length > 0 ? (
          <TreeView tree={configTree} onToggle={handleToggle} />
        ) : (
          <p>Loading...</p>
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
