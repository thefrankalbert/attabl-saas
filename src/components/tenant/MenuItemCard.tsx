'use client';

import { Plus, Minus, Leaf, Flame, Utensils } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { useState, useEffect, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Image from 'next/image';
import { cn } from '@/lib/utils';

import { MenuItem, ItemOption, ItemPriceVariant } from '@/types/admin.types';

interface MenuItemCardProps {
  item: MenuItem;
  restaurantId: string;
  priority?: boolean;
  category?: string;
  language?: 'fr' | 'en';
  currency?: string;
  onOpenDetail?: () => void;
}

// Simple price formatter - locale injected at call site
const formatPrice = (price: number, currency: string = 'XOF', locale: string = 'fr-FR') => {
  if (currency === 'XOF') {
    return `${price.toLocaleString(locale)} F`;
  }
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
  }).format(price);
};

// Simple translation helper
const getTranslatedContent = (language: string, fr: string, en?: string | null) => {
  return language === 'en' && en ? en : fr;
};

export default function MenuItemCard({
  item,
  restaurantId,
  priority = false,
  category = '',
  language = 'fr',
  currency = 'XOF',
  onOpenDetail,
}: MenuItemCardProps) {
  const { addToCart, updateQuantity, items } = useCart();
  const locale = useLocale();
  const tt = useTranslations('tenant');
  const [isAnimating, setIsAnimating] = useState(false);
  const [imageError, setImageError] = useState(false);

  // State for default selections (used for quick-add pricing)
  const [selectedOption, setSelectedOption] = useState<ItemOption | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ItemPriceVariant | null>(null);
  const [selectedModifiers] = useState<never[]>([]);

  // Initialize default selections
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (item.options?.length) {
      const defaultOption = item.options.find((o) => o.is_default) || item.options[0];
      setSelectedOption(defaultOption);
    }
    if (item.price_variants?.length) {
      const defaultVariant =
        item.price_variants.find((v) => v.is_default) || item.price_variants[0];
      setSelectedVariant(defaultVariant);
    }
  }, [item.options, item.price_variants]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Current price (with variant if applicable)
  const currentPrice = selectedVariant ? selectedVariant.price : item.price;

  // Unique cart key (includes option/variant)
  const getCartKey = useCallback(() => {
    let key = item.id;
    if (selectedOption) key += `-opt-${selectedOption.name_fr}`;
    if (selectedVariant) key += `-var-${selectedVariant.variant_name_fr}`;
    if (selectedModifiers.length > 0) {
      key += `-mod-${selectedModifiers
        .map((m: never) => (m as unknown as { id: string }).id)
        .sort()
        .join(',')}`;
    }
    return key;
  }, [item.id, selectedOption, selectedVariant, selectedModifiers]);

  // Find item in cart
  const cartItem = items.find((i) => {
    let itemKey = i.id;
    if (i.selectedOption) itemKey += `-opt-${i.selectedOption.name_fr}`;
    if (i.selectedVariant) itemKey += `-var-${i.selectedVariant.name_fr}`;
    return itemKey === getCartKey();
  });

  const handleAdd = useCallback(() => {
    if (item.is_available === false) return;

    setIsAnimating(true);

    const cartItemData = {
      id: item.id,
      name: item.name,
      name_en: item.name_en ?? undefined,
      price: currentPrice,
      image_url: item.image_url,
      quantity: 1,
      category_id: item.category_id,
      category_name: category,
      selectedOption: selectedOption
        ? {
            name_fr: selectedOption.name_fr,
            name_en: selectedOption.name_en,
          }
        : undefined,
      selectedVariant: selectedVariant
        ? {
            name_fr: selectedVariant.variant_name_fr,
            name_en: selectedVariant.variant_name_en,
            price: selectedVariant.price,
          }
        : undefined,
    };

    addToCart(cartItemData, restaurantId);
    setTimeout(() => setIsAnimating(false), 300);
  }, [item, currentPrice, category, selectedOption, selectedVariant, addToCart, restaurantId]);

  // Helper for translated variant name
  const getVariantName = (variant: ItemPriceVariant) => {
    return language === 'en' && variant.variant_name_en
      ? variant.variant_name_en
      : variant.variant_name_fr;
  };

  // Keep getVariantName referenced to avoid lint warning
  void getVariantName;

  const handleDecrement = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      updateQuantity(getCartKey(), cartItem ? cartItem.quantity - 1 : 0);
    },
    [updateQuantity, getCartKey, cartItem],
  );

  const handleIncrement = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      updateQuantity(getCartKey(), cartItem ? cartItem.quantity + 1 : 1);
    },
    [updateQuantity, getCartKey, cartItem],
  );

  const handleAddClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      handleAdd();
    },
    [handleAdd],
  );

  const isUnavailable = item.is_available === false;
  const hasValidImage =
    item.image_url &&
    !item.image_url.includes('placeholder') &&
    !item.image_url.includes('default') &&
    !imageError;

  return (
    <div
      onClick={onOpenDetail}
      className={cn(
        'relative bg-white rounded-2xl border shadow-sm transition-all active:scale-[0.98] cursor-pointer select-none',
        cartItem ? 'border-l-[3px] border-neutral-100' : 'border-neutral-100 hover:shadow-md',
        isUnavailable && 'opacity-50 pointer-events-none',
        isAnimating && 'scale-[0.97]',
      )}
      style={cartItem ? { borderLeftColor: 'var(--tenant-primary)' } : undefined}
    >
      <div className="flex items-start gap-3 p-3">
        {/* Image - LEFT (96×96) */}
        <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 bg-neutral-100">
          {hasValidImage ? (
            <Image
              src={item.image_url!}
              alt={item.name}
              fill
              sizes="96px"
              className="object-cover !relative"
              onError={() => setImageError(true)}
              priority={priority}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Utensils className="w-6 h-6 text-neutral-300" />
            </div>
          )}
        </div>

        {/* Content - RIGHT */}
        <div className="flex-1 min-w-0 flex flex-col justify-between h-24">
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="font-semibold text-sm text-neutral-900 line-clamp-1">
                {getTranslatedContent(language, item.name, item.name_en)}
              </h3>
              {item.is_vegetarian && <Leaf className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
              {item.is_spicy && <Flame className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
            </div>
            <p className="text-xs text-neutral-500 line-clamp-2 mt-0.5">
              {getTranslatedContent(language, item.description || '', item.description_en)}
            </p>
          </div>

          <div className="flex items-center justify-between mt-auto">
            <span className="font-bold text-sm" style={{ color: 'var(--tenant-primary)' }}>
              {currentPrice > 0 ? formatPrice(currentPrice, currency, locale) : tt('included')}
            </span>

            {/* Add / Quantity controls */}
            <div onClick={(e) => e.stopPropagation()}>
              {cartItem ? (
                <div
                  className="flex items-center gap-2 rounded-full px-1 py-0.5"
                  style={{ backgroundColor: 'var(--tenant-primary-10)' }}
                >
                  <button
                    onClick={handleDecrement}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white"
                    style={{ backgroundColor: 'var(--tenant-primary)' }}
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-sm font-bold min-w-[20px] text-center">
                    {cartItem.quantity}
                  </span>
                  <button
                    onClick={handleIncrement}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white"
                    style={{ backgroundColor: 'var(--tenant-primary)' }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleAddClick}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white transition-transform active:scale-90"
                  style={{ backgroundColor: 'var(--tenant-primary)' }}
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Unavailable overlay */}
      {isUnavailable && (
        <div className="absolute inset-0 bg-white/60 rounded-2xl flex items-center justify-center">
          <span className="text-xs font-semibold text-red-500 bg-red-50 px-2.5 py-1 rounded-full">
            {tt('unavailable')}
          </span>
        </div>
      )}
    </div>
  );
}
