'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseIdleTimeoutOptions {
  timeoutMinutes: number | null;
  onLock: () => void;
  warningSeconds?: number;
}

export function useIdleTimeout({
  timeoutMinutes,
  onLock,
  warningSeconds = 60,
}: UseIdleTimeoutOptions) {
  const [isWarning, setIsWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const lastActivityRef = useRef<number>(0);
  const onLockRef = useRef(onLock);

  // Keep onLock ref in sync without re-creating effects
  useEffect(() => {
    onLockRef.current = onLock;
  }, [onLock]);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIsWarning(false);
    setRemainingSeconds(0);
  }, []);

  useEffect(() => {
    if (!timeoutMinutes || timeoutMinutes <= 0) return;

    // Initialize activity timestamp on mount
    lastActivityRef.current = Date.now();

    const timeoutMs = timeoutMinutes * 60 * 1000;
    const warningMs = warningSeconds * 1000;

    const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'] as const;

    const handleActivity = () => {
      lastActivityRef.current = Date.now();
      setIsWarning(false);
      setRemainingSeconds(0);
    };

    ACTIVITY_EVENTS.forEach((event) => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    const intervalId = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = timeoutMs - elapsed;

      if (remaining <= 0) {
        clearInterval(intervalId);
        onLockRef.current();
        return;
      }

      if (remaining <= warningMs) {
        setIsWarning(true);
        setRemainingSeconds(Math.ceil(remaining / 1000));
      }
    }, 1000);

    return () => {
      clearInterval(intervalId);
      ACTIVITY_EVENTS.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [timeoutMinutes, warningSeconds]);

  return { isWarning, remainingSeconds, resetTimer };
}
