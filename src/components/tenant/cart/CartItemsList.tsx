'use client';

import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, Plus, Utensils } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getTranslatedContent } from '@/lib/utils/translate';
import { MAX_ITEM_QTY } from '@/lib/utils/cart-display';
import type { CurrencyCode } from '@/types/admin.types';

interface CartListItem {
  id: string;
  name: string;
  name_en?: string;
  price: number;
  quantity: number;
  image_url?: string;
  selectedOption?: { name_fr: string; name_en?: string } | null;
  selectedVariant?: { name_fr: string; name_en?: string } | null;
  modifiers?: { name: string; price?: number }[] | null;
}

export function getCartItemKey(item: {
  id: string;
  selectedOption?: { name_fr: string } | null;
  selectedVariant?: { name_fr: string } | null;
  modifiers?: { name: string }[] | null;
}): string {
  let key = item.id;
  if (item.selectedOption) key += `-opt-${item.selectedOption.name_fr}`;
  if (item.selectedVariant) key += `-var-${item.selectedVariant.name_fr}`;
  if (item.modifiers && item.modifiers.length > 0) {
    const modKey = item.modifiers
      .map((m) => m.name)
      .sort()
      .join(',');
    key += `-mod-${modKey}`;
  }
  return key;
}

interface CartItemsListProps {
  items: CartListItem[];
  language: 'fr' | 'en';
  currencyCode: CurrencyCode;
  // Line totals are converted from the native amount so they stay consistent
  // with the OrderSummary subtotal. Per-currency manual prices are unit-level
  // (used on menu cards), so they cannot represent a (base + modifiers) x qty
  // line and are intentionally not applied here.
  formatDisplayPrice: (amount: number, currency: CurrencyCode) => string;
  updateQuantity: (itemKey: string, quantity: number) => void;
  removeFromCart: (itemKey: string) => void;
  labels: {
    decrease: string;
    increase: string;
    remove: string;
  };
}

export function CartItemsList({
  items,
  language,
  currencyCode,
  formatDisplayPrice,
  updateQuantity,
  removeFromCart,
  labels,
}: CartItemsListProps) {
  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--color-divider)] bg-white px-4 py-1">
      <AnimatePresence mode="popLayout">
        {items.map((item) => {
          const itemKey = getCartItemKey(item);
          const optionLabel = item.selectedOption
            ? language === 'en' && item.selectedOption.name_en
              ? item.selectedOption.name_en
              : item.selectedOption.name_fr
            : null;
          const variantLabel = item.selectedVariant
            ? language === 'en' && item.selectedVariant.name_en
              ? item.selectedVariant.name_en
              : item.selectedVariant.name_fr
            : null;
          // Market standard (Uber Eats / Deliveroo / Jumia Food): the line price is
          // the full line total = (base + paid modifiers) x quantity, and the chosen
          // modifiers are listed under the item name.
          const modifiersTotal = (item.modifiers || []).reduce((s, m) => s + (m.price ?? 0), 0);
          const modifierLabels = (item.modifiers || []).map((m) => m.name);
          const subParts = [variantLabel, optionLabel, ...modifierLabels].filter(Boolean);
          const hasValidImage =
            item.image_url &&
            !item.image_url.includes('placeholder') &&
            !item.image_url.includes('default');

          return (
            <motion.div
              key={itemKey}
              layout
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -100 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="flex items-center gap-3 border-b border-[var(--color-divider)] py-[13px] last:border-b-0"
            >
              {/* IMAGE - left */}
              <div className="relative h-[58px] w-[58px] shrink-0 overflow-hidden rounded-[var(--radius-search)] border border-[var(--color-divider)] bg-[var(--color-surface-alt)]">
                {hasValidImage ? (
                  <Image
                    src={item.image_url!}
                    alt={item.name}
                    fill
                    sizes="58px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Utensils className="h-5 w-5 text-[var(--color-ink-soft)]" />
                  </div>
                )}
              </div>

              {/* TEXT */}
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-[13.5px] font-semibold leading-[1.3] tracking-[-0.2px] text-[var(--color-ink)]">
                  {getTranslatedContent(language, item.name, item.name_en)}
                </div>
                {subParts.length > 0 && (
                  <div className="mt-0.5 text-[11.5px] leading-[1.35] text-[var(--color-ink-muted)]">
                    {subParts.join(' - ')}
                  </div>
                )}
                <div className="mt-1.5 text-[13px] font-bold tabular-nums text-[var(--color-ink)]">
                  {formatDisplayPrice((item.price + modifiersTotal) * item.quantity, currencyCode)}
                </div>
              </div>

              {/* QTY STEPPER (sm) */}
              <div className="flex shrink-0 items-center rounded-full border border-[var(--color-divider)] bg-[var(--color-surface-alt)] p-[3px]">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    item.quantity <= 1
                      ? removeFromCart(itemKey)
                      : updateQuantity(itemKey, item.quantity - 1)
                  }
                  aria-label={item.quantity <= 1 ? labels.remove : labels.decrease}
                  className="h-[26px] w-[26px] rounded-full bg-white p-0 shadow-[0_1px_2px_0_rgba(26,26,26,0.04)] hover:bg-white"
                >
                  <Minus className="h-3 w-3 text-[var(--color-ink)]" strokeWidth={2.4} />
                </Button>
                <span className="min-w-[24px] text-center text-[13px] font-semibold tabular-nums text-[var(--color-ink)]">
                  {item.quantity}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    item.quantity < MAX_ITEM_QTY && updateQuantity(itemKey, item.quantity + 1)
                  }
                  disabled={item.quantity >= MAX_ITEM_QTY}
                  aria-label={labels.increase}
                  className="h-[26px] w-[26px] rounded-full bg-[var(--color-ink)] p-0 hover:bg-[var(--color-ink)] disabled:opacity-40"
                >
                  <Plus className="h-3 w-3 text-white" strokeWidth={2.4} />
                </Button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </section>
  );
}
