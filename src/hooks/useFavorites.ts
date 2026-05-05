'use client';

import { useCallback, useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FavoritesStore {
  byTenant: Record<string, string[]>;
  toggle: (tenantId: string, id: string) => void;
}

const EMPTY: string[] = [];

const useFavoritesStore = create<FavoritesStore>()(
  persist(
    (set) => ({
      byTenant: {},
      toggle(tenantId, id) {
        set((state) => {
          const ids = new Set(state.byTenant[tenantId] ?? []);
          if (ids.has(id)) ids.delete(id);
          else ids.add(id);
          return { byTenant: { ...state.byTenant, [tenantId]: [...ids] } };
        });
      },
    }),
    { name: 'attabl:favorites' },
  ),
);

export interface UseFavoritesResult {
  favorites: ReadonlySet<string>;
  isFavorite: (id: string) => boolean;
  toggle: (id: string) => void;
}

export function useFavorites(tenantId: string): UseFavoritesResult {
  const ids = useFavoritesStore((state) => state.byTenant[tenantId] ?? EMPTY);
  const storeToggle = useFavoritesStore((state) => state.toggle);

  const favorites = useMemo(() => new Set<string>(ids), [ids]);
  const toggle = useCallback((id: string) => storeToggle(tenantId, id), [storeToggle, tenantId]);
  const isFavorite = useCallback((id: string) => favorites.has(id), [favorites]);

  return { favorites, isFavorite, toggle };
}
