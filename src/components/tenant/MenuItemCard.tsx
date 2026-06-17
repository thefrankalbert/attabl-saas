'use client';

import { Utensils, Martini, Star } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { cn } from '@/lib/utils';

import { MenuItem, ItemPriceVariant } from '@/types/admin.types';
import { useDisplayCurrency } from '@/contexts/CurrencyContext';
import { getTranslatedContent } from '@/lib/utils/translate';
import { CardAddControl } from '@/components/tenant/client/CardAddControl';

interface MenuItemCardProps {
  item: MenuItem;
  restaurantId: string;
  priority?: boolean;
  category?: string;
  language?: 'fr' | 'en';
  currency?: string;
  onOpenDetail?: () => void;
}

// ClientBadge kinds mapped to maquette Badge colors (app-ui Badge, contrat 6.1)
const BADGE_CLS: Record<'popular' | 'new' | 'veg' | 'spicy', string> = {
  popular: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-fg)]',
  new: 'bg-[var(--color-accent-muted)] text-[var(--color-accent)]',
  veg: 'bg-[var(--color-brand-light)] text-[var(--color-brand-dark)]',
  spicy: 'bg-[#fff0ee] text-[var(--color-promo)]',
};

function ItemBadge({ kind, label }: { kind: keyof typeof BADGE_CLS; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[var(--radius-tag)] px-2 py-[3px] text-[10.5px] font-semibold leading-[1.25] tracking-[0.1px]',
        BADGE_CLS[kind],
      )}
    >
      {label}
    </span>
  );
}

export default function MenuItemCard({
  item,
  restaurantId,
  priority = false,
  category = '',
  language = 'fr',
  currency = 'XOF',
  onOpenDetail,
}: MenuItemCardProps) {
  const tt = useTranslations('tenant');
  const { resolveAndFormatPrice } = useDisplayCurrency();
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Default variant (used for the displayed price)
  const [selectedVariant, setSelectedVariant] = useState<ItemPriceVariant | null>(null);

  // Detect drink category for icon fallback
  const isDrinkCategory =
    /boisson|cocktail|vin|bière|beer|soda|jus|spirit|drink|beverage|wine|eau|water|soft|alcool|apéritif|champagne/i.test(
      category,
    );

  // Initialize the default price variant
  /* eslint-disable react-hooks/set-state-in-effect -- intentional: sets variant default from item props on mount; useEffect avoids stale closure vs useState initializer (2026-05-04) */
  useEffect(() => {
    if (item.price_variants?.length) {
      const defaultVariant =
        item.price_variants.find((v) => v.is_default) || item.price_variants[0];
      setSelectedVariant(defaultVariant);
    }
  }, [item.price_variants]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const currentPrice = selectedVariant ? selectedVariant.price : item.price;

  const isUnavailable = item.is_available === false;
  const hasValidImage =
    item.image_url &&
    !item.image_url.includes('placeholder') &&
    !item.image_url.includes('default') &&
    !imageError;

  // Compute "new" flag: created within the last 14 days.
  const [isNew, setIsNew] = useState(false);
  /* eslint-disable react-hooks/set-state-in-effect -- intentional: Date.now() is impure and must run client-side to avoid hydration mismatch; cannot use useState initializer (2026-05-04) */
  useEffect(() => {
    if (!item.created_at) return;
    const created = new Date(item.created_at).getTime();
    if (Number.isNaN(created)) return;
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    setIsNew(Date.now() - created < fourteenDaysMs);
  }, [item.created_at]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const description = getTranslatedContent(language, item.description || '', item.description_en);
  const formattedPrice =
    currentPrice > 0
      ? resolveAndFormatPrice(currentPrice, selectedVariant?.prices || item.prices, currency)
      : tt('included');
  const hasBadge = item.is_featured || isNew || item.is_vegetarian || item.is_spicy;

  return (
    <div
      className="relative flex cursor-pointer items-stretch gap-3.5 border-b border-[var(--color-divider)] py-[15px] last:border-b-0"
      aria-disabled={isUnavailable || undefined}
      onClick={onOpenDetail}
    >
      {/* TEXT - left */}
      <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
        {hasBadge && (
          <div className="flex flex-wrap items-center gap-[5px]">
            {item.is_featured && <ItemBadge kind="popular" label={tt('popularBadge')} />}
            {isNew && <ItemBadge kind="new" label={tt('newBadge')} />}
            {item.is_vegetarian && <ItemBadge kind="veg" label={tt('veggieBadge')} />}
            {item.is_spicy && <ItemBadge kind="spicy" label={tt('spicyBadge')} />}
          </div>
        )}

        <h3 className="line-clamp-1 text-[15.5px] font-semibold leading-[1.3] tracking-[-0.3px] text-[var(--color-ink)]">
          {getTranslatedContent(language, item.name, item.name_en)}
        </h3>

        {description && (
          <p className="line-clamp-1 text-[12.5px] leading-[1.4] text-[var(--color-ink-muted)]">
            {description}
          </p>
        )}

        <div className="mt-auto flex items-center gap-2.5 pt-1">
          <span className="text-[14.5px] font-bold tabular-nums leading-none text-[var(--color-ink)]">
            {formattedPrice}
          </span>
          {item.rating != null && item.rating > 0 && (
            <span className="inline-flex items-center gap-[3px] text-[12px] font-medium text-[var(--color-ink-muted)]">
              <Star
                className="text-[var(--color-rating)]"
                style={{ width: 11, height: 11 }}
                fill="currentColor"
                strokeWidth={0}
              />
              {item.rating.toFixed(1)}
            </span>
          )}
        </div>
      </div>

      {/* IMAGE - right, 104x104 + "+" corner */}
      <div className="relative shrink-0">
        <div className="relative h-[104px] w-[104px] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-divider)] bg-[var(--color-surface-alt)]">
          {hasValidImage ? (
            <>
              {!imageLoaded && (
                <div className="absolute inset-0 animate-pulse bg-[var(--color-surface-alt)]" />
              )}
              <Image
                src={item.image_url!}
                alt={item.name}
                fill
                sizes="104px"
                className={cn(
                  'object-cover transition-opacity duration-200',
                  imageLoaded ? 'opacity-100' : 'opacity-0',
                )}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
                priority={priority}
              />
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              {isDrinkCategory ? (
                <Martini className="h-8 w-8 text-[var(--color-ink-soft)]" />
              ) : (
                <Utensils className="h-8 w-8 text-[var(--color-ink-soft)]" />
              )}
            </div>
          )}
        </div>

        {!isUnavailable && (
          <CardAddControl
            item={item}
            restaurantId={restaurantId}
            onOpen={() => onOpenDetail?.()}
            placement="corner"
            addLabel={tt('addShort')}
          />
        )}
      </div>

      {/* Unavailable overlay */}
      {isUnavailable && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
          <span className="text-xs font-semibold uppercase tracking-wide text-white">
            {tt('unavailable')}
          </span>
        </div>
      )}
    </div>
  );
}
