'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Search, X, Clock, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MenuItem } from '@/types/admin.types';
import { MenuItemCard } from '@/components/tenant/client/MenuItemCard';
import type { ClientMenuItem } from '@/components/tenant/client/MenuItemCard';
import { CardAddControl } from '@/components/tenant/client/CardAddControl';

interface Props {
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  closeSearch: () => void;
  recent: string[];
  popularItems: ClientMenuItem[];
  searchResults: ClientMenuItem[];
  searchFull: MenuItem[];
  searchLoading: boolean;
  fullById: Map<string, MenuItem>;
  openDetail: (id: string) => void;
  pushRecent: (term: string) => void;
  currencyCode: string;
  restaurantId?: string;
}

export function HomeSearchOverlay({
  searchQuery,
  setSearchQuery,
  closeSearch,
  recent,
  popularItems,
  searchResults,
  searchFull,
  searchLoading,
  fullById,
  openDetail,
  pushRecent,
  currencyCode,
  restaurantId,
}: Props) {
  const t = useTranslations('homeHeader');
  const tt = useTranslations('tenant');

  return (
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
            className="h-auto flex-1 border-none bg-transparent p-0 text-[16px] md:text-[14px] font-medium tracking-[-0.1px] shadow-none focus-visible:ring-0"
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
  );
}
