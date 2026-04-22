'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, Check, Image as ImageIcon, Star, X } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/currency';
import type { CurrencyCode, MenuItem } from '@/types/admin.types';

interface ItemDetailPanelProps {
  item: MenuItem;
  currency: CurrencyCode;
  onClose: () => void;
  onEdit: (item: MenuItem) => void;
}

export function ItemDetailPanel({ item, currency, onClose, onEdit }: ItemDetailPanelProps) {
  const t = useTranslations('items');
  const tc = useTranslations('common');
  const ta = useTranslations('allergens');

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      {/* Panel */}
      <div
        className={cn(
          'fixed right-0 top-0 h-full w-full sm:w-96 z-50 bg-app-card border-l border-app-border rounded-l-xl overflow-y-auto',
          'transition-transform duration-300 ease-out translate-x-0',
        )}
      >
        {/* Panel Header */}
        <div className="flex items-center justify-between p-5 border-b border-app-border">
          <h2 className="text-base font-bold text-app-text">{t('details')}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={tc('aria.close')}>
            <X className="w-4 h-4 text-app-text-secondary" />
          </Button>
        </div>

        {/* Panel Content */}
        <div className="p-5 space-y-5">
          {/* Image */}
          {item.image_url ? (
            <div className="relative w-full h-48">
              <Image
                src={item.image_url}
                alt={item.name}
                fill
                sizes="(max-width: 640px) 100vw, 400px"
                className="rounded-xl object-cover border border-app-border"
              />
            </div>
          ) : (
            <div className="w-full h-48 rounded-xl bg-app-bg border border-app-border flex items-center justify-center">
              <ImageIcon className="w-12 h-12 text-app-text-muted" />
            </div>
          )}

          {/* Name */}
          <div className="space-y-1">
            <p className="text-xs text-app-text-muted font-medium">{t('nameFr')}</p>
            <p className="text-sm font-semibold text-app-text">{item.name}</p>
          </div>

          {/* Name EN */}
          <div className="space-y-1">
            <p className="text-xs text-app-text-muted font-medium">{t('nameEn')}</p>
            <p className="text-sm text-app-text">{item.name_en || '-'}</p>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <p className="text-xs text-app-text-muted font-medium">{t('descriptionFr')}</p>
            <p className="text-sm text-app-text">{item.description || t('noDescription')}</p>
          </div>

          {/* Price */}
          <div className="space-y-1">
            <p className="text-xs text-app-text-muted font-medium">{t('price')}</p>
            <p className="text-lg font-bold text-app-text tabular-nums">
              {formatCurrency(item.price, currency)}
            </p>
            {item.prices && Object.keys(item.prices).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1">
                {Object.entries(item.prices as Record<string, number>).map(([cur, val]) => (
                  <span
                    key={cur}
                    className="text-xs text-app-text-secondary bg-app-elevated px-2 py-0.5 rounded"
                  >
                    {formatCurrency(val, cur as CurrencyCode)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Category */}
          <div className="space-y-1">
            <p className="text-xs text-app-text-muted font-medium">{t('category')}</p>
            <p className="text-sm text-app-text">{item.category?.name || t('uncategorized')}</p>
          </div>

          {/* Allergens */}
          {item.allergens && item.allergens.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-app-text-muted font-medium flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {ta('title')}
              </p>
              <div className="flex flex-wrap gap-1">
                {item.allergens.map((a) => (
                  <span
                    key={a}
                    className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-500/10 text-orange-500 border border-orange-500/20"
                  >
                    {ta(a)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Calories */}
          {item.calories != null && (
            <div className="space-y-1">
              <p className="text-xs text-app-text-muted font-medium">{ta('calories')}</p>
              <p className="text-sm text-app-text">{item.calories} kcal</p>
            </div>
          )}

          {/* Availability & Featured badges */}
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-semibold border',
                item.is_available
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                  : 'bg-app-bg text-app-text-secondary border-app-border',
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
            </span>
            {item.is_featured && (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20 inline-flex items-center gap-1">
                <Star className="w-3 h-3 fill-current" />
                {t('featured')}
              </span>
            )}
          </div>

          {/* Edit Button */}
          <Button
            variant="default"
            className="w-full mt-2"
            onClick={() => {
              onEdit(item);
              onClose();
            }}
          >
            {t('edit')}
          </Button>
        </div>
      </div>
    </>
  );
}
