'use client';

import { useState, useEffect, useCallback } from 'react';

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sync state when user exits fullscreen via Escape key or browser controls
  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {
        // Silently ignore — some browsers block without user gesture
      });
    } else {
      document.exitFullscreen().catch(() => {
        // Silently ignore
      });
    }
  }, []);

  return { isFullscreen, toggleFullscreen };
}
