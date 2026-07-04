'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Star,
  Check,
  X,
  Image as ImageIcon,
  Edit2,
  Trash2,
  Package,
  MoreVertical,
  Plus,
} from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/currency';
import { actionToggleMenuItemAvailable } from '@/app/actions/menu-items';
import { revalidateMenuCache } from '@/lib/revalidate';
import { useToast } from '@/components/ui/use-toast';
import { useSegmentTerms } from '@/hooks/useSegmentTerms';
import { ListPagination } from '@/components/admin/ListPagination';
import type { MenuItem, CurrencyCode } from '@/types/admin.types';

interface ItemsListProps {
  items: MenuItem[];
  pageItems: MenuItem[];
  loading: boolean;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  tenantId: string;
  tenantSlug: string;
  currency: CurrencyCode;
  loadItems: () => void;
  toggleAvailable: (item: MenuItem) => void;
  toggleFeatured: (item: MenuItem) => void;
  onEditItem: (item: MenuItem) => void;
  onDeleteItem: (item: MenuItem) => void;
  onSelectItem: (item: MenuItem) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onAddItem: () => void;
  effectivePage: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}

export function ItemsList({
  items,
  pageItems,
  loading,
  selectedIds,
  setSelectedIds,
  tenantId,
  tenantSlug,
  currency,
  loadItems,
  toggleAvailable,
  toggleFeatured,
  onEditItem,
  onDeleteItem,
  onSelectItem,
  hasActiveFilters,
  onClearFilters,
  onAddItem,
  effectivePage,
  pageSize,
  totalCount,
  onPageChange,
}: ItemsListProps) {
  const { toast } = useToast();
  const t = useTranslations('items');
  const tc = useTranslations('common');
  const seg = useSegmentTerms();
  const router = useRouter();

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden mt-4 sm:mt-6">
      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 mb-2 rounded-xl bg-accent-muted border border-accent/20">
          <span className="text-sm font-medium text-app-text">
            {t('selectedCount', { count: selectedIds.size })}
          </span>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const targetAvailability = [...selectedIds].some((id) => {
                const item = items.find((i) => i.id === id);
                return item && !item.is_available;
              });
              const results = await Promise.allSettled(
                [...selectedIds].map((id) => {
                  const item = items.find((i) => i.id === id);
                  if (!item) return Promise.resolve();
                  return actionToggleMenuItemAvailable(tenantId, item.id, targetAvailability);
                }),
              );
              // A Server Action reports applicative failures (permission, RLS,
              // validation) as a resolved { error } - not a rejection. Count
              // those as failures too, else errors are swallowed silently.
              const failed = results.filter(
                (r) =>
                  r.status === 'rejected' ||
                  (r.status === 'fulfilled' && r.value != null && r.value.error != null),
              );
              if (failed.length > 0) {
                toast({ title: tc('error'), variant: 'destructive' });
              } else {
                setSelectedIds(new Set());
              }
              loadItems();
              router.refresh();
              revalidateMenuCache(tenantSlug);
            }}
          >
            {t('bulkToggleAvailability')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>
            {tc('clear')}
          </Button>
        </div>
      )}

      {/* Items List */}
      {loading && items.length === 0 ? (
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-20 bg-app-card rounded-xl border border-app-border animate-pulse"
            />
          ))}
        </div>
      ) : items.length > 0 ? (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
            <div className="bg-app-card rounded-xl border border-app-border overflow-hidden">
              {/* Select all header */}
              <div className="flex items-center gap-3 px-4 py-2 border-b border-app-border bg-app-bg/30">
                <Checkbox
                  aria-label={tc('selectAll') || 'Select all'}
                  checked={items.length > 0 && items.every((i) => selectedIds.has(i.id))}
                  onCheckedChange={(checked) => {
                    const next = new Set(selectedIds);
                    if (checked) {
                      items.forEach((i) => next.add(i.id));
                    } else {
                      items.forEach((i) => next.delete(i.id));
                    }
                    setSelectedIds(next);
                  }}
                />
                <span className="text-xs text-app-text-muted">
                  {tc('selectAll') || 'Select all'}
                </span>
              </div>
              {pageItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onSelectItem(item)}
                  className="flex flex-wrap lg:flex-nowrap items-center gap-2 sm:gap-3 md:gap-4 px-3 sm:px-4 py-3 border-b border-app-border last:border-b-0 hover:bg-app-bg/50 transition-colors group cursor-pointer"
                >
                  <Checkbox
                    aria-label={`${tc('select') || 'Select'} ${item.name}`}
                    checked={selectedIds.has(item.id)}
                    onCheckedChange={(checked) => {
                      const next = new Set(selectedIds);
                      if (checked) next.add(item.id);
                      else next.delete(item.id);
                      setSelectedIds(next);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0"
                  />
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={item.name}
                      width={48}
                      height={48}
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg object-cover border border-app-border shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-app-bg flex items-center justify-center shrink-0">
                      <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5 text-app-text-muted" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-app-text text-sm break-words">{item.name}</p>
                    <p className="text-xs text-app-text-muted mt-0.5">
                      {item.category?.name || t('uncategorized')}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-app-text text-sm tabular-nums">
                      {formatCurrency(item.price, currency)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAvailable(item);
                    }}
                    className={cn(
                      'h-auto shrink-0 gap-1.5 whitespace-nowrap rounded-[0.625rem] border-[var(--border)] px-2 py-0.5 text-xs font-medium',
                      item.is_available
                        ? 'text-[var(--success)]'
                        : 'text-[var(--muted-foreground)]',
                    )}
                  >
                    {item.is_available ? (
                      <>
                        <Check className="w-3 h-3 inline mr-1" />
                        {t('stock')}
                      </>
                    ) : (
                      <>
                        <X className="w-3 h-3 inline mr-1" />
                        {t('exhausted')}
                      </>
                    )}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="More options"
                        onClick={(e) => e.stopPropagation()}
                        className="h-auto w-auto p-1.5 text-app-text-muted"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditItem(item);
                        }}
                      >
                        <Edit2 className="w-4 h-4 mr-2" /> {t('edit')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFeatured(item);
                        }}
                      >
                        <Star className="w-4 h-4 mr-2" />{' '}
                        {item.is_featured ? t('removedFromFeatured') : t('addedToFeatured')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteItem(item);
                        }}
                        className="text-status-error"
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> {t('delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          </div>
          <ListPagination
            page={effectivePage}
            pageSize={pageSize}
            totalCount={totalCount}
            onPageChange={onPageChange}
          />
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
          <Package className="w-10 h-10 text-app-text-muted mb-3" />
          <p className="text-sm font-medium text-app-text-secondary mb-1">
            {hasActiveFilters ? t('noItemsFilter') : t('noItems')}
          </p>
          <p className="text-xs text-app-text-muted mb-4">
            {hasActiveFilters ? t('noItemsFilterDesc') : t('noItemsDesc')}
          </p>
          {hasActiveFilters ? (
            <Button onClick={onClearFilters} variant="outline" size="sm" className="mb-2">
              {tc('clearFilters')}
            </Button>
          ) : null}
          <Button onClick={onAddItem} size="sm">
            <Plus className="w-4 h-4 mr-1" /> {seg.addItem}
          </Button>
        </div>
      )}
    </div>
  );
}
