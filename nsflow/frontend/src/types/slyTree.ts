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

export interface SlyTreeItem {
  id: string;
  label: string;
  children?: SlyTreeItem[];
  isKeyValuePair?: boolean;
  key?: string;
  value?: any;
  type?: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  parentId?: string;
  depth?: number;
  hasValue?: boolean; // true if item has a primitive value, false if it has children
}

export interface TreeOperationsContextType {
  handleDeleteItem: (id: string) => void;
  handleAddItem: (parentId?: string) => void;
  handleAddWithConflictCheck: (parentId: string) => void;
  handleUpdateKey: (id: string, newKey: string) => void;
  handleUpdateValue: (id: string, newValue: any) => void;
  treeData: SlyTreeItem[];
}
