'use client';

import { useState, useCallback, useEffect, useSyncExternalStore } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { MapPin, Search, QrCode, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { QRScanResult } from '@/components/tenant/QRScanner';
import type { Table } from '@/types/admin.types';
import { fmtFCFA } from '@/lib/format';

const QRScanner = dynamic(() => import('@/components/tenant/QRScanner'), {
  ssr: false,
  loading: () => null,
});

export interface HomeSearchItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  categoryId: string;
  categoryName: string;
}

interface Props {
  site: string;
  tenantName: string;
  tenantInitials: string;
  logoUrl?: string | null;
  tables?: Table[];
  searchItems?: HomeSearchItem[];
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
  tenantInitials,
  logoUrl,
  tables,
  searchItems = [],
}: Props) {
  const t = useTranslations('homeHeader');
  const router = useRouter();
  const [isQROpen, setIsQROpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const noopSubscribe = useCallback(() => () => {}, []);
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

  const handleResultClick = useCallback(
    (item: HomeSearchItem) => {
      closeSearch();
      router.push(`/sites/${site}/menu?item=${item.id}`);
    },
    [closeSearch, site, router],
  );

  useEffect(() => {
    if (!isSearchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSearch();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isSearchOpen, closeSearch]);

  const q = normalize(searchQuery.trim());
  const searchResults =
    q.length > 0
      ? searchItems.filter(
          (item) =>
            normalize(item.name).includes(q) ||
            (item.description !== null && normalize(item.description).includes(q)) ||
            normalize(item.categoryName).includes(q),
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
                  &nbsp;&middot;&nbsp;{t('tableLabel', { table: tableNum })}
                </span>
              )}
              <ChevronDown className="h-3.5 w-3.5 text-[var(--color-ink-muted)]" strokeWidth={2} />
            </Link>
          </div>
        </div>
        <Link
          href={`/sites/${site}/settings`}
          className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--color-divider)] bg-[var(--color-surface-alt)] text-[12px] font-semibold text-[var(--color-ink)]"
          aria-label={t('accountSettings')}
        >
          {logoUrl ? (
            <Image src={logoUrl} alt={tenantName} fill className="object-cover" sizes="44px" />
          ) : (
            tenantInitials
          )}
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
            onClick={() => setIsSearchOpen(true)}
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
          <div className="flex items-center gap-3 border-b border-[var(--color-divider)] px-4 py-2">
            <Search className="h-4 w-4 shrink-0 text-[var(--color-ink-muted)]" strokeWidth={2} />
            <Input
              autoFocus
              type="search"
              placeholder={t('searchHint')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 border-none bg-transparent p-0 text-[14px] shadow-none focus-visible:ring-0"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={closeSearch}
              className="shrink-0 text-[13px] font-medium text-[var(--color-ink-muted)]"
            >
              {t('searchClose')}
            </Button>
          </div>
          <div
            className="flex-1 overflow-y-auto"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            {searchQuery.trim().length > 0 && searchResults.length === 0 && (
              <p className="px-4 py-10 text-center text-[14px] text-[var(--color-ink-muted)]">
                {t('searchNoResults')}
              </p>
            )}
            {searchResults.map((item) => (
              <Button
                key={item.id}
                type="button"
                variant="ghost"
                onClick={() => handleResultClick(item)}
                className="flex h-auto w-full items-center justify-between rounded-none border-b border-[var(--color-divider)] px-4 py-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium text-[var(--color-ink)]">
                    {item.name}
                  </div>
                  {item.description && (
                    <div className="mt-0.5 truncate text-[12px] text-[var(--color-ink-muted)]">
                      {item.description}
                    </div>
                  )}
                  <div className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.4px] text-[var(--color-ink-muted)]">
                    {item.categoryName}
                  </div>
                </div>
                <div className="ml-3 shrink-0 text-[14px] font-semibold text-[var(--color-ink)]">
                  {fmtFCFA(item.price)}{' '}
                  <span className="font-mono text-[10.5px] font-medium text-[var(--color-ink-muted)]">
                    FCFA
                  </span>
                </div>
              </Button>
            ))}
          </div>
        </div>
      )}

      {isQROpen && (
        <QRScanner
          isOpen={isQROpen}
          onClose={() => setIsQROpen(false)}
          onScan={handleQRScan}
          tables={tables}
        />
      )}
    </>
  );
}
