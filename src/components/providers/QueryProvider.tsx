'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { createIdbAsyncStorage } from '@/lib/offline/idb-async-storage';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 24 * 60 * 60 * 1000,
        retry: 3,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
    },
  });
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  // Read cache lives in IndexedDB (no 5MB cap, async) for the offline-first
  // tablets; falls back to localStorage when IndexedDB is unavailable.
  const storage =
    typeof window !== 'undefined' ? (createIdbAsyncStorage() ?? window.localStorage) : undefined;

  const persister = storage
    ? createAsyncStoragePersister({
        storage,
        key: 'attabl-query-cache',
      })
    : undefined;

  if (!persister) {
    // SSR fallback - provide QueryClient without persistence
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60 * 1000,
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
