'use client';

import { useState, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { logger } from '@/lib/logger';
import type { QRScanResult } from '@/components/tenant/QRScanner';
import type { MenuItem } from '@/types/admin.types';
import type { ClientMenuItem } from '@/components/tenant/client/MenuItemCard';
import { sanitizeTypography } from '@/lib/utils/sanitize-typography';
import { noopSubscribe } from '@/lib/utils/noop-subscribe';

const MAX_RECENT = 4;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

interface UseHomeHeaderArgs {
  site: string;
  popularFull: MenuItem[];
  featuredLabel?: string;
}

export function useHomeHeader({ site, popularFull, featuredLabel }: UseHomeHeaderArgs) {
  const router = useRouter();
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
  // Search corpus is lazy-loaded on first search open (keeps it off the home LCP).
  const [searchFull, setSearchFull] = useState<MenuItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchLoadedRef = useRef(false);
  const [isQROpen, setIsQROpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);

  const recentKey = `attabl_${site}_recent_searches`;

  const tableNum = useSyncExternalStore(
    noopSubscribe,
    () => {
      try {
        return localStorage.getItem(`attabl_${site}_table`);
      } catch {
        return null;
      }
    },
    () => null,
  );

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery('');
  }, []);

  // Lazy-load the full search corpus once, on first search open.
  const loadCorpus = useCallback(async () => {
    if (searchLoadedRef.current) return;
    searchLoadedRef.current = true;
    setSearchLoading(true);
    try {
      const res = await fetch('/api/menu-search');
      if (res.ok) {
        const json = (await res.json()) as { items?: MenuItem[] };
        setSearchFull(json.items ?? []);
      } else {
        searchLoadedRef.current = false; // allow a retry on next open
      }
    } catch (err) {
      searchLoadedRef.current = false;
      logger.warn('Search corpus load failed', { error: err });
    } finally {
      setSearchLoading(false);
    }
  }, []);

  // Load persisted recents synchronously when opening (avoids setState-in-effect).
  const openSearch = useCallback(() => {
    try {
      const raw = localStorage.getItem(recentKey);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        setRecent(parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENT));
      }
    } catch {
      // ignore malformed/unavailable storage
    }
    setIsSearchOpen(true);
    void loadCorpus();
  }, [recentKey, loadCorpus]);

  const pushRecent = useCallback(
    (term: string) => {
      const clean = term.trim();
      if (clean.length < 2) return;
      const next = [clean, ...recent.filter((r) => r.toLowerCase() !== clean.toLowerCase())].slice(
        0,
        MAX_RECENT,
      );
      setRecent(next);
      try {
        localStorage.setItem(recentKey, JSON.stringify(next));
      } catch {
        // localStorage unavailable (private mode) - recents stay in-memory only
      }
    },
    [recent, recentKey],
  );

  useEffect(() => {
    if (!isSearchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSearch();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isSearchOpen, closeSearch]);

  // Map id -> full menu item so the search/popular cards can open the detail
  // sheet or add to cart, like the home sections.
  const fullById = useMemo(() => {
    const m = new Map<string, MenuItem>();
    for (const it of popularFull) m.set(it.id, it);
    for (const it of searchFull) m.set(it.id, it);
    return m;
  }, [popularFull, searchFull]);

  const openDetail = (id: string) => {
    const it = fullById.get(id);
    if (it) setDetailItem(it);
  };

  // Display cards derived from the lazily-loaded corpus.
  const searchItems: ClientMenuItem[] = useMemo(
    () =>
      searchFull.map((it) => ({
        id: it.id,
        categoryId: it.category_id,
        name: sanitizeTypography(it.name),
        description: it.description ? sanitizeTypography(it.description) : null,
        price: it.price,
        photoUrl: it.image_url ?? null,
        rating: it.rating ?? null,
        ratingCount: it.rating_count ?? null,
        badges: it.is_featured
          ? [{ kind: 'popular' as const, label: featuredLabel ?? '' }]
          : undefined,
        isAvailable: it.is_available,
      })),
    [searchFull, featuredLabel],
  );

  const q = normalize(searchQuery.trim());
  const searchResults =
    q.length > 0
      ? searchItems.filter(
          (item) =>
            normalize(item.name).includes(q) ||
            (item.description !== null && normalize(item.description).includes(q)),
        )
      : [];

  function handleQRScan(result: QRScanResult) {
    if (result.tableNumber) {
      localStorage.setItem(`attabl_${site}_table`, result.tableNumber);
    }
    setIsQROpen(false);
    const target = result.menuSlug
      ? `/sites/${site}/menu?menu=${result.menuSlug}${result.tableNumber ? `&table=${result.tableNumber}` : ''}`
      : result.tableNumber
        ? `/sites/${site}/menu?table=${result.tableNumber}`
        : `/sites/${site}/menu`;
    router.push(target);
  }

  return {
    detailItem,
    setDetailItem,
    searchFull,
    searchLoading,
    isQROpen,
    setIsQROpen,
    isSearchOpen,
    searchQuery,
    setSearchQuery,
    recent,
    tableNum,
    closeSearch,
    openSearch,
    pushRecent,
    fullById,
    openDetail,
    searchResults,
    handleQRScan,
  };
}
