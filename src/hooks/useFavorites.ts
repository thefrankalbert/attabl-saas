'use client';

import { useCallback, useSyncExternalStore } from 'react';

type Listener = () => void;

const listeners = new Set<Listener>();

function subscribe(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notify(): void {
  listeners.forEach((l) => l());
}

const storageKey = (tenantId: string): string => `attabl:favorites:${tenantId}`;

const EMPTY_SNAPSHOT: ReadonlySet<string> = new Set<string>();

const snapshotCache = new Map<string, Set<string>>();

function readFavorites(tenantId: string): Set<string> {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const raw = window.localStorage.getItem(storageKey(tenantId));
    if (!raw) return new Set<string>();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set<string>(parsed.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set<string>();
  }
}

function getSnapshot(tenantId: string): Set<string> {
  const fresh = readFavorites(tenantId);
  const cached = snapshotCache.get(tenantId);
  if (cached && cached.size === fresh.size) {
    let identical = true;
    for (const id of fresh) {
      if (!cached.has(id)) {
        identical = false;
        break;
      }
    }
    if (identical) return cached;
  }
  snapshotCache.set(tenantId, fresh);
  return fresh;
}

function getServerSnapshot(): ReadonlySet<string> {
  return EMPTY_SNAPSHOT;
}

function writeFavorites(tenantId: string, next: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(tenantId), JSON.stringify([...next]));
  } catch {
    // localStorage full or blocked - silent fail
  }
}

export interface UseFavoritesResult {
  favorites: ReadonlySet<string>;
  isFavorite: (id: string) => boolean;
  toggle: (id: string) => void;
}

export function useFavorites(tenantId: string): UseFavoritesResult {
  const favorites = useSyncExternalStore(subscribe, () => getSnapshot(tenantId), getServerSnapshot);

  const toggle = useCallback(
    (id: string) => {
      const current = readFavorites(tenantId);
      if (current.has(id)) current.delete(id);
      else current.add(id);
      writeFavorites(tenantId, current);
      snapshotCache.set(tenantId, current);
      notify();
    },
    [tenantId],
  );

  const isFavorite = useCallback((id: string) => favorites.has(id), [favorites]);

  return { favorites, isFavorite, toggle };
}
