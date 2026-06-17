'use client';

import { useState, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { MapPin, Search, QrCode, ChevronDown, User, X, Clock, Loader2 } from 'lucide-react';
import { logger } from '@/lib/logger';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { QRScanResult } from '@/components/tenant/QRScanner';
import type { Table, MenuItem } from '@/types/admin.types';
import { MenuItemCard } from '@/components/tenant/client/MenuItemCard';
import type { ClientMenuItem } from '@/components/tenant/client/MenuItemCard';
import { CardAddControl } from '@/components/tenant/client/CardAddControl';
import { sanitizeTypography } from '@/lib/utils/sanitize-typography';
import { noopSubscribe } from '@/lib/utils/noop-subscribe';
import ItemDetailSheet from '@/components/tenant/ItemDetailSheet';

const QRScanner = dynamic(() => import('@/components/tenant/QRScanner'), {
  ssr: false,
  loading: () => null,
});

const MAX_RECENT = 4;

interface Props {
  site: string;
  tenantName: string;
  tables?: Table[];
  popularItems?: ClientMenuItem[];
  /** Full menu items for the popular list (same ids as popularItems). */
  popularFull?: MenuItem[];
  /** Badge label for featured items when deriving the search display cards. */
  featuredLabel?: string;
  currencyCode?: string;
  isOpen?: boolean;
  restaurantId?: string;
  currency?: string;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function HomeHeaderClient({
  site,
  tenantName,
  tables,
  popularItems = [],
  popularFull = [],
  featuredLabel,
  currencyCode = 'XAF',
  isOpen = true,
  restaurantId,
  currency,
}: Props) {
  const t = useTranslations('homeHeader');
  const tt = useTranslations('tenant');
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

  return (
    <>
      <header className="flex items-center justify-between bg-white px-4 pb-2.5 pt-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--color-divider)] bg-[var(--color-surface-alt)]">
            <MapPin className="h-3.5 w-3.5 text-[var(--color-ink-2)]" />
          </div>
          <div>
            <div className="font-mono text-xs font-medium uppercase tracking-[0.4px] text-[var(--color-ink-muted)]">
              {t('youAreAt')}
            </div>
            <Link
              href={`/sites/${site}/settings`}
              className="flex items-center gap-1 text-[14px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ink)]"
            >
              {tenantName}
              {tableNum && (
                <span className="text-[var(--color-ink-2)]">
                  &nbsp;-&nbsp;{t('tableLabel', { table: tableNum })}
                </span>
              )}
              <ChevronDown className="h-3.5 w-3.5 text-[var(--color-ink-muted)]" strokeWidth={2} />
            </Link>
          </div>
        </div>
        <Link
          href={`/sites/${site}/settings`}
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--color-divider)] bg-[var(--color-surface-alt)] text-[var(--color-ink)]"
          aria-label={t('accountSettings')}
        >
          <User className="h-[18px] w-[18px] text-[var(--color-ink-2)]" strokeWidth={2} />
        </Link>
      </header>

      <div className="px-4 pb-3.5 pt-1.5">
        <div className="flex h-11 items-center gap-2.5 rounded-[var(--radius-search)] border border-[var(--color-divider)] bg-[var(--color-surface-alt)] px-3">
          <Search
            className="h-[17px] w-[17px] shrink-0 text-[var(--color-ink-muted)]"
            strokeWidth={2}
          />
          <Button
            type="button"
            variant="ghost"
            onClick={openSearch}
            className="h-auto flex-1 justify-start p-0 text-[13.5px] font-normal tracking-[-0.01em] text-[var(--color-ink-muted)] hover:bg-transparent"
            aria-label={t('searchMenu')}
          >
            {t('searchPlaceholder')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setIsQROpen(true)}
            aria-label={t('scanQR')}
            className="h-[26px] w-[26px] rounded-lg bg-[var(--color-ink)] p-0 hover:bg-[var(--color-ink)]"
          >
            <QrCode className="h-3.5 w-3.5 text-white" strokeWidth={2} />
          </Button>
        </div>
      </div>

      {isSearchOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex shrink-0 items-center gap-2.5 border-b border-[var(--color-divider)] px-3.5 py-3">
            <div className="flex h-10 flex-1 items-center gap-2.5 rounded-[var(--radius-search)] border border-[var(--color-divider)] bg-[var(--color-surface-alt)] px-3">
              <Search
                className="h-[17px] w-[17px] shrink-0 text-[var(--color-ink-muted)]"
                strokeWidth={2}
              />
              <Input
                autoFocus
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-auto flex-1 border-none bg-transparent p-0 text-[14px] font-medium tracking-[-0.1px] shadow-none focus-visible:ring-0"
              />
              {searchQuery && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setSearchQuery('')}
                  aria-label={t('searchClear')}
                  className="h-[18px] w-[18px] shrink-0 rounded-full bg-[var(--color-ink)] p-0 hover:bg-[var(--color-ink)]"
                >
                  <X className="h-[11px] w-[11px] text-white" strokeWidth={2.6} />
                </Button>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={closeSearch}
              className="shrink-0 px-1 text-[13.5px] font-medium text-[var(--color-ink-2)] hover:bg-transparent"
            >
              {t('searchClose')}
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-10 pt-[18px]">
            {!searchQuery.trim() ? (
              <>
                {recent.length > 0 && (
                  <div className="mb-6">
                    <div className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.5px] text-[var(--color-ink-muted)]">
                      {t('searchRecent')}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {recent.map((r) => (
                        <Button
                          key={r}
                          type="button"
                          variant="outline"
                          onClick={() => setSearchQuery(r)}
                          className="h-auto gap-1.5 rounded-[var(--radius-pill)] border-[var(--color-divider)] bg-white px-[13px] py-2 text-[13px] font-medium tracking-[-0.1px] text-[var(--color-ink-2)]"
                        >
                          <Clock className="h-[13px] w-[13px] text-[var(--color-ink-soft)]" />
                          {r}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {popularItems.length > 0 && (
                  <div>
                    <div className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.5px] text-[var(--color-ink-muted)]">
                      {t('searchPopular')}
                    </div>
                    <div>
                      {popularItems.map((item) => {
                        const it = fullById.get(item.id);
                        return (
                          <MenuItemCard
                            key={item.id}
                            item={item}
                            variant="list"
                            currencyCode={currencyCode}
                            onOpen={() => openDetail(item.id)}
                            addControl={
                              it ? (
                                <CardAddControl
                                  item={it}
                                  restaurantId={restaurantId ?? ''}
                                  onOpen={() => openDetail(item.id)}
                                  placement="corner"
                                  addLabel={tt('ariaAddUpsell', { name: item.name })}
                                />
                              ) : undefined
                            }
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : searchLoading && searchFull.length === 0 ? (
              <div className="flex justify-center pt-[72px]">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--color-ink-soft)]" />
              </div>
            ) : searchResults.length > 0 ? (
              <>
                <div className="mb-1 text-[12.5px] font-medium text-[var(--color-ink-muted)]">
                  {t('searchResultsCount', {
                    count: searchResults.length,
                    query: searchQuery.trim(),
                  })}
                </div>
                <div>
                  {searchResults.map((item) => {
                    const it = fullById.get(item.id);
                    const openResult = () => {
                      pushRecent(searchQuery);
                      openDetail(item.id);
                    };
                    return (
                      <MenuItemCard
                        key={item.id}
                        item={item}
                        variant="list"
                        currencyCode={currencyCode}
                        onOpen={openResult}
                        addControl={
                          it ? (
                            <CardAddControl
                              item={it}
                              restaurantId={restaurantId ?? ''}
                              onOpen={openResult}
                              placement="corner"
                              addLabel={tt('ariaAddUpsell', { name: item.name })}
                            />
                          ) : undefined
                        }
                      />
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="pt-[60px] text-center">
                <div className="mx-auto mb-4 flex h-[72px] w-[72px] items-center justify-center rounded-[var(--radius-modal)] border border-[var(--color-divider)] bg-[var(--color-surface-alt)]">
                  <Search className="h-7 w-7 text-[var(--color-ink-soft)]" strokeWidth={1.6} />
                </div>
                <div className="text-[16px] font-semibold tracking-[-0.3px] text-[var(--color-ink)]">
                  {t('searchNoResults')}
                </div>
                <div className="mt-1.5 text-[13px] text-[var(--color-ink-muted)]">
                  {t('searchNoneHint')}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {detailItem && (
        <ItemDetailSheet
          item={detailItem}
          isOpen={!!detailItem}
          onClose={() => setDetailItem(null)}
          restaurantId={restaurantId ?? ''}
          currency={currency}
        />
      )}

      {isQROpen && (
        <QRScanner
          isOpen={isQROpen}
          onClose={() => setIsQROpen(false)}
          onScan={handleQRScan}
          tables={tables}
          tenantName={tenantName}
          isOpen_venue={isOpen}
        />
      )}
    </>
  );
}
