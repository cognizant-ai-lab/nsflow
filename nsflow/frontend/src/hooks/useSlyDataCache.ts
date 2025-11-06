/*
Copyright 2025 Cognizant Technology Solutions Corp, www.cognizant.com.

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
