'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { createIdbAsyncStorage } from '@/lib/offline/idb-async-storage';

// Exporte pour etre testable: c'est l'absence de `mutations.networkMode` ici qui
// faisait perdre les commandes prises hors ligne, sans qu'aucun test ne le voie.
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 24 * 60 * 60 * 1000,
        retry: 3,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        // Offline-first: with the default 'online' mode, queries PAUSE when the
        // device is offline (navigator.onLine === false) and their isLoading
        // never resolves - which left the POS/KDS stuck forever on "Chargement..."
        // on a tablet with the wifi cut. 'offlineFirst' resolves the query from
        // the persisted IndexedDB cache immediately (last-known menu, orders,
        // tables) and settles instead of hanging when there is no network.
        networkMode: 'offlineFirst',
      },
      mutations: {
        // Sans cette ligne, networkMode vaut 'online' par defaut et TanStack met
        // les mutations EN PAUSE des que l'evenement `offline` arrive: mutationFn
        // n'est jamais appelee. Or c'est dans mutationFn que vit submitOrder, donc
        // outbox.enqueue. Resultat sur une tablette de caisse dont le wifi coupe:
        // la commande n'est ni envoyee, ni mise en file, ni signalee - elle
        // disparait. Et la mutation en pause reste `isPending` indefiniment, ce qui
        // faisait avaler en silence toutes les commandes suivantes.
        // 'offlineFirst' laisse mutationFn s'executer, le fetch echoue, l'outbox
        // prend le relais et le bandeau "en attente" se met a jour.
        networkMode: 'offlineFirst',
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
