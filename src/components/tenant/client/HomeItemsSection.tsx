'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { MenuItem } from '@/types/admin.types';
import { MenuItemCard, type ClientMenuItem } from './MenuItemCard';
import { CardAddControl } from './CardAddControl';
import ItemDetailSheet from '@/components/tenant/ItemDetailSheet';

interface Props {
  /** Display data (one per card), parallel to `full`. */
  display: ClientMenuItem[];
  /** Full menu items (same order/length as `display`) used for cart + detail. */
  full: MenuItem[];
  variant: 'featured' | 'list';
  containerClassName: string;
  restaurantId: string;
  currency?: string;
  currencyCode?: string;
}

// Wraps the home item cards with cart + detail-sheet behaviour, matching the
// menu screen: the "+" adds a simple item directly (or opens the detail sheet
// when the item has options/variants/modifiers), and tapping the card opens
// the detail sheet - instead of navigating away to the menu.
export function HomeItemsSection({
  display,
  full,
  variant,
  containerClassName,
  restaurantId,
  currency,
  currencyCode,
}: Props) {
  const t = useTranslations('tenant');
  const [selected, setSelected] = useState<MenuItem | null>(null);

  return (
    <>
      <div className={containerClassName}>
        {display.map((d, i) => {
          const it = full[i];
          if (!it) return null;
          return (
            <MenuItemCard
              key={d.id}
              item={d}
              variant={variant}
              currencyCode={currencyCode}
              onOpen={() => setSelected(it)}
              addControl={
                <CardAddControl
                  item={it}
                  restaurantId={restaurantId}
                  onOpen={() => setSelected(it)}
                  placement={variant === 'featured' ? 'photo' : 'corner'}
                  addLabel={t('ariaAddUpsell', { name: d.name })}
                />
              }
            />
          );
        })}
      </div>
      <ItemDetailSheet
        item={selected}
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        restaurantId={restaurantId}
        currency={currency}
      />
    </>
  );
}
