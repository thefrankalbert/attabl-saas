'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

export function useScrollRestoration<T extends HTMLElement = HTMLElement>(
  containerRef?: React.RefObject<T | null>,
) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Unique key for the current URL state
  const pageKey = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const STORAGE_KEY_PREFIX = 'scroll-pos:';

  // 1. Disable native restoration
  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  // 2. Save scroll position on scroll
  useEffect(() => {
    const handleScroll = () => {
      const currentScroll = containerRef?.current ? containerRef.current.scrollTop : window.scrollY;

      sessionStorage.setItem(`${STORAGE_KEY_PREFIX}${pageKey}`, currentScroll.toString());
    };

    const target = containerRef?.current || window;
    target.addEventListener('scroll', handleScroll, { passive: true });

    return () => target.removeEventListener('scroll', handleScroll);
  }, [pageKey, containerRef]);

  // 3. Smart Restoration Logic
  useEffect(() => {
    const restoreScroll = () => {
      const savedPos = sessionStorage.getItem(`${STORAGE_KEY_PREFIX}${pageKey}`);
      if (!savedPos) return;

      const targetPos = parseInt(savedPos, 10);
      const targetElement = containerRef?.current;

      const attemptScroll = () => {
        if (targetElement) {
          targetElement.scrollTop = targetPos;
          return Math.abs(targetElement.scrollTop - targetPos) < 5;
        } else {
          window.scrollTo(0, targetPos);
          return Math.abs(window.scrollY - targetPos) < 5;
        }
      };

      // Initial attempt
      if (attemptScroll()) return;

      // Retry loop for dynamic content (up to 1s)
      let attempts = 0;
      const interval = setInterval(() => {
        if (attemptScroll() || attempts > 20) clearInterval(interval);
        attempts++;
      }, 50);

      return () => clearInterval(interval);
    };

    // Delay slightly to allow initial render
    const timeout = setTimeout(restoreScroll, 0);
    return () => clearTimeout(timeout);
  }, [pageKey, containerRef]);
}
