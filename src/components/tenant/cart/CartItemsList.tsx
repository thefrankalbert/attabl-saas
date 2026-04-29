'use client';

import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, Plus, Trash2, Utensils } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getTranslatedContent } from '@/lib/utils/translate';
import type { CurrencyCode } from '@/types/admin.types';

export interface CartListItem {
  id: string;
  name: string;
  name_en?: string;
  price: number;
  prices?: Record<string, number> | null;
  quantity: number;
  image_url?: string;
  selectedOption?: { name_fr: string; name_en?: string } | null;
  selectedVariant?: { name_fr: string; name_en?: string } | null;
  modifiers?: { name: string }[] | null;
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
  resolveAndFormatPrice: (
    amount: number,
    prices: Record<string, number> | null | undefined,
    currency: CurrencyCode,
  ) => string;
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
  resolveAndFormatPrice,
  updateQuantity,
  removeFromCart,
  labels,
}: CartItemsListProps) {
  return (
    <section className="bg-white">
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

          return (
            <motion.div
              key={itemKey}
              layout
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -100 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="relative flex bg-white border-b border-[#F0F0F0] last:border-b-0"
            >
              {/* TEXT - Left side */}
              <div className="flex-1 min-w-0 p-3 flex flex-col justify-between">
                <div>
                  <h3 className="text-[16px] font-semibold text-[#1A1A1A] leading-tight line-clamp-2">
                    {getTranslatedContent(language, item.name, item.name_en)}
                  </h3>
                  {(optionLabel || variantLabel) && (
                    <p className="mt-1 text-[13px] text-[#737373] line-clamp-2">
                      {[variantLabel, optionLabel].filter(Boolean).join(' - ')}
                    </p>
                  )}
                  <p className="mt-1.5 text-[15px] font-bold text-[#1A1A1A]">
                    {resolveAndFormatPrice(item.price * item.quantity, item.prices, currencyCode)}
                  </p>
                </div>
                <div className="mt-2">
                  <div className="inline-flex items-center h-10 rounded-xl border border-app-border bg-app-elevated overflow-hidden focus-within:ring-2 focus-within:ring-accent/30 focus-within:ring-offset-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      aria-label={labels.decrease}
                      onClick={() => updateQuantity(itemKey, item.quantity - 1)}
                      className="h-full w-10 rounded-none border-r border-app-border hover:bg-app-border/30 disabled:opacity-30 disabled:cursor-not-allowed shrink-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                    >
                      <Minus className="h-3.5 w-3.5 text-app-text-secondary" />
                    </Button>
                    <span className="w-10 text-center font-semibold text-sm text-app-text tabular-nums select-none">
                      {item.quantity}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      aria-label={labels.increase}
                      onClick={() => updateQuantity(itemKey, item.quantity + 1)}
                      className="h-full w-10 rounded-none border-l border-app-border hover:bg-app-border/30 disabled:opacity-30 disabled:cursor-not-allowed shrink-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                    >
                      <Plus className="h-3.5 w-3.5 text-app-text-secondary" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* IMAGE - Right side */}
              <div className="relative w-[90px] h-[90px] flex-shrink-0 m-3">
                <div className="w-full h-full rounded-xl overflow-hidden bg-[#F6F6F6] flex items-center justify-center">
                  {item.image_url &&
                  !item.image_url.includes('placeholder') &&
                  !item.image_url.includes('default') ? (
                    <Image
                      src={item.image_url}
                      alt={item.name}
                      width={90}
                      height={90}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Utensils className="w-6 h-6 text-[#B0B0B0]" />
                  )}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => removeFromCart(itemKey)}
                  className="absolute -bottom-2 -right-2 z-10 w-7 h-7 rounded-full bg-white border-[#EEEEEE] text-[#B0B0B0] hover:text-[#FF3008]"
                  aria-label={labels.remove}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </section>
  );
}
