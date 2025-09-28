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

import React from 'react';
import type { TreeOperationsContextType } from '../types/slyTree';

export const TreeOperationsContext = React.createContext<TreeOperationsContextType | null>(null);

export const useTreeOperations = () => {
  const ctx = React.useContext(TreeOperationsContext);
  if (!ctx) throw new Error('useTreeOperations must be used within TreeOperationsContext.Provider');
  return ctx;
};
