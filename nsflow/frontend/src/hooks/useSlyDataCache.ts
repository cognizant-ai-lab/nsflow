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

import { useCallback } from 'react';

const CACHE_VERSION = '2.0';

export const useSlyDataCache = () => {
  const getCacheKey = useCallback((networkName: string) => `nsflow-slydata-${networkName}`, []);

  const saveSlyDataToCache = useCallback(
    (data: any, networkName: string, nextId?: number) => {
      if (!networkName) return;
      try {
        const cacheKey = getCacheKey(networkName);
        const cacheData = { version: CACHE_VERSION, timestamp: Date.now(), data, nextId: nextId || 1, networkName };
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
      } catch (e) {
        console.warn('Failed to save SlyData cache', e);
      }
    },
    [getCacheKey]
  );

  const loadSlyDataFromCache = useCallback(
    (networkName: string): { data: any; nextId: number } | null => {
      if (!networkName) return null;
      try {
        const cacheKey = getCacheKey(networkName);
        const cached = localStorage.getItem(cacheKey);
        if (!cached) return null;
        const cacheData = JSON.parse(cached);
        if (cacheData.version !== CACHE_VERSION) {
          localStorage.removeItem(cacheKey);
          return null;
        }
        if (cacheData.networkName && cacheData.networkName !== networkName) {
          localStorage.removeItem(cacheKey);
          return null;
        }
        return { data: cacheData.data || {}, nextId: cacheData.nextId || 1 };
      } catch (e) {
        const cacheKey = getCacheKey(networkName);
        localStorage.removeItem(cacheKey);
        return null;
      }
    },
    [getCacheKey]
  );

  const clearSlyDataCache = useCallback(
    (networkName?: string) => {
      try {
        if (networkName) {
          localStorage.removeItem(getCacheKey(networkName));
        } else {
          Object.keys(localStorage)
            .filter((k) => k.startsWith('nsflow-slydata-'))
            .forEach((k) => localStorage.removeItem(k));
        }
      } catch (e) {
        console.warn('Failed to clear SlyData cache', e);
      }
    },
    [getCacheKey]
  );

  return { saveSlyDataToCache, loadSlyDataFromCache, clearSlyDataCache };
};
