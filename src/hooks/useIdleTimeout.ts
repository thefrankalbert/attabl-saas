'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useIdleTimer } from 'react-idle-timer';

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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onLockRef = useRef(onLock);

  useEffect(() => {
    onLockRef.current = onLock;
  }, [onLock]);

  const clearCountdown = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => clearCountdown, [clearCountdown]);

  const { reset: timerReset, getRemainingTime } = useIdleTimer({
    timeout: (timeoutMinutes ?? 30) * 60 * 1000,
    promptBeforeIdle: warningSeconds * 1000,
    disabled: !timeoutMinutes || timeoutMinutes <= 0,
    throttle: 500,
    onPrompt() {
      setIsWarning(true);
      clearCountdown();
      intervalRef.current = setInterval(() => {
        setRemainingSeconds(Math.ceil(getRemainingTime() / 1000));
      }, 1000);
    },
    onIdle() {
      clearCountdown();
      setIsWarning(false);
      setRemainingSeconds(0);
      onLockRef.current();
    },
    onActive() {
      clearCountdown();
      setIsWarning(false);
      setRemainingSeconds(0);
    },
  });

  const resetTimer = useCallback(() => {
    timerReset();
    clearCountdown();
    setIsWarning(false);
    setRemainingSeconds(0);
  }, [timerReset, clearCountdown]);

  return { isWarning, remainingSeconds, resetTimer };
}
