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

import { useRef, useEffect, useCallback, useState } from 'react';

/**
 * Smart auto-scroll hook for chat interfaces.
 *
 * Features:
 * - Auto-scrolls to bottom when new messages arrive (if already near bottom)
 * - Preserves scroll position when user scrolls up
 * - Provides manual scroll-to-bottom function
 * - Returns isNearBottom state for UI indicators
 *
 * @param dependencies - Array of dependencies that trigger scroll (e.g., messages array)
 * @param threshold - Distance from bottom (in px) to consider "near bottom" (default: 100)
 * @returns Object with scrollRef, scrollToBottom function, and isNearBottom state
 */
export function useSmartAutoScroll<T extends HTMLElement = HTMLDivElement>(
  dependencies: unknown[] = [],
  threshold = 100
) {
  const scrollRef = useRef<T>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const shouldAutoScrollRef = useRef(true);

  // Check if scrolled near bottom
  const checkIfNearBottom = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return false;

    const { scrollTop, scrollHeight, clientHeight } = element;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const nearBottom = distanceFromBottom <= threshold;

    setIsNearBottom(nearBottom);
    shouldAutoScrollRef.current = nearBottom;

    return nearBottom;
  }, [threshold]);

  // Scroll to bottom
  const scrollToBottom = useCallback((smooth = true) => {
    const element = scrollRef.current;
    if (!element) return;

    element.scrollTo({
      top: element.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });

    // Update state immediately
    setIsNearBottom(true);
    shouldAutoScrollRef.current = true;
  }, []);

  // Auto-scroll when dependencies change (if near bottom)
  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      // Small delay to ensure DOM has updated
      const timer = setTimeout(() => {
        scrollToBottom(true);
      }, 50);

      return () => clearTimeout(timer);
    }
  }, [...dependencies]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen to scroll events
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const handleScroll = () => {
      checkIfNearBottom();
    };

    element.addEventListener('scroll', handleScroll, { passive: true });

    // Initial check
    checkIfNearBottom();

    return () => {
      element.removeEventListener('scroll', handleScroll);
    };
  }, [checkIfNearBottom]);

  return {
    scrollRef,
    scrollToBottom,
    isNearBottom,
  };
}
