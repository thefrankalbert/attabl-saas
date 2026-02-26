'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';

const ScreenLock = dynamic(() => import('./ScreenLock').then((mod) => mod.ScreenLock), {
  ssr: false,
});

interface AdminIdleWrapperProps {
  children: React.ReactNode;
  idleTimeoutMinutes: number | null;
  screenLockMode: 'overlay' | 'password';
  tenantName: string;
}

export function AdminIdleWrapper({
  children,
  idleTimeoutMinutes,
  screenLockMode,
  tenantName,
}: AdminIdleWrapperProps) {
  const [isLocked, setIsLocked] = useState(false);

  const handleLock = useCallback(() => {
    setIsLocked(true);
  }, []);

  const handleUnlock = useCallback(() => {
    setIsLocked(false);
  }, []);

  const { isWarning, remainingSeconds } = useIdleTimeout({
    timeoutMinutes: idleTimeoutMinutes,
    onLock: handleLock,
    warningSeconds: 60,
  });

  return (
    <>
      <ScreenLock
        mode={screenLockMode}
        isLocked={isLocked}
        onUnlock={handleUnlock}
        tenantName={tenantName}
        isWarning={isWarning}
        remainingSeconds={remainingSeconds}
      />
      {children}
    </>
  );
}
