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
import { TreeItem, type TreeItemProps } from '@mui/x-tree-view/TreeItem';
import { useTreeItemUtils } from '@mui/x-tree-view/hooks';
import type { UseTreeItemLabelInputSlotOwnProps, UseTreeItemLabelSlotOwnProps } from '@mui/x-tree-view/useTreeItem';
import CustomLabel from './CustomLabel';
import { CustomLabelInput } from './CustomLabelInput';
import { useTreeOperations } from '../../context/TreeOperationsContext';
import { getAllNestedItems } from '../../utils/slydata/jsonTree';

export const CustomTreeItem = React.forwardRef<HTMLLIElement, TreeItemProps>(function CustomTreeItem(props: TreeItemProps, ref) {
  const { handleDeleteItem, handleAddWithConflictCheck, treeData } = useTreeOperations();
  const { interactions, status } = useTreeItemUtils({ itemId: props.itemId, children: props.children });

  const itemData = treeData.find((i) => i.id === props.itemId) || treeData.flatMap((i) => getAllNestedItems(i)).find((i) => i.id === props.itemId);

  const handleContentDoubleClick: UseTreeItemLabelSlotOwnProps['onDoubleClick'] = (event) => { event.defaultMuiPrevented = true; };
  const handleInputBlur: UseTreeItemLabelInputSlotOwnProps['onBlur'] = (event) => { event.defaultMuiPrevented = true; };
  const handleInputKeyDown: UseTreeItemLabelInputSlotOwnProps['onKeyDown'] = (event) => { event.defaultMuiPrevented = true; };

  const handleDelete = () => { if (itemData?.id && itemData.id !== 'root') handleDeleteItem(itemData.id); };
  const handleAddChild = () => { if (itemData?.id) handleAddWithConflictCheck(itemData.id); };
  const indentLevel = (itemData?.depth || 0) * 8;

  return (
    <TreeItem
      {...props}
      ref={ref}
      slots={{ label: CustomLabel as any, labelInput: CustomLabelInput as any }}
      slotProps={{
        label: { onDoubleClick: handleContentDoubleClick, editable: status.editable, editing: status.editing, toggleItemEditing: interactions.toggleItemEditing, itemData, onDelete: handleDelete, onAddChild: handleAddChild } as any,
        labelInput: { onBlur: handleInputBlur, onKeyDown: handleInputKeyDown, handleCancelItemLabelEditing: interactions.handleCancelItemLabelEditing, handleSaveItemLabel: interactions.handleSaveItemLabel } as any,
      }}
      sx={{ '& > .MuiTreeItem-content': { marginLeft: `${indentLevel}px` } }}
    />
  );
});
