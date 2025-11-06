
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

  export const filterTree = (tree: TreeNode[], query: string): TreeNode[] => {
    return tree
      .map((node) => {
        if (
          node.key.toLowerCase().includes(query) ||
          (node.value && JSON.stringify(node.value).toLowerCase().includes(query))
        ) {
          return { ...node, expanded: true };
        }
  
        if (node.children) {
          const filteredChildren = filterTree(node.children, query);
          if (filteredChildren.length > 0) {
            return { ...node, children: filteredChildren, expanded: true };
          }
        }
  
        return null;
      })
      .filter(Boolean) as TreeNode[];
  };  
  