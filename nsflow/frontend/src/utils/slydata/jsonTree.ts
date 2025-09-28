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

import type { SlyTreeItem } from '../../types/slyTree';

export const getAllNestedItems = (item: SlyTreeItem): SlyTreeItem[] => {
  const result: SlyTreeItem[] = [item];
  if (item.children) item.children.forEach((c) => result.push(...getAllNestedItems(c)));
  return result;
};

export const getAllItemIds = (items: SlyTreeItem[]): string[] => {
  const ids: string[] = [];
  for (const it of items) {
    ids.push(it.id);
    if (it.children?.length) ids.push(...getAllItemIds(it.children));
  }
  return ids;
};

export const treeDataToJson = (items: SlyTreeItem[]): any => {
  const result: any = {};
  items.forEach((item) => {
    if (item.isKeyValuePair && item.key) {
      if (item.children && item.children.length > 0) {
        result[item.key] = treeDataToJson(item.children);
      } else {
        result[item.key] = item.value;
      }
    }
  });
  return result;
};

export const jsonToTreeData = (
  json: any,
  nextIdRef: { current: number },
  parentId?: string,
  depth = 0
): SlyTreeItem[] => {
  if (!json || typeof json !== 'object') return [];

  const generateLocalId = () => `item_${nextIdRef.current++}`;

  const convertObject = (obj: any, currentDepth: number, currentParentId?: string): SlyTreeItem[] =>
    Object.entries(obj).map(([key, value]) => {
      const id = generateLocalId();
      const hasValue = typeof value !== 'object' || value === null;
      const item: SlyTreeItem = {
        id,
        label: hasValue ? `${key}: ${JSON.stringify(value)}` : `${key}`,
        key,
        value: hasValue ? value : undefined,
        parentId: currentParentId,
        isKeyValuePair: true,
        type: Array.isArray(value) ? 'array' : (typeof value as any),
        depth: currentDepth,
        hasValue,
      };
      if (typeof value === 'object' && value !== null) {
        item.children = convertObject(value, currentDepth + 1, id);
      }
      return item;
    });

  return convertObject(json, depth, parentId);
};

export const validateJsonForSlyData = (data: any): string | null => {
  try {
    if (data === null || data === undefined) return 'JSON data cannot be null or undefined';
    if (typeof data !== 'object') return 'Root element must be an object, not a primitive value';
    if (Array.isArray(data)) return 'Root element must be an object, not an array';

    const seen = new WeakSet();
    const checkCircular = (obj: any): boolean => {
      if (obj && typeof obj === 'object') {
        if (seen.has(obj)) return true;
        seen.add(obj);
        for (const k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) if (checkCircular(obj[k])) return true;
      }
      return false;
    };
    if (checkCircular(data)) return 'JSON contains circular references which are not supported';

    const validateKeys = (obj: any, path = ''): string | null => {
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            if (typeof key !== 'string') return `Invalid key type at ${path}${key}. Keys must be strings`;
            if (key.trim() === '') return `Empty key found at ${path}. Keys cannot be empty`;
            const value = obj[key];
            if (value && typeof value === 'object' && !Array.isArray(value)) {
              const nested = validateKeys(value, `${path}${key}.`);
              if (nested) return nested;
            }
          }
        }
      }
      return null;
    };

    const keyError = validateKeys(data);
    if (keyError) return keyError;
    return null;
  } catch (e: any) {
    return `Validation error: ${e?.message || 'Unknown error'}`;
  }
};
