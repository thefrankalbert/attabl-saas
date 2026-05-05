'use client';

import { useSyncExternalStore, useState, useRef, useEffect } from 'react';

function subscribeToNetworkEvents(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getOnlineSnapshot(): boolean {
  return navigator.onLine;
}

function getOnlineServerSnapshot(): boolean {
  return true;
}

export function useNetworkStatus() {
  const isOnline = useSyncExternalStore(
    subscribeToNetworkEvents,
    getOnlineSnapshot,
    getOnlineServerSnapshot,
  );
  const [wasOffline, setWasOffline] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleBackOnline() {
      setWasOffline(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setWasOffline(false), 5000);
    }
    window.addEventListener('online', handleBackOnline);
    return () => {
      window.removeEventListener('online', handleBackOnline);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { isOnline, wasOffline };
}
