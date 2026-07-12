'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { MapPin, Search, QrCode, ChevronDown, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { Table, MenuItem } from '@/types/admin.types';
import type { ClientMenuItem } from '@/components/tenant/client/MenuItemCard';
import ItemDetailSheet from '@/components/tenant/ItemDetailSheet';
import { useHomeHeader } from '@/components/tenant/client/useHomeHeader';
import { HomeSearchOverlay } from '@/components/tenant/client/HomeSearchOverlay';

const QRScanner = dynamic(() => import('@/components/tenant/QRScanner'), {
  ssr: false,
  loading: () => null,
});

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
  const {
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
  } = useHomeHeader({ site, popularFull, featuredLabel });

  return (
    <>
      <header className="flex items-center justify-between bg-white px-4 pb-2.5 pt-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--color-divider)] bg-[var(--color-surface-alt)]">
            <MapPin className="h-3.5 w-3.5 text-[var(--color-ink-2)]" />
          </div>
          <div className="min-w-0">
            <div className="font-mono text-xs font-medium uppercase tracking-[0.4px] text-[var(--color-ink-muted)]">
              {t('youAreAt')}
            </div>
            <Link
              href={`/sites/${site}/settings`}
              className="flex min-w-0 items-center gap-1 text-[14px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ink)]"
            >
              <span className="truncate">{tenantName}</span>
              {tableNum && (
                <span className="shrink-0 whitespace-nowrap text-[var(--color-ink-2)]">
                  &nbsp;-&nbsp;{t('tableLabel', { table: tableNum })}
                </span>
              )}
              <ChevronDown
                className="h-3.5 w-3.5 shrink-0 text-[var(--color-ink-muted)]"
                strokeWidth={2}
              />
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
        <HomeSearchOverlay
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          closeSearch={closeSearch}
          recent={recent}
          popularItems={popularItems}
          searchResults={searchResults}
          searchFull={searchFull}
          searchLoading={searchLoading}
          fullById={fullById}
          openDetail={openDetail}
          pushRecent={pushRecent}
          currencyCode={currencyCode}
          restaurantId={restaurantId}
        />
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
