'use client';

import { Plus, Minus, Tag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useCartData, useCartActions } from '@/contexts/CartContext';
import { getCartItemKey } from '@/components/tenant/cart/CartItemsList';
import { MAX_ITEM_QTY } from '@/lib/utils/cart-display';
import type { MenuItem } from '@/types/admin.types';

const PLUS_SHADOW =
  'shadow-[0_4px_6px_-1px_rgba(26,26,26,0.06),0_2px_4px_-2px_rgba(26,26,26,0.04)]';

// The card "+" affordance, matching the maquette (AddControl):
// - item with options/variants/modifiers -> "+" opens the detail sheet.
// - simple item -> "+" adds directly, then morphs into an inline quantity
//   stepper pill anchored at the photo corner (grows toward the image, the
//   little tag/label the maquette shows). At qty 1 the minus becomes a remove.
export function CardAddControl({
  item,
  restaurantId,
  onOpen,
  placement,
  addLabel,
}: {
  item: MenuItem;
  restaurantId: string;
  onOpen: () => void;
  placement: 'photo' | 'corner';
  addLabel?: string;
}) {
  const t = useTranslations('tenant');
  const { items } = useCartData();
  const { addToCart, updateQuantity, removeFromCart } = useCartActions();

  const isSimple = !(item.options?.length || item.price_variants?.length || item.modifiers?.length);
  // A simple item has no options/variants/modifiers, so its cart key is its id.
  const qty = isSimple ? (items.find((l) => getCartItemKey(l) === item.id)?.quantity ?? 0) : 0;

  const pos = placement === 'photo' ? 'bottom-2 right-2' : '-bottom-1.5 -right-1.5';

  if (isSimple && qty > 0) {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute ${pos} flex items-center rounded-full bg-white p-[3px] ${PLUS_SHADOW}`}
      >
        <Button
          type="button"
          variant="ghost"
          aria-label={t('ariaDecrease')}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (qty === 1) removeFromCart(item.id);
            else updateQuantity(item.id, qty - 1);
          }}
          className="h-[26px] w-[26px] rounded-full bg-[var(--color-surface-alt)] p-0 hover:bg-[var(--color-surface-alt)]"
        >
          {qty === 1 ? (
            <Tag className="h-[13px] w-[13px] text-[var(--color-promo)]" strokeWidth={2.4} />
          ) : (
            <Minus className="h-[13px] w-[13px] text-[var(--color-ink)]" strokeWidth={2.4} />
          )}
        </Button>
        <span className="min-w-[22px] text-center text-[13.5px] font-bold tabular-nums text-[var(--color-ink)]">
          {qty}
        </span>
        <Button
          type="button"
          variant="ghost"
          aria-label={t('ariaIncrease')}
          disabled={qty >= MAX_ITEM_QTY}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (qty < MAX_ITEM_QTY) updateQuantity(item.id, qty + 1);
          }}
          className="h-[26px] w-[26px] rounded-full bg-[var(--color-ink)] p-0 hover:bg-[var(--color-ink)] disabled:opacity-40"
        >
          <Plus className="h-[13px] w-[13px] text-white" strokeWidth={2.6} />
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      aria-label={addLabel}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isSimple) {
          addToCart(
            {
              id: item.id,
              name: item.name,
              price: item.price,
              prices: item.prices,
              image_url: item.image_url,
              quantity: 1,
            },
            restaurantId,
            true,
          );
        } else {
          onOpen();
        }
      }}
      className={`absolute ${pos} flex h-[34px] w-[34px] items-center justify-center rounded-full bg-white p-0 hover:bg-white ${PLUS_SHADOW}`}
    >
      <Plus className="h-[18px] w-[18px] text-[var(--color-ink)]" strokeWidth={2.6} />
    </Button>
  );
}
