'use client';

import { toast } from 'sonner';
import { Plus, Minus, Leaf, Flame, Utensils, Martini, ChevronDown } from 'lucide-react';
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
  const { addToCart, updateQuantity } = useCartActions();
  const { items } = useCartData();
  const tt = useTranslations('tenant');
  const { resolveAndFormatPrice } = useDisplayCurrency();
  const [, setIsAnimating] = useState(false);
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
    toast.success(`${item.name} ajoute au panier`);
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
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '16px',
        position: 'relative',
        padding: '16px',
        cursor: 'pointer',
        borderBottom: '1px solid var(--app-border)',
        opacity: isUnavailable ? 0.5 : 1,
      }}
    >
      {/* TEXT CONTENT - Left */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: '4px' }}>
          <h3
            style={{
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--app-text)',
              lineHeight: 1.3,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {getTranslatedContent(language, item.name, item.name_en)}
          </h3>
          <div style={{ display: 'flex', gap: '4px', flexShrink: 0, marginTop: '2px' }}>
            {item.is_vegetarian && (
              <Leaf style={{ width: '12px', height: '12px', color: '#22c55e' }} />
            )}
            {item.is_spicy && <Flame style={{ width: '12px', height: '12px', color: '#ef4444' }} />}
          </div>
        </div>

        <p
          style={{
            fontSize: '13px',
            color: 'var(--app-text-secondary)',
            lineHeight: 1.4,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            marginBottom: '8px',
          }}
        >
          {getTranslatedContent(language, item.description || '', item.description_en)}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--tenant-primary)' }}>
            {currentPrice > 0
              ? resolveAndFormatPrice(
                  currentPrice,
                  selectedVariant?.prices || item.prices,
                  currency,
                )
              : tt('included')}
          </span>
          {((item.modifiers && item.modifiers.length > 0) ||
            (item.price_variants && item.price_variants.length > 0)) && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-app-elevated text-app-text-secondary">
              Personnalisable
            </span>
          )}
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
              <div className="absolute top-full left-0 mt-1 bg-app-card rounded-lg border border-app-border py-1 z-20 shadow-lg min-w-[140px]">
                {item.price_variants?.map((variant) => (
                  <button
                    key={variant.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedVariant(variant);
                      setShowVariantDropdown(false);
                    }}
                    className={cn(
                      'w-full px-3 py-2 text-left text-xs hover:bg-app-elevated',
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

      {/* IMAGE SECTION - Right (with floating +/- on corner) */}
      <div
        style={{
          position: 'relative',
          flexShrink: 0,
          width: 'clamp(60px, 20vw, 80px)',
          height: 'clamp(60px, 20vw, 80px)',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '8px',
            overflow: 'hidden',
            backgroundColor: 'var(--app-elevated)',
            border: '1px solid var(--app-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {hasValidImage ? (
            <>
              {!imageLoaded && (
                <div className="absolute inset-0 animate-pulse bg-app-elevated rounded-lg" />
              )}
              <Image
                src={item.image_url!}
                alt={item.name}
                fill
                sizes="80px"
                className={cn(
                  'object-cover !relative transition-opacity duration-300',
                  imageLoaded ? 'opacity-100' : 'opacity-0',
                )}
                style={{ objectFit: 'cover' }}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
                priority={priority}
              />
            </>
          ) : isDrinkCategory ? (
            <Martini style={{ width: '24px', height: '24px', color: 'var(--app-text-muted)' }} />
          ) : (
            <Utensils style={{ width: '24px', height: '24px', color: 'var(--app-text-muted)' }} />
          )}
        </div>

        {/* Floating add/counter on bottom-right of image */}
        <div
          style={{ position: 'absolute', bottom: '-4px', right: '-4px' }}
          onClick={(e) => e.stopPropagation()}
        >
          {cartItem ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: 'var(--app-card)',
                borderRadius: '9999px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                border: '1px solid var(--app-border)',
                padding: '2px',
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateQuantity(getCartKey(), cartItem.quantity - 1);
                }}
                aria-label="Diminuer la quantite"
                className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-app-elevated active:scale-90 transition-all focus-visible:ring-2 focus-visible:ring-offset-2"
                style={{
                  color: 'var(--tenant-primary)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <Minus style={{ width: '16px', height: '16px' }} strokeWidth={2.5} />
              </button>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: 'var(--app-text)',
                  width: '24px',
                  textAlign: 'center',
                }}
              >
                {cartItem.quantity}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateQuantity(getCartKey(), cartItem.quantity + 1);
                }}
                aria-label="Augmenter la quantite"
                className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-app-elevated active:scale-90 transition-all focus-visible:ring-2 focus-visible:ring-offset-2"
                style={{
                  color: 'var(--tenant-primary)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <Plus style={{ width: '16px', height: '16px' }} strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAdd();
              }}
              disabled={isUnavailable}
              aria-label="Ajouter au panier"
              className="focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                backgroundColor: 'var(--app-card)',
                border: '2px solid var(--app-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                cursor: 'pointer',
                color: 'var(--tenant-primary)',
              }}
            >
              <Plus style={{ width: '20px', height: '20px' }} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      {/* Unavailable overlay */}
      {isUnavailable && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'color-mix(in srgb, var(--app-card) 40%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              backgroundColor: 'rgba(0,0,0,0.7)',
              color: 'var(--app-bg)',
              padding: '4px 8px',
              borderRadius: '4px',
              textAlign: 'center',
            }}
          >
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                display: 'block',
              }}
            >
              {tt('unavailable')}
            </span>
            <span
              style={{
                fontSize: '9px',
                fontWeight: 400,
                opacity: 0.85,
                display: 'block',
                marginTop: '1px',
              }}
            >
              {tt('temporarilyUnavailable')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
