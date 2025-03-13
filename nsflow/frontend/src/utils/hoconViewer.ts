export type TreeNode = {
    key: string;
    uniqueKey: string; // Unique hierarchical key
    value?: any;
    children?: TreeNode[];
    expanded: boolean;
  };
  
  // Convert HOCON (parsed) into a tree structure
  export const convertToTree = (data: any, parentKey: string = ""): TreeNode[] => {
    if (!data || typeof data !== "object") return [];
  
    return Object.entries(data).map(([key, value]) => {
      // Create a unique key based on the full path in the tree
      const uniqueKey = parentKey ? `${parentKey}.${key}` : key;
  
      if (typeof value === "object" && value !== null) {
        return {
          key: key,
          uniqueKey: uniqueKey, // Ensure uniqueness
          children: convertToTree(value, uniqueKey),
          expanded: false,
        };
      }
  
      return {
        key: key,
        uniqueKey: uniqueKey, // Ensure uniqueness
        value: value,
        expanded: false,
      };
    });
  };
  
  // Toggle expansion state for a node using `uniqueKey`
  export const toggleNode = (tree: TreeNode[], targetKey: string): TreeNode[] => {
    return tree.map((node) => {
      if (node.uniqueKey === targetKey) {
        return { ...node, expanded: !node.expanded };
      }
      if (node.children) {
        return { ...node, children: toggleNode(node.children, targetKey) };
      }
      return node;
    });
  };
  
  // Expand or collapse **all** nodes
  export const setExpandCollapseAll = (tree: TreeNode[], expand: boolean): TreeNode[] => {
    return tree.map((node) => ({
      ...node,
      expanded: expand,
      children: node.children ? setExpandCollapseAll(node.children, expand) : undefined,
    }));
  };
  