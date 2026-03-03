'use client';

import { Plus, Minus, Leaf, Flame, Utensils, Martini, ChevronDown } from 'lucide-react';
import { useCartActions, useCartData } from '@/contexts/CartContext';
import { useState, useEffect, useCallback, useRef } from 'react';
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

const formatPrice = (price: number, currency: string = 'XOF', locale: string = 'fr-FR') => {
  if (currency === 'XOF' || currency === 'XAF') {
    return `${price.toLocaleString(locale)} F`;
  }
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
  }).format(price);
};

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
  const { addToCart, updateQuantity } = useCartActions();
  const { items } = useCartData();
  const locale = useLocale();
  const tt = useTranslations('tenant');
  const [isAnimating, setIsAnimating] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Variant dropdown
  const [selectedOption, setSelectedOption] = useState<ItemOption | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ItemPriceVariant | null>(null);
  const [showVariantDropdown, setShowVariantDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Detect drink category for icon fallback
  const isDrinkCategory =
    /boisson|cocktail|vin|bière|beer|soda|jus|spirit|drink|beverage|wine|eau|water|soft|alcool|apéritif|champagne/i.test(
      category,
    );

  // Initialize defaults
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

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowVariantDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentPrice = selectedVariant ? selectedVariant.price : item.price;

  const getCartKey = useCallback(() => {
    let key = item.id;
    if (selectedOption) key += `-opt-${selectedOption.name_fr}`;
    if (selectedVariant) key += `-var-${selectedVariant.variant_name_fr}`;
    return key;
  }, [item.id, selectedOption, selectedVariant]);

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
        ? { name_fr: selectedOption.name_fr, name_en: selectedOption.name_en }
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

  const getVariantName = (variant: ItemPriceVariant) => {
    return language === 'en' && variant.variant_name_en
      ? variant.variant_name_en
      : variant.variant_name_fr;
  };

  const isUnavailable = item.is_available === false;
  const hasVariants = item.price_variants && item.price_variants.length > 0;
  const hasValidImage =
    item.image_url &&
    !item.image_url.includes('placeholder') &&
    !item.image_url.includes('default') &&
    !imageError;

  return (
    <div
      onClick={onOpenDetail}
      className={cn(
        'group py-4 px-4 flex items-start gap-4 relative transition-all duration-150 active:scale-[0.99] select-none cursor-pointer hover:bg-neutral-50/30',
        isUnavailable && 'opacity-50',
        isAnimating && 'scale-[0.97]',
      )}
    >
      {/* TEXT CONTENT — Left */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-1.5 mb-1">
          <h3 className="text-[15px] font-semibold text-neutral-900 leading-tight line-clamp-2">
            {getTranslatedContent(language, item.name, item.name_en)}
          </h3>
          <div className="flex gap-1 flex-shrink-0 mt-0.5">
            {item.is_vegetarian && <Leaf className="w-3 h-3 text-green-500" />}
            {item.is_spicy && <Flame className="w-3 h-3 text-red-500" />}
          </div>
        </div>

        <p className="text-[13px] text-neutral-500 leading-snug line-clamp-2 mb-2">
          {getTranslatedContent(language, item.description || '', item.description_en)}
        </p>

        <div className="flex items-center gap-2 mt-auto">
          <span className="text-base font-bold" style={{ color: 'var(--tenant-primary)' }}>
            {currentPrice > 0 ? formatPrice(currentPrice, currency, locale) : tt('included')}
          </span>
        </div>

        {/* Variant dropdown */}
        {hasVariants && (
          <div className="mt-2 relative" ref={dropdownRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowVariantDropdown(!showVariantDropdown);
              }}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors"
              style={{
                color: 'var(--tenant-primary)',
                backgroundColor: 'var(--tenant-primary-10)',
              }}
            >
              {getVariantName(selectedVariant!)}
              <ChevronDown
                className={cn('w-3 h-3 transition-transform', showVariantDropdown && 'rotate-180')}
              />
            </button>
            {showVariantDropdown && (
              <div className="absolute top-full left-0 mt-1 bg-white rounded-lg border border-neutral-200 py-1 z-20 shadow-lg min-w-[140px]">
                {item.price_variants?.map((variant) => (
                  <button
                    key={variant.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedVariant(variant);
                      setShowVariantDropdown(false);
                    }}
                    className={cn(
                      'w-full px-3 py-2 text-left text-xs hover:bg-neutral-50',
                      selectedVariant?.id === variant.id ? 'font-bold' : 'text-neutral-700',
                    )}
                    style={
                      selectedVariant?.id === variant.id
                        ? {
                            color: 'var(--tenant-primary)',
                            backgroundColor: 'var(--tenant-primary-10)',
                          }
                        : undefined
                    }
                  >
                    {getVariantName(variant)} — {formatPrice(variant.price, currency, locale)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* IMAGE SECTION — Right (with floating +/- on corner) */}
      <div className="relative flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24">
        <div className="w-full h-full rounded-lg overflow-hidden bg-neutral-50 border border-neutral-100 flex items-center justify-center">
          {hasValidImage ? (
            <Image
              src={item.image_url!}
              alt={item.name}
              fill
              sizes="(max-width: 640px) 80px, 96px"
              className="object-cover !relative"
              onError={() => setImageError(true)}
              priority={priority}
            />
          ) : isDrinkCategory ? (
            <Martini className="w-6 h-6 text-neutral-300" />
          ) : (
            <Utensils className="w-6 h-6 text-neutral-300" />
          )}
        </div>

        {/* Floating add/counter on bottom-right of image */}
        <div className="absolute -bottom-1 -right-1" onClick={(e) => e.stopPropagation()}>
          {cartItem ? (
            <div className="flex items-center bg-white rounded-full shadow-md border border-neutral-200 p-0.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateQuantity(getCartKey(), cartItem.quantity - 1);
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-neutral-50 active:scale-90 transition-all"
                style={{ color: 'var(--tenant-primary)' }}
              >
                <Minus className="w-4 h-4" strokeWidth={2.5} />
              </button>
              <span className="text-[13px] font-bold text-neutral-900 w-6 text-center">
                {cartItem.quantity}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateQuantity(getCartKey(), cartItem.quantity + 1);
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-neutral-50 active:scale-90 transition-all"
                style={{ color: 'var(--tenant-primary)' }}
              >
                <Plus className="w-4 h-4" strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAdd();
              }}
              disabled={isUnavailable}
              className={cn(
                'w-10 h-10 rounded-full bg-white border-2 border-neutral-100 flex items-center justify-center shadow-md active:scale-90 transition-all',
                isAnimating && 'scale-110',
              )}
              style={{ color: 'var(--tenant-primary)' }}
            >
              <Plus className="w-5 h-5" strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      {/* Unavailable overlay */}
      {isUnavailable && (
        <div className="absolute inset-0 bg-white/40 flex items-center justify-center pointer-events-none">
          <span className="bg-neutral-900/80 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded">
            {tt('unavailable')}
          </span>
        </div>
      )}
    </div>
  );
}
