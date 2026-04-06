'use client';

import { toast } from 'sonner';
import { Plus, Leaf, Flame, Utensils, Martini, ChevronDown, AlertTriangle } from 'lucide-react';
import { useCartActions, useCartData } from '@/contexts/CartContext';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { cn } from '@/lib/utils';

import { MenuItem, ItemOption, ItemPriceVariant } from '@/types/admin.types';
import { useDisplayCurrency } from '@/contexts/CurrencyContext';

interface MenuItemCardProps {
  item: MenuItem;
  restaurantId: string;
  priority?: boolean;
  category?: string;
  language?: 'fr' | 'en';
  currency?: string;
  onOpenDetail?: () => void;
}

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
  const { addToCart } = useCartActions();
  const { items } = useCartData();
  const tt = useTranslations('tenant');
  const { resolveAndFormatPrice } = useDisplayCurrency();
  const [, setIsAnimating] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

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
    if (isAdding) return;

    setIsAdding(true);
    setIsAnimating(true);

    const cartItemData = {
      id: item.id,
      name: item.name,
      name_en: item.name_en ?? undefined,
      price: currentPrice,
      prices: item.prices,
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
            prices: selectedVariant.prices,
          }
        : undefined,
    };

    addToCart(cartItemData, restaurantId);

    // Haptic feedback for mobile devices
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }

    toast.success(`${item.name} ajoute au panier`);
    setTimeout(() => {
      setIsAnimating(false);
      setIsAdding(false);
    }, 300);
  }, [
    item,
    currentPrice,
    category,
    selectedOption,
    selectedVariant,
    addToCart,
    restaurantId,
    isAdding,
  ]);

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

  const description = getTranslatedContent(language, item.description || '', item.description_en);
  const formattedPrice =
    currentPrice > 0
      ? resolveAndFormatPrice(currentPrice, selectedVariant?.prices || item.prices, currency)
      : tt('included');
  const hasModifiersOrVariants =
    (item.modifiers && item.modifiers.length > 0) ||
    (item.price_variants && item.price_variants.length > 0);

  return (
    <div
      className={`relative flex gap-4 py-4 px-4 cursor-pointer active:bg-app-elevated/50 transition-colors border-b border-app-border/30 ${isUnavailable ? 'opacity-50' : ''}`}
      onClick={onOpenDetail}
    >
      {/* TEXT — Left */}
      <div className="flex-1 min-w-0">
        <h3 className="text-base font-semibold text-app-text leading-snug">
          {getTranslatedContent(language, item.name, item.name_en)}
        </h3>

        {description && (
          <p className="text-sm text-app-text-secondary leading-relaxed mt-1 line-clamp-3">
            {description}
          </p>
        )}

        <div className="flex items-center flex-wrap gap-2 mt-2">
          <span className="text-base font-bold" style={{ color: 'var(--tenant-primary)' }}>
            {formattedPrice}
          </span>

          {item.is_vegetarian && (
            <span className="inline-flex items-center gap-0.5 text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700">
              <Leaf className="w-3 h-3" />
            </span>
          )}
          {item.is_spicy && (
            <span className="inline-flex items-center gap-0.5 text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-600">
              <Flame className="w-3 h-3" />
            </span>
          )}
          {item.allergens && item.allergens.length > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600"
              title={item.allergens.join(', ')}
            >
              <AlertTriangle className="w-3 h-3" />
            </span>
          )}
        </div>

        {hasModifiersOrVariants && (
          <span className="text-[11px] text-app-text-muted mt-1 block">Personnalisable</span>
        )}

        {/* Variant dropdown */}
        {hasVariants && (
          <div className="mt-2 relative" ref={dropdownRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowVariantDropdown(!showVariantDropdown);
              }}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors"
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
              <div className="absolute top-full left-0 mt-1 bg-app-card rounded-xl shadow-xl border border-app-border/30 py-1 z-20 min-w-[160px]">
                {item.price_variants?.map((variant) => (
                  <button
                    key={variant.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedVariant(variant);
                      setShowVariantDropdown(false);
                    }}
                    className={cn(
                      'w-full px-3 py-2.5 text-left text-sm hover:bg-app-elevated',
                      selectedVariant?.id === variant.id ? 'font-bold' : 'text-app-text-secondary',
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
                    {getVariantName(variant)} -{' '}
                    {resolveAndFormatPrice(variant.price, variant.prices, currency)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* IMAGE — Right */}
      <div className="relative w-24 h-24 sm:w-[120px] sm:h-[120px] flex-shrink-0">
        <div className="w-full h-full rounded-xl overflow-hidden bg-app-elevated border border-app-border/50 flex items-center justify-center">
          {hasValidImage ? (
            <>
              {!imageLoaded && (
                <div className="absolute inset-0 animate-pulse bg-app-elevated rounded-xl" />
              )}
              <Image
                src={item.image_url!}
                alt={item.name}
                fill
                sizes="120px"
                className={cn(
                  'object-cover transition-opacity duration-300',
                  imageLoaded ? 'opacity-100' : 'opacity-0',
                )}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
                priority={priority}
              />
            </>
          ) : isDrinkCategory ? (
            <Martini className="w-8 h-8 text-app-text-muted" />
          ) : (
            <Utensils className="w-8 h-8 text-app-text-muted" />
          )}
        </div>

        {/* Add button or quantity badge */}
        <div className="absolute bottom-1.5 right-1.5" onClick={(e) => e.stopPropagation()}>
          {cartItem ? (
            <div
              className="min-w-7 h-7 rounded-full bg-white shadow-md flex items-center justify-center text-sm font-bold"
              style={{ color: 'var(--tenant-primary)' }}
            >
              {cartItem.quantity}
            </div>
          ) : !isUnavailable ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAdd();
              }}
              disabled={isAdding}
              aria-label="Ajouter au panier"
              className="w-8 h-8 rounded-full bg-white shadow-md flex items-center justify-center focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-90 transition-transform"
            >
              <Plus className="w-4 h-4" style={{ color: 'var(--tenant-primary)' }} />
            </button>
          ) : null}
        </div>

        {/* Unavailable overlay */}
        {isUnavailable && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center rounded-xl">
            <span className="bg-neutral-900 text-white px-3 py-1 rounded-full text-[11px] font-semibold">
              {tt('unavailable')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
