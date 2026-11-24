'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { logger } from '@/lib/logger';
import type { QRScanResult } from '@/components/tenant/QRScanner';
import type { MenuItem } from '@/types/admin.types';
import type { ClientMenuItem } from '@/components/tenant/client/MenuItemCard';
import { sanitizeTypography } from '@/lib/utils/sanitize-typography';
import { saveScannedTable, useScannedTable } from '@/hooks/useScannedTable';
import { matchesSearch, normalizeSearch } from '@/lib/utils/normalize-search';
import { MENU_SEARCH_MIN_LENGTH } from '@/lib/validations/menu-search.schema';

const MAX_RECENT = 4;
/**
 * Attente apres la derniere frappe avant d'interroger le serveur. La limite de
 * debit est partagee par tous les convives du meme Wi-Fi (300 par minute et par
 * adresse): une requete par pause de frappe, pas par lettre (contre-audit 1).
 */
const SEARCH_DEBOUNCE_MS = 400;

interface UseHomeHeaderArgs {
  site: string;
  popularFull: MenuItem[];
  featuredLabel?: string;
  /** Table carried by the scanned QR url (root `/?table=`), persisted on arrival. */
  initialTable?: string;
}

export function useHomeHeader({
  site,
  popularFull,
  featuredLabel,
  initialTable,
}: UseHomeHeaderArgs) {
  const router = useRouter();
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
  // Resultats du serveur pour le dernier terme tape (B4: la recherche se fait
  // cote serveur sur toute la carte, plus sur un corpus des 150 premiers plats).
  const [searchFull, setSearchFull] = useState<MenuItem[]>([]);
  // Dernier terme pour lequel le serveur a repondu (ou echoue).
  const [settledQuery, setSettledQuery] = useState('');
  // Dernier terme dont la recherche a ECHOUE (429, 500, reseau): l'ecran dit
  // "recherche indisponible", pas "aucun resultat".
  const [failedQuery, setFailedQuery] = useState<string | null>(null);
  const [isQROpen, setIsQROpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);

  const recentKey = `attabl_${site}_recent_searches`;

  const tableNum = useScannedTable(site, initialTable);

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery('');
  }, []);

  // Interroge le serveur apres une courte pause de frappe. La requete
  // precedente est annulee: une reponse lente ne remplace jamais une recente.
  const trimmedQuery = searchQuery.trim();
  const searchAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!isSearchOpen || trimmedQuery.length < MENU_SEARCH_MIN_LENGTH) return;
    const timer = setTimeout(() => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      fetch(`/api/menu-search?q=${encodeURIComponent(trimmedQuery.slice(0, 80))}`, {
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) {
            if (searchAbortRef.current === controller) setFailedQuery(trimmedQuery);
            return;
          }
          const json = (await res.json()) as { items?: MenuItem[] };
          setSearchFull(json.items ?? []);
          setFailedQuery(null);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setFailedQuery(trimmedQuery);
          logger.warn('Menu search failed', { error: err });
        })
        .finally(() => {
          if (searchAbortRef.current === controller) setSettledQuery(trimmedQuery);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [isSearchOpen, trimmedQuery]);

  // Annule une recherche en vol quand l'ecran disparait.
  useEffect(() => () => searchAbortRef.current?.abort(), []);
  // En attente tant que le terme affiche n'a pas recu sa reponse (pause de
  // frappe comprise): l'ecran montre le squelette, pas "aucun resultat".
  const searchTooShort = trimmedQuery.length > 0 && trimmedQuery.length < MENU_SEARCH_MIN_LENGTH;
  const searchLoading =
    trimmedQuery.length >= MENU_SEARCH_MIN_LENGTH && settledQuery !== trimmedQuery;
  const searchError = !searchLoading && !searchTooShort && failedQuery === trimmedQuery;

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
  }, [recentKey]);

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

  // Affinage local: les resultats affiches correspondent toujours au terme
  // courant, meme pendant que la reponse du terme suivant est en route. Meme
  // regle que le serveur (nom, nom anglais, description).
  const q = normalizeSearch(trimmedQuery);
  const matchingIds = new Set(
    q.length >= MENU_SEARCH_MIN_LENGTH
      ? searchFull.filter((it) => matchesSearch(it, q)).map((it) => it.id)
      : [],
  );
  const searchResults = searchItems.filter((item) => matchingIds.has(item.id));

  function handleQRScan(result: QRScanResult) {
    if (result.tableNumber) {
      saveScannedTable(site, result.tableNumber);
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
    searchError,
    searchTooShort,
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
