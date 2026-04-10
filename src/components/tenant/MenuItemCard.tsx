'use client';

import { Plus, Utensils, Martini, ChevronDown, AlertTriangle, Star } from 'lucide-react';
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

    // No toast per UberEats pattern - cart badge update is sufficient feedback
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

  // Compute "new" flag: created within the last 14 days.
  // Date.now() is impure so we compute once on mount via useEffect.
  const [isNew, setIsNew] = useState(false);
  /* eslint-disable react-hooks/set-state-in-effect */
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
  const hasModifiersOrVariants =
    (item.modifiers && item.modifiers.length > 0) ||
    (item.price_variants && item.price_variants.length > 0);

  return (
    <div
      className={cn(
        'relative flex bg-white cursor-pointer active:bg-[#FAFAFA] transition-colors border-b border-[#F0F0F0] last:border-b-0',
        isUnavailable && 'opacity-50',
      )}
      onClick={onOpenDetail}
    >
      {/* TEXT - Left side */}
      <div className="flex-1 min-w-0 p-3 flex flex-col justify-between">
        <div>
          {/* Badges row: POPULAR / NEW / VEGGIE / SPICY */}
          {(item.is_featured || isNew || item.is_vegetarian || item.is_spicy) && (
            <div className="flex flex-wrap items-center gap-1 mb-1">
              {item.is_featured && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 500,
                    letterSpacing: '1px',
                    color: '#737373',
                    backgroundColor: '#F6F6F6',
                    padding: '2px 6px',
                    borderRadius: '8px',
                    lineHeight: 1.4,
                  }}
                >
                  {tt('popularBadge')}
                </span>
              )}
              {isNew && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 500,
                    letterSpacing: '1px',
                    color: '#737373',
                    backgroundColor: '#F6F6F6',
                    padding: '2px 6px',
                    borderRadius: '8px',
                    lineHeight: 1.4,
                  }}
                >
                  {tt('newBadge')}
                </span>
              )}
              {item.is_vegetarian && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 500,
                    letterSpacing: '1px',
                    color: '#737373',
                    backgroundColor: '#F6F6F6',
                    padding: '2px 6px',
                    borderRadius: '8px',
                    lineHeight: 1.4,
                  }}
                >
                  {tt('veggieBadge')}
                </span>
              )}
              {item.is_spicy && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 500,
                    letterSpacing: '1px',
                    color: '#737373',
                    backgroundColor: '#F6F6F6',
                    padding: '2px 6px',
                    borderRadius: '8px',
                    lineHeight: 1.4,
                  }}
                >
                  {tt('spicyBadge')}
                </span>
              )}
            </div>
          )}
          {/* Category label */}
          {category && (
            <span
              className="text-[11px] font-medium uppercase leading-[1.4] tracking-[1px]"
              style={{ color: '#B0B0B0' }}
            >
              {category}
            </span>
          )}

          {/* Item name - 16px SemiBold #1A1A1A max 2 lines */}
          <h3
            className="text-base font-semibold leading-[1.4] line-clamp-2 mt-0.5"
            style={{ color: '#1A1A1A' }}
          >
            {getTranslatedContent(language, item.name, item.name_en)}
          </h3>

          {/* Description - 13px Regular #737373 max 2 lines */}
          {description && (
            <p
              className="text-[13px] font-normal leading-[1.4] line-clamp-2 mt-1"
              style={{ color: '#737373' }}
            >
              {description}
            </p>
          )}

          {/* Rating row - renders when rating data is available */}
          {item.rating != null && item.rating > 0 && (
            <div className="flex items-center gap-1 mt-1.5">
              <Star className="w-3 h-3 fill-[#FFB800]" style={{ color: '#FFB800' }} />
              <span className="text-[13px] font-medium leading-[1.4]" style={{ color: '#1A1A1A' }}>
                {item.rating.toFixed(1)}
              </span>
              {item.rating_count != null && (
                <span
                  className="text-[13px] font-normal leading-[1.4]"
                  style={{ color: '#B0B0B0' }}
                >
                  ({item.rating_count}+)
                </span>
              )}
            </div>
          )}
        </div>

        {/* Bottom section: price, badges, variants */}
        <div className="mt-2">
          <div className="flex items-center flex-wrap gap-2">
            {/* Price - 15px Bold #1A1A1A (NOT green) */}
            <span className="text-[15px] font-bold leading-[1.4]" style={{ color: '#1A1A1A' }}>
              {formattedPrice}
            </span>

            {item.allergens && item.allergens.length > 0 && (
              <span
                className="inline-flex items-center gap-0.5 text-[11px] px-2 py-0.5 rounded-lg"
                style={{ backgroundColor: '#F6F6F6', color: '#737373' }}
                title={item.allergens.join(', ')}
              >
                <AlertTriangle className="w-3 h-3" />
              </span>
            )}
          </div>

          {hasModifiersOrVariants && (
            <span
              className="text-[11px] font-medium leading-[1.4] mt-1 block"
              style={{ color: '#B0B0B0' }}
            >
              {tt('customizable')}
            </span>
          )}

          {/* Variant dropdown */}
          {hasVariants && (
            <div className="mt-2 relative" ref={dropdownRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowVariantDropdown(!showVariantDropdown);
                }}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors bg-[#E6F9F0]"
                style={{ color: '#06C167' }}
              >
                {getVariantName(selectedVariant!)}
                <ChevronDown
                  className={cn(
                    'w-3 h-3 transition-transform',
                    showVariantDropdown && 'rotate-180',
                  )}
                />
              </button>
              {showVariantDropdown && (
                <div className="absolute top-full left-0 mt-1 bg-white rounded-xl border border-[#EEEEEE] py-1 z-20 min-w-[160px]">
                  {item.price_variants?.map((variant) => (
                    <button
                      key={variant.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedVariant(variant);
                        setShowVariantDropdown(false);
                      }}
                      className={cn(
                        'w-full px-3 py-2.5 text-left text-sm',
                        selectedVariant?.id === variant.id
                          ? 'font-bold bg-[#E6F9F0]'
                          : 'text-[#737373]',
                      )}
                      style={selectedVariant?.id === variant.id ? { color: '#06C167' } : undefined}
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
      </div>

      {/* IMAGE - Right side: 90x90px */}
      <div className="relative w-[90px] h-[90px] flex-shrink-0 m-3">
        <div className="w-full h-full rounded-xl overflow-hidden bg-[#F6F6F6] flex items-center justify-center">
          {hasValidImage ? (
            <>
              {!imageLoaded && (
                <div className="absolute inset-0 animate-pulse bg-[#F6F6F6] rounded-xl" />
              )}
              <Image
                src={item.image_url!}
                alt={item.name}
                fill
                sizes="90px"
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
            <Martini className="w-8 h-8" style={{ color: '#B0B0B0' }} />
          ) : (
            <Utensils className="w-8 h-8" style={{ color: '#B0B0B0' }} />
          )}
        </div>

        {/* Add button or quantity badge - absolute bottom-right offset -8px */}
        <div
          className="absolute"
          style={{ bottom: '-8px', right: '-8px' }}
          onClick={(e) => e.stopPropagation()}
        >
          {cartItem ? (
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold text-white"
              style={{ backgroundColor: '#06C167' }}
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
              aria-label={tt('addShort')}
              className="w-7 h-7 rounded-full flex items-center justify-center focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-85 transition-transform"
              style={{ backgroundColor: '#06C167' }}
            >
              <Plus className="w-4 h-4 text-white" />
            </button>
          ) : null}
        </div>

        {/* Unavailable overlay */}
        {isUnavailable && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center rounded-xl">
            <span
              className="px-3 py-1 rounded-full text-[11px] font-semibold text-white"
              style={{ backgroundColor: '#1A1A1A' }}
            >
              {tt('unavailable')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
